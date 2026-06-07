"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";

type SceneProps = {
  progressRef: MutableRefObject<number>;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function eased(value: number) {
  return value * value * (3 - 2 * value);
}

function createRing(radius: number, tube: number, color: number, opacity: number) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 112, 10),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function createArc(radius: number, start: number, length: number, color: number) {
  const points: THREE.Vector3[] = [];
  const segments = 64;
  for (let i = 0; i <= segments; i += 1) {
    const angle = start + (length * i) / segments;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function createHologram(width: number, height: number, color: number) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(width, height);
  const panel = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(panel, frame);
  return group;
}

function createStarField(count: number, depth: number, spread: number) {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * spread;
    positions.push(
      Math.cos(angle) * radius,
      (Math.random() - 0.5) * spread * 0.95,
      -Math.random() * depth,
    );
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xdff8ff,
      size: 0.026,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function CommandPortalScene({ progressRef }: SceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const container = host;

    let width = container.clientWidth;
    let height = container.clientHeight;
    let pointerX = 0;
    let pointerY = 0;
    let animationFrame = 0;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x061322, 8, 28);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 80);
    camera.position.set(0, 0.2, 10.5);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    const tunnel = new THREE.Group();
    root.add(tunnel);

    for (let i = 0; i < 28; i += 1) {
      const ring = createRing(0.62 + i * 0.16, i % 4 === 0 ? 0.009 : 0.004, i % 2 === 0 ? 0x54dcff : 0x8a7cff, 0.28);
      ring.position.z = -i * 0.48;
      ring.rotation.x = Math.PI / 2;
      ring.userData.spin = 0.0016 + i * 0.00022;
      ring.userData.baseZ = ring.position.z;
      tunnel.add(ring);
    }

    const jarvis = new THREE.Group();
    root.add(jarvis);

    const portalMouth = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 1.12, 128),
      new THREE.MeshBasicMaterial({
        color: 0x7be8ff,
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    jarvis.add(portalMouth);

    const jarvisRings = [
      createRing(1.12, 0.008, 0x54dcff, 0.62),
      createRing(1.42, 0.006, 0xc6a3ff, 0.46),
      createRing(1.78, 0.004, 0xffd66b, 0.34),
    ];
    jarvisRings.forEach((ring, index) => {
      ring.rotation.x = index === 0 ? 0.35 : -0.45 + index * 0.22;
      ring.rotation.y = index === 1 ? 0.62 : -0.16;
      jarvis.add(ring);
    });

    const arcs = new THREE.Group();
    for (let i = 0; i < 8; i += 1) {
      const arc = createArc(0.82 + i * 0.17, i * 0.7, Math.PI * (0.32 + (i % 3) * 0.08), i % 2 === 0 ? 0x5ee7ff : 0xffffff);
      arc.rotation.z = i * 0.34;
      arc.rotation.x = i % 2 === 0 ? 0.28 : -0.35;
      arcs.add(arc);
    }
    jarvis.add(arcs);

    const commandCore = createRing(0.16, 0.012, 0xffffff, 0.9);
    commandCore.rotation.x = Math.PI / 2;
    jarvis.add(commandCore);

    const orbitingDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 32, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffcc55,
        transparent: true,
        opacity: 0.96,
      }),
    );
    jarvis.add(orbitingDot);

    const holograms = new THREE.Group();
    const hologramColors = [0x54dcff, 0x98f4ff, 0x8a7cff, 0x34d9a5, 0xffd66b];
    for (let i = 0; i < hologramColors.length; i += 1) {
      const angle = (i / hologramColors.length) * Math.PI * 2 - Math.PI / 2;
      const panel = createHologram(1.04, 0.62, hologramColors[i] ?? 0x54dcff);
      panel.position.set(Math.cos(angle) * 2.85, Math.sin(angle) * 1.08, -0.72 - i * 0.14);
      panel.rotation.y = -Math.cos(angle) * 0.45;
      panel.rotation.x = Math.sin(angle) * 0.26;
      panel.userData.baseX = panel.position.x;
      panel.userData.baseY = panel.position.y;
      panel.userData.phase = i * 0.7;
      holograms.add(panel);
    }
    root.add(holograms);

    const streamGeometry = new THREE.BufferGeometry();
    const streamPoints: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2;
      streamPoints.push(0, 0, 0.05, Math.cos(angle) * 4.2, Math.sin(angle) * 1.75, -1.25);
    }
    streamGeometry.setAttribute("position", new THREE.Float32BufferAttribute(streamPoints, 3));
    const streams = new THREE.LineSegments(
      streamGeometry,
      new THREE.LineBasicMaterial({
        color: 0x66e9ff,
        transparent: true,
        opacity: 0.19,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    root.add(streams);

    const nearStars = createStarField(420, 16, 7.6);
    const deepStars = createStarField(720, 36, 15);
    scene.add(nearStars, deepStars);

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 5, 6);
    scene.add(key);
    const portalLight = new THREE.PointLight(0x6ce7ff, 22, 15);
    portalLight.position.set(0, 0, 2.5);
    scene.add(portalLight);

    function handlePointerMove(event: PointerEvent) {
      const rect = container.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width - 0.5;
      pointerY = (event.clientY - rect.top) / rect.height - 0.5;
    }

    function handleResize() {
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    window.addEventListener("resize", handleResize);
    container.addEventListener("pointermove", handlePointerMove, { passive: true });

    const clock = new THREE.Clock();

    function animate() {
      const elapsed = clock.getElapsedTime();
      const progress = progressRef.current;
      const warp = eased(clamp((progress - 0.08) / 0.78));
      const fold = eased(clamp((progress - 0.18) / 0.56));
      const world = eased(clamp((progress - 0.76) / 0.2));

      root.rotation.y += (pointerX * 0.24 - root.rotation.y) * 0.028;
      root.rotation.x += (-pointerY * 0.12 - root.rotation.x) * 0.028;
      root.position.z += (warp * 5.6 - root.position.z) * 0.045;
      root.scale.setScalar(1 + fold * 0.42 + Math.sin(elapsed * 0.9) * 0.01);

      tunnel.rotation.z = elapsed * (0.09 + warp * 0.95);
      tunnel.children.forEach((ringObject, index) => {
        const ring = ringObject as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
        const baseZ = ring.userData.baseZ as number;
        ring.rotation.z += (ring.userData.spin as number) * (1 + warp * 12);
        ring.position.z = baseZ + fold * index * 0.26 + Math.sin(elapsed * 1.4 + index * 0.2) * (0.04 + warp * 0.1);
        ring.scale.setScalar(1 + fold * 0.08 + Math.sin(elapsed + index) * 0.005);
        ring.material.opacity = 0.2 + warp * 0.42 + Math.sin(elapsed * 2 + index) * 0.04;
      });

      jarvis.rotation.z = elapsed * (0.16 + warp * 0.44);
      jarvis.rotation.y = Math.sin(elapsed * 0.35) * 0.18 + fold * 0.5;
      jarvis.scale.setScalar(1 + fold * 0.34);
      jarvisRings.forEach((ring, index) => {
        ring.rotation.z += (index % 2 === 0 ? 0.004 : -0.003) * (1 + warp * 8);
      });
      arcs.rotation.z = -elapsed * (0.42 + warp * 1.2);

      const satelliteAngle = elapsed * (1.7 + warp * 5);
      orbitingDot.position.set(
        Math.cos(satelliteAngle) * (1.55 + fold * 0.65),
        Math.sin(satelliteAngle * 1.12) * (0.58 + fold * 0.22),
        Math.sin(satelliteAngle) * 0.22,
      );
      orbitingDot.scale.setScalar(1 + Math.sin(elapsed * 5.5) * 0.16);

      commandCore.rotation.z = -elapsed * (0.8 + warp * 3.4);
      commandCore.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.18 + warp * 0.3);
      portalMouth.scale.setScalar(1 + world * 4.6);

      holograms.children.forEach((panel) => {
        const phase = panel.userData.phase as number;
        panel.position.x = (panel.userData.baseX as number) * (1 + fold * 0.9) + Math.sin(elapsed * 0.8 + phase) * 0.06;
        panel.position.y = (panel.userData.baseY as number) * (1 + fold * 0.42) + Math.cos(elapsed * 0.9 + phase) * 0.06;
        panel.position.z = -0.72 - phase * 0.2 - warp * 1.2;
        panel.rotation.z = Math.sin(elapsed * 0.5 + phase) * 0.04;
        panel.scale.setScalar(1 - world * 0.82);
      });

      streams.rotation.z = elapsed * (0.04 + warp * 0.42);
      (streams.material as THREE.LineBasicMaterial).opacity = 0.14 + warp * 0.32;

      nearStars.rotation.z = -elapsed * (0.012 + warp * 0.08);
      deepStars.rotation.z = elapsed * 0.006;
      nearStars.position.z = warp * 6;
      deepStars.position.z = warp * 12;
      (nearStars.material as THREE.PointsMaterial).size = 0.026 + warp * 0.032;

      camera.position.z += (10.5 - warp * 7.4 - camera.position.z) * 0.04;
      camera.position.y += (0.2 - warp * 0.08 + pointerY * 0.2 - camera.position.y) * 0.04;
      camera.position.x += (pointerX * (0.38 - warp * 0.32) - camera.position.x) * 0.04;
      camera.lookAt(0, 0, -2.6 - warp * 6);

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      tunnel.children.forEach((ringObject) => {
        const ring = ringObject as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
        ring.geometry.dispose();
        ring.material.dispose();
      });
      jarvis.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      holograms.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      streamGeometry.dispose();
      (streams.material as THREE.Material).dispose();
      nearStars.geometry.dispose();
      (nearStars.material as THREE.Material).dispose();
      deepStars.geometry.dispose();
      (deepStars.material as THREE.Material).dispose();
    };
  }, [progressRef]);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />;
}

