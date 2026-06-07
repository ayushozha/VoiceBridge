"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Math helpers                                                         */
/* ------------------------------------------------------------------ */
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/*  Orb colour ramp: warm bottom → cool top                            */
/* ------------------------------------------------------------------ */
const RAMP: [number, [number, number, number]][] = [
  [0.0, [1.0, 0.45, 0.05]],
  [0.16, [1.0, 0.16, 0.3]],
  [0.34, [0.97, 0.1, 0.56]],
  [0.54, [0.55, 0.18, 1.0]],
  [0.74, [0.22, 0.34, 1.0]],
  [1.0, [0.2, 0.72, 1.0]],
];
function orbColor(t: number): [number, number, number] {
  t = clamp(t);
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [a, ca] = RAMP[i]!;
    const [b, cb] = RAMP[i + 1]!;
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
    }
  }
  return RAMP[RAMP.length - 1]![1];
}

/* ------------------------------------------------------------------ */
/*  Disc sprite texture for Points                                      */
/* ------------------------------------------------------------------ */
function makeDiscTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const grd = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.85)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

/* ------------------------------------------------------------------ */
/*  Orb builder                                                         */
/* ------------------------------------------------------------------ */
function buildOrb(disc: THREE.Texture) {
  const group = new THREE.Group();

  // subtle glow shell
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0x1b2552,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  group.add(glow);

  const N = 9000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const seed = new Float32Array(N * 2);
  const base = new Float32Array(N);

  function turb(th: number, ph: number) {
    return (
      0.5 * Math.sin(3 * th + 1.7 * ph) +
      0.32 * Math.sin(5 * ph - 2 * th + 1.1) +
      0.22 * Math.sin(8 * th + 3 * ph) +
      0.16 * Math.sin(11 * ph - 5 * th)
    );
  }

  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    const th = u * Math.PI * 2;
    const ph = Math.acos(2 * v - 1);
    let n = turb(th, ph);
    n = (n + 1.36) / 2.72;
    let spray = Math.pow(Math.max(0, n - 0.42) / 0.58, 2.2);
    spray *= 0.35 + 0.75 * Math.pow(Math.abs(Math.cos(ph)), 1.6);
    const r = 0.96 + spray * 0.95 + (Math.random() - 0.5) * 0.02;
    const sp = Math.sin(ph);
    const x = r * sp * Math.cos(th);
    const y = r * Math.cos(ph);
    const z = r * sp * Math.sin(th);
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    seed[i * 2] = th;
    seed[i * 2 + 1] = ph;
    base[i] = spray;

    const tcol = (y / r + 1) / 2;
    const c = orbColor(tcol);
    const bright = 1.0 + Math.random() * 0.2;
    let rr = c[0] * bright, gg = c[1] * bright, bb = c[2] * bright;
    const lum = 0.3 * rr + 0.59 * gg + 0.11 * bb;
    const S = 1.55;
    rr = Math.max(0, lum + (rr - lum) * S);
    gg = Math.max(0, lum + (gg - lum) * S);
    bb = Math.max(0, lum + (bb - lum) * S);
    if (spray > 0.7) {
      const w = (spray - 0.7) * 0.3;
      rr += w; gg += w; bb += w;
    }
    col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.035,
    map: disc,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  group.add(pts);

  // bright drifting sparks around the rim
  const SN = 520;
  const spPos = new Float32Array(SN * 3);
  const spCol = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const r = 1.15 + Math.random() * 0.5;
    const sp = Math.sin(ph);
    spPos[i * 3] = r * sp * Math.cos(th);
    spPos[i * 3 + 1] = r * Math.cos(ph);
    spPos[i * 3 + 2] = r * sp * Math.sin(th);
    const c = orbColor((Math.cos(ph) + 1) / 2);
    spCol[i * 3] = c[0] + 0.12; spCol[i * 3 + 1] = c[1] + 0.12; spCol[i * 3 + 2] = c[2] + 0.12;
  }
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const sparks = new THREE.Points(
    spGeo,
    new THREE.PointsMaterial({
      size: 0.045,
      map: disc,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(sparks);

  return {
    group,
    glow,
    pts,
    mat,
    sparks,
    update(t: number, energy: number) {
      group.rotation.y = t * 0.12;
      group.rotation.x = Math.sin(t * 0.25) * 0.12;
      sparks.rotation.y = -t * 0.08;
      const breathe = 1 + Math.sin(t * 0.9) * 0.02 + energy * 0.05;
      pts.scale.setScalar(breathe);
      mat.size = 0.035 + energy * 0.012;
      glow.material.opacity = 0.06 + energy * 0.08;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.06 + energy * 0.08;
      glow.scale.setScalar(1 + Math.sin(t * 1.1) * 0.04 + energy * 0.1);
    },
    dispose() {
      geo.dispose(); mat.dispose(); spGeo.dispose(); sparks.material.dispose();
      (glow.material as THREE.Material).dispose(); glow.geometry.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Full 3-D scene                                                       */
/* ------------------------------------------------------------------ */
function createScene(host: HTMLElement) {
  let width = host.clientWidth || window.innerWidth;
  let height = host.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02030a, 0.018);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 320);
  camera.position.set(0, 0, 6.5);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  host.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);
  const disc = makeDiscTexture();

  const Z_NEAR = 13;
  const Z_FAR = -165;
  const SPAN = Z_NEAR - Z_FAR;

  /* --- digital tunnel --- */
  const tunnel = new THREE.Group();
  root.add(tunnel);

  const glyphColors = [0xff3b5c, 0x2f6bff, 0x39c0ff, 0xff2d6f, 0x8b6bff, 0x22e0c0];
  const GLYPHS = 440;
  type GlyphMesh = THREE.Mesh & { userData: { ang: number; rad: number; spin: number; tw: number } };
  const glyphs: GlyphMesh[] = [];

  for (let i = 0; i < GLYPHS; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 2.6 + Math.random() * 2.7;
    const isRing = Math.random() < 0.16;
    const geo = isRing
      ? new THREE.RingGeometry(0.06, 0.12, 4)
      : new THREE.PlaneGeometry(0.14 + Math.random() * 0.16, 0.14 + Math.random() * 0.16);
    const color = glyphColors[i % glyphColors.length] ?? 0x39c0ff;
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ) as unknown as GlyphMesh;
    m.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, Z_NEAR - Math.random() * SPAN);
    m.rotation.z = Math.random() * Math.PI;
    m.userData = { ang, rad, spin: (Math.random() - 0.5) * 0.04, tw: Math.random() * 6 };
    tunnel.add(m);
    glyphs.push(m);
  }

  function makeDust(count: number, rMin: number, rMax: number, size: number, color: number, opacity: number) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = Math.sin(a) * r; p[i * 3 + 2] = Z_NEAR - Math.random() * SPAN;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, map: disc, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  const dotsCore = makeDust(1400, 0.2, 3.0, 0.05, 0x9fd4ff, 0.6);
  const dotsWall = makeDust(900, 2.8, 5.6, 0.07, 0x6fa0ff, 0.5);
  root.add(dotsCore, dotsWall);

  // warp streaks
  const STREAKS = 260;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(STREAKS * 6);
  const sBase: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < STREAKS; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 1.5 + Math.random() * 5;
    sBase.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, z: Z_NEAR - Math.random() * SPAN });
  }
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const streaks = new THREE.LineSegments(
    sGeo,
    new THREE.LineBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  root.add(streaks);

  // starfield
  const starGeo = new THREE.BufferGeometry();
  const stars = 1400;
  const stP = new Float32Array(stars * 3);
  for (let i = 0; i < stars; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * 30;
    stP[i * 3] = Math.cos(a) * r; stP[i * 3 + 1] = Math.sin(a) * r; stP[i * 3 + 2] = Z_NEAR - Math.random() * SPAN * 1.5;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(stP, 3));
  const starField = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.05, map: disc, color: 0xcfe4ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(starField);

  // THE ORB — far down the tunnel
  const orbAnchor = new THREE.Group();
  orbAnchor.position.set(0, 0, -9);
  root.add(orbAnchor);
  const orb = buildOrb(disc);
  orbAnchor.add(orb.group);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  const state = { progress: 0, vel: 0, px: 0, py: 0, listening: true };
  let streamZ = 0;

  function onPointer(e: PointerEvent) {
    const r = host.getBoundingClientRect();
    state.px = (e.clientX - r.left) / r.width - 0.5;
    state.py = (e.clientY - r.top) / r.height - 0.5;
  }
  host.addEventListener("pointermove", onPointer, { passive: true });

  function resize() {
    width = host.clientWidth || window.innerWidth;
    height = host.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    const t = clock.getElapsedTime();
    const p = state.progress;
    const warp = smooth(0.05, 0.62, p);
    const arrival = smooth(0.7, 1.0, p);
    const appr = p * p * (3 - 2 * p);
    const listen = state.listening
      ? arrival * (0.18 + 0.32 * Math.max(0, Math.sin(t * 5.5)) * (0.5 + 0.5 * Math.sin(t * 1.7)))
      : 0;
    const energy = clamp(0.25 + warp * 0.5 + Math.abs(state.vel) * 22 + arrival * 0.3 + listen);
    const speed = 0.05 + warp * 1.15 + Math.abs(state.vel) * 24;
    streamZ += speed;

    (scene.fog as THREE.FogExp2).density = lerp(0.02, 0.01, warp) * (1 - arrival * 0.5);

    root.rotation.y += (state.px * 0.14 - root.rotation.y) * 0.03;
    root.rotation.x += (-state.py * 0.07 - root.rotation.x) * 0.03;
    const camZ = lerp(7, -5.6, appr);
    camera.position.z += (camZ - camera.position.z) * 0.06;
    camera.position.x += (state.px * 0.7 - camera.position.x) * 0.04;
    camera.position.y += (-state.py * 0.5 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, -9);

    tunnel.rotation.z = t * (0.02 + warp * 0.18);
    glyphs.forEach((m) => {
      let z = m.position.z + speed;
      if (z > Z_NEAR) z -= SPAN;
      m.position.z = z;
      m.rotation.z += m.userData.spin * (1 + warp * 4);
      const depth = (z - Z_FAR) / SPAN;
      (m.material as THREE.MeshBasicMaterial).opacity =
        (0.5 + warp * 0.6) *
        smooth(0, 0.08, depth) *
        (1 - smooth(0.92, 1, depth)) *
        (1 - arrival) *
        (0.55 + 0.45 * Math.sin(t * 3 + m.userData.tw));
    });

    [dotsCore, dotsWall].forEach((d, idx) => {
      const attr = d.geometry.attributes["position"] as THREE.BufferAttribute | undefined;
      if (!attr) return;
      const a = attr.array as Float32Array;
      const sp = speed * (idx === 0 ? 1.0 : 0.7);
      for (let i = 2; i < a.length; i += 3) { a[i]! += sp; if (a[i]! > Z_NEAR) a[i]! -= SPAN; }
      attr.needsUpdate = true;
      (d.material as THREE.PointsMaterial).opacity = (idx === 0 ? 0.6 : 0.45) * (1 - arrival);
    });

    const streakLen = 0.25 + warp * 8 + Math.abs(state.vel) * 130;
    const sAttr = sGeo.attributes["position"] as THREE.BufferAttribute | undefined;
    if (sAttr) {
      const arr = sAttr.array as Float32Array;
      for (let i = 0; i < STREAKS; i++) {
        const b = sBase[i]!;
        let z = b.z + ((streamZ * 1.2) % SPAN);
        if (z > Z_NEAR) z -= SPAN;
        const o = i * 6;
        arr[o] = b.x; arr[o + 1] = b.y; arr[o + 2] = z;
        arr[o + 3] = b.x; arr[o + 4] = b.y; arr[o + 5] = z - streakLen;
      }
      sAttr.needsUpdate = true;
    }
    (streaks.material as THREE.LineBasicMaterial).opacity = (0.04 + warp * 0.55) * (1 - arrival);

    const saAttr = starGeo.attributes["position"] as THREE.BufferAttribute | undefined;
    if (saAttr) {
      const sa = saAttr.array as Float32Array;
      for (let i = 2; i < sa.length; i += 3) { sa[i]! += speed * 0.5; if (sa[i]! > Z_NEAR) sa[i]! -= SPAN * 1.5; }
      saAttr.needsUpdate = true;
    }
    (starField.material as THREE.PointsMaterial).opacity = lerp(0.5, 0.12, arrival);

    orb.update(t, energy);
    orbAnchor.scale.setScalar(lerp(1.0, 1.55, arrival) + warp * 0.08);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setProgress(v: number) { state.progress = clamp(v); },
    setVelocity(v: number) { state.vel = v; },
    setListening(b: boolean) { state.listening = b; },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onPointer);
      renderer.dispose();
      disc.dispose();
      orb.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/*  React component                                                     */
/* ------------------------------------------------------------------ */
export function CommandOSLanding() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createScene> | null>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [listening, setListeningState] = useState(true);

  // boot Three.js scene
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const exp = createScene(host);
    sceneRef.current = exp;
    return () => { exp.dispose(); sceneRef.current = null; };
  }, []);

  // scroll → progress
  useEffect(() => {
    let raf = 0;
    let target = 0;
    let vel = 0;
    let lastTarget = 0;

    function readScroll() {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      target = clamp(window.scrollY / max);
    }

    function loop() {
      progressRef.current += (target - progressRef.current) * 0.09;
      vel = vel * 0.8 + (target - lastTarget) * 0.2;
      lastTarget = target;
      sceneRef.current?.setProgress(progressRef.current);
      sceneRef.current?.setVelocity(vel);
      setProgress(progressRef.current);
      raf = requestAnimationFrame(loop);
    }

    window.scrollTo(0, 0);
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", readScroll);
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", readScroll);
    };
  }, []);

  // sync listening to scene
  useEffect(() => {
    sceneRef.current?.setListening(listening);
  }, [listening]);

  const introOpacity = clamp(1 - progress * 5.5);
  const introY = -progress * 40;
  const introBlur = progress * 7;
  const hintOpacity = clamp(1 - progress * 7);
  const midcueOpacity = smooth(0.14, 0.3, progress) * (1 - smooth(0.5, 0.64, progress));
  const arrivalA = smooth(0.72, 0.97, progress);
  const railPct = Math.round(progress * 100);
  const flashOpacity = Math.exp(-Math.pow((progress - 0.5) / 0.05, 2)) * 0.45;

  return (
    <main
      style={{
        position: "relative",
        height: "400vh",
        fontFamily: '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {/* sticky stage */}
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: "radial-gradient(circle at 50% 50%, #0a0f24 0%, #04060f 48%, #01020a 100%)",
        }}
      >
        {/* Three.js canvas host */}
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

        {/* flash for mid-tunnel */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "#cfe0ff",
            opacity: flashOpacity,
            mixBlendMode: "screen",
          }}
        />

        {/* vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            boxShadow: "inset 0 0 26vmax rgba(0,0,0,0.55)",
          }}
        />

        {/* overlay */}
        <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none" }}>

          {/* nav */}
          <nav
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "24px clamp(20px, 4vw, 52px)",
              pointerEvents: "auto",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: "0.01em",
                textDecoration: "none",
                color: "#eaf0ff",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background:
                    "conic-gradient(from 210deg, #ff7a1a, #ff2d8f, #8b5bff, #3a6cff, #39c0ff, #ff7a1a)",
                  boxShadow: "0 0 16px rgba(255,45,143,0.55)",
                  animation: "qos-spin 11s linear infinite",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              CommandOS
            </Link>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "clamp(16px, 2.4vw, 30px)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <Link href="/console" style={{ textDecoration: "none", color: "#8ea2c8", transition: "color 0.25s" }}>
                Voice OS
              </Link>
              <Link href="/portal" style={{ textDecoration: "none", color: "#8ea2c8", transition: "color 0.25s" }}>
                Command Center
              </Link>
            </div>
          </nav>

          {/* intro headline */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "clamp(96px, 18vh, 200px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              padding: "0 22px",
              opacity: introOpacity,
              transform: `translateY(${introY}px)`,
              filter: `blur(${introBlur}px)`,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                letterSpacing: "0.42em",
                textTransform: "uppercase",
                fontSize: "clamp(10px, 1vw, 12px)",
                color: "#39c0ff",
                marginBottom: 18,
                opacity: 0.85,
              }}
            >
              Conversational access
            </div>
            <h1
              style={{
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                fontSize: "clamp(34px, 5.4vw, 72px)",
                background: "linear-gradient(100deg, #fff 0%, #cfe0ff 40%, #9fb6ff 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                margin: 0,
              }}
            >
              Every voice, online.
            </h1>
          </div>

          {/* scroll hint */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "clamp(26px, 7vh, 60px)",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 9,
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "#8ea2c8",
              opacity: hintOpacity,
              pointerEvents: "none",
            }}
          >
            <span>scroll in</span>
            <span
              style={{
                width: 16,
                height: 16,
                borderRight: "2px solid #39c0ff",
                borderBottom: "2px solid #39c0ff",
                transform: "rotate(45deg)",
                animation: "qos-bob 1.8s ease-in-out infinite",
              }}
            />
          </div>

          {/* mid-tunnel cue */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "clamp(28px, 7vh, 60px)",
              transform: "translateX(-50%)",
              fontWeight: 600,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              fontSize: 11,
              color: "rgba(180,205,255,0.85)",
              opacity: midcueOpacity,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: 0,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#39c0ff",
                margin: "0 9px 1px",
                boxShadow: "0 0 9px #39c0ff",
                animation: "qos-pulse 1.4s ease-in-out infinite",
              }}
            />
            through the tunnel
            <span
              style={{
                display: "inline-block",
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#39c0ff",
                margin: "0 9px 1px",
                boxShadow: "0 0 9px #39c0ff",
                animation: "qos-pulse 1.4s ease-in-out infinite",
              }}
            />
          </div>

          {/* arrival CTA */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              textAlign: "center",
              padding: "0 24px clamp(46px, 10vh, 96px)",
              opacity: arrivalA,
              transform: `translateY(${(1 - arrivalA) * 26}px)`,
              pointerEvents: arrivalA > 0.6 ? "auto" : "none",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                letterSpacing: "0.36em",
                textTransform: "uppercase",
                fontSize: 12,
                color: "#39c0ff",
                marginBottom: 22,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#ff2d8f",
                  boxShadow: "0 0 12px #ff2d8f",
                  animation: "qos-pulse 1.5s ease-in-out infinite",
                  display: "inline-block",
                }}
              />
              Agentic OS · Online
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Link
                href="/console"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 13,
                  fontWeight: 600,
                  fontSize: 16,
                  color: "#fff",
                  textDecoration: "none",
                  padding: "16px 26px 16px 18px",
                  borderRadius: 999,
                  background: "linear-gradient(120deg, rgba(255,45,143,0.22), rgba(58,108,255,0.22))",
                  boxShadow: "inset 0 0 0 1px rgba(180,205,255,0.32), 0 18px 60px rgba(120,60,255,0.3)",
                  backdropFilter: "blur(14px)",
                  transition: "transform 0.25s, box-shadow 0.25s",
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(135deg, #ff2d8f, #3a6cff)",
                    boxShadow: "0 0 18px rgba(255,45,143,0.5)",
                    animation: "qos-ring 2.4s ease-out infinite",
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                </span>
                Voice OS
              </Link>
              <Link
                href="/portal"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontWeight: 600,
                  fontSize: 16,
                  color: "#eaf0ff",
                  textDecoration: "none",
                  padding: "16px 26px",
                  borderRadius: 999,
                  background: "rgba(22,32,58,0.5)",
                  boxShadow: "inset 0 0 0 1px rgba(140,170,255,0.2), 0 10px 30px rgba(0,0,0,0.4)",
                  backdropFilter: "blur(14px)",
                  transition: "transform 0.25s",
                }}
              >
                Command Center
              </Link>
            </div>
          </div>

          {/* depth rail */}
          <div
            style={{
              position: "absolute",
              right: "clamp(16px, 2.4vw, 30px)",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              color: "#8ea2c8",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", opacity: 0.7 }}>
              {String(railPct).padStart(2, "0")}
            </span>
            <div style={{ width: 2, height: "32vh", borderRadius: 2, background: "currentColor", opacity: 0.2, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  borderRadius: 2,
                  background: "linear-gradient(#39c0ff, #ff2d8f)",
                  boxShadow: "0 0 10px #ff2d8f",
                  height: `${progress * 100}%`,
                }}
              />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", opacity: 0.7 }}>∞</span>
          </div>

          {/* listening control */}
          <div
            style={{
              position: "absolute",
              left: "clamp(16px, 4vw, 52px)",
              bottom: "clamp(18px, 4vh, 34px)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              pointerEvents: "auto",
            }}
          >
            <button
              onClick={() => setListeningState((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                border: "none",
                padding: "9px 18px 9px 9px",
                borderRadius: 999,
                color: "#eaf0ff",
                background: "rgba(22,32,58,0.5)",
                boxShadow: "inset 0 0 0 1px rgba(140,170,255,0.2), 0 10px 30px rgba(0,0,0,0.4)",
                backdropFilter: "blur(14px)",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  background: listening
                    ? "linear-gradient(135deg, #ff2d8f, #3a6cff)"
                    : "rgba(120,140,180,0.4)",
                  boxShadow: listening ? "0 0 16px rgba(255,45,143,0.5)" : "none",
                  animation: listening ? "qos-ring 2.2s ease-out infinite" : "none",
                  flexShrink: 0,
                }}
              >
                {listening ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="3" x2="21" y2="21" />
                    <path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                )}
              </span>
              {listening ? "Listening" : "Muted"}
            </button>
          </div>
        </div>
      </div>

      {/* global keyframes injected via style tag */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes qos-spin { to { transform: rotate(360deg); } }
        @keyframes qos-bob  { 0%,100%{ transform:translateY(0) rotate(45deg); opacity:.4; } 50%{ transform:translateY(6px) rotate(45deg); opacity:1; } }
        @keyframes qos-pulse{ 0%,100%{ opacity:.3; } 50%{ opacity:1; } }
        @keyframes qos-ring { 0%{ box-shadow:0 0 0 0 rgba(255,45,143,.45); } 70%{ box-shadow:0 0 0 16px rgba(255,45,143,0); } 100%{ box-shadow:0 0 0 0 rgba(255,45,143,0); } }
      `}</style>
    </main>
  );
}