export function CommandOSLanding() {
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;

    function updateProgress() {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const next = clamp(window.scrollY / maxScroll);
      progressRef.current = next;
      setProgress(next);
    }

    function handleScroll() {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateProgress);
    }

    updateProgress();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  const introOpacity = clamp(1 - progress * 3.4);
  const cueOpacity = clamp(1 - progress * 4.2);
  const destinationOpacity = clamp((progress - 0.74) / 0.18);
  const spaceOpacity = clamp((progress - 0.18) / 0.42);

  return (
    <main className="relative min-h-[260dvh] bg-[#f8fdff] text-[#071522]">
      <section className="sticky top-0 min-h-[100dvh] overflow-hidden">
        <div className="absolute inset-0 bg-[#f8fdff]" />
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: spaceOpacity,
            background:
              "radial-gradient(circle at 50% 45%, rgba(65, 229, 255, 0.28), rgba(9, 28, 52, 0.94) 45%, #020814 86%)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.92)_0%,rgba(220,250,255,0.78)_30%,rgba(240,244,255,0.3)_58%,transparent_82%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(7,21,34,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(7,21,34,0.08)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:radial-gradient(circle_at_center,black,transparent_74%)]" />

        <CommandPortalScene progressRef={progressRef} />

        <nav className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="text-sm font-semibold text-[#071522]">
            CommandOS
          </Link>
          <div className="flex items-center gap-5 text-sm font-semibold text-[#486575]">
            <Link className="transition hover:text-[#071522]" href="/console">
              Voice OS
            </Link>
            <Link className="transition hover:text-[#071522]" href="/portal">
              Center
            </Link>
          </div>
        </nav>

        <div className="pointer-events-none absolute inset-x-0 top-[16dvh] z-10 px-5 text-center" style={{ opacity: introOpacity }}>
          <h1 className="text-5xl font-semibold leading-none text-[#071522] sm:text-8xl lg:text-[7rem]">
            CommandOS
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base font-medium text-[#5b7a8d]">
            Scroll to fold in.
          </p>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-5 text-sm font-semibold text-[#486575]"
          style={{ opacity: cueOpacity }}
        >
          <div className="rounded-full border border-white/80 bg-white/70 px-4 py-2 shadow-[0_18px_50px_rgba(84,220,255,0.22)] backdrop-blur-xl">
            keep scrolling
          </div>
        </div>

        <div
          className="absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-4 px-5 text-center transition"
          style={{
            opacity: destinationOpacity,
            transform: `translateY(${(1 - destinationOpacity) * 24}px)`,
            pointerEvents: destinationOpacity > 0.8 ? "auto" : "none",
          }}
        >
          <p className="text-sm font-semibold text-white/82">New world online</p>
          <div className="flex w-full max-w-[260px] flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
            <Link
              href="/console"
              className="w-full rounded-full border border-white/45 bg-white px-5 py-3 text-sm font-semibold text-[#071522] shadow-[0_22px_70px_rgba(84,220,255,0.32)] transition hover:-translate-y-1 sm:w-auto"
            >
              Voice OS
            </Link>
            <Link
              href="/portal"
              className="w-full rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white/18 sm:w-auto"
            >
              Command Center
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
