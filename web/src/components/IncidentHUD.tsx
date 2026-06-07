"use client";

/**
 * CommandOS Incident Intelligence HUD
 *
 * Real Three.js scene (hex map, payment topology, mitigation path, ghost) wired
 * to the VoiceBridgeEvent stream from CommandOSOrchestrator. Every HUD state
 * change — scene transitions, panel reveals, callouts, TTS utterances — is
 * driven by typed events, not by static mock data.
 *
 * Works in two modes:
 *   1. Live: events arrive over the LiveKit data channel via useVoiceBridgeEvents.
 *   2. Demo: injects the INCIDENT_MOCK_STEPS sequence for standalone demos.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useMaybeRoomContext } from "@livekit/components-react";
import type {
  HudComponentPayload,
  VoiceBridgeEvent,
  WebSearchResult,
} from "@voicebridge/contracts";
import { INCIDENT_MOCK_STEPS } from "@/lib/incidentMock";
import { useAudioLevel } from "@/lib/useAudioLevel";
import { DynamicPanel } from "@/components/DynamicPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Three.js helpers (self-contained, no CDN)
// ─────────────────────────────────────────────────────────────────────────────

const COL = {
  cyan: 0x39c0ff,
  blue: 0x2f6bff,
  red: 0xff3b5c,
  green: 0x22e0a0,
  amber: 0xffc24a,
  violet: 0x8b6bff,
  white: 0xcfe8ff,
} as const;

function lineMat(color: number, opacity: number) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function additiveMat(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeDiscTexture(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.85)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// color ramp orange→red→magenta→violet→indigo→blue for orb
const RAMP: [number, [number, number, number]][] = [
  [0.0, [1.0, 0.45, 0.05]],
  [0.16, [1.0, 0.16, 0.3]],
  [0.34, [0.97, 0.1, 0.56]],
  [0.54, [0.55, 0.18, 1.0]],
  [0.74, [0.22, 0.34, 1.0]],
  [1.0, [0.2, 0.72, 1.0]],
];
function rampColor(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
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

function buildOrb(disc: THREE.CanvasTexture) {
  const g = new THREE.Group();
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), additiveMat(0x1b2552, 0.1));
  g.add(glow);

  const N = 9000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  function turb(th: number, ph: number) {
    return (
      0.5 * Math.sin(3 * th + 1.7 * ph) +
      0.32 * Math.sin(5 * ph - 2 * th + 1.1) +
      0.22 * Math.sin(8 * th + 3 * ph) +
      0.16 * Math.sin(11 * ph - 5 * th)
    );
  }
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const n = (turb(th, ph) + 1.36) / 2.72;
    let spray = Math.pow(Math.max(0, n - 0.42) / 0.58, 2.2);
    spray *= 0.35 + 0.75 * Math.pow(Math.abs(Math.cos(ph)), 1.6);
    const r = 0.96 + spray * 0.95 + (Math.random() - 0.5) * 0.02;
    const sp = Math.sin(ph);
    pos[i * 3] = r * sp * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * sp * Math.sin(th);
    const c = rampColor((pos[i * 3 + 1]! / r + 1) / 2);
    const bright = 1.0 + Math.random() * 0.2;
    let rr = c[0] * bright, gg = c[1] * bright, bb = c[2] * bright;
    const lum = 0.3 * rr + 0.59 * gg + 0.11 * bb;
    const S = 1.55;
    rr = Math.max(0, lum + (rr - lum) * S);
    gg = Math.max(0, lum + (gg - lum) * S);
    bb = Math.max(0, lum + (bb - lum) * S);
    if (spray > 0.7) { const w = (spray - 0.7) * 0.3; rr += w; gg += w; bb += w; }
    col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.035, map: disc, vertexColors: true, transparent: true,
    opacity: 0.95, blending: THREE.NormalBlending, depthWrite: false, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  g.add(pts);

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
    const c = rampColor((Math.cos(ph) + 1) / 2);
    spCol[i * 3] = c[0] + 0.12; spCol[i * 3 + 1] = c[1] + 0.12; spCol[i * 3 + 2] = c[2] + 0.12;
  }
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({
    size: 0.045, map: disc, vertexColors: true, transparent: true,
    opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  g.add(sparks);

  const glowMat = glow.material as THREE.MeshBasicMaterial;
  return {
    group: g,
    update(t: number, energy: number) {
      g.rotation.y = t * 0.12;
      g.rotation.x = Math.sin(t * 0.25) * 0.12;
      sparks.rotation.y = -t * 0.08;
      pts.scale.setScalar(1 + Math.sin(t * 0.9) * 0.02 + energy * 0.06);
      mat.size = 0.035 + energy * 0.014;
      glowMat.opacity = 0.06 + energy * 0.1;
      glow.scale.setScalar(1 + Math.sin(t * 1.1) * 0.04 + energy * 0.12);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene engine (self-contained, mirrors hud.js logic)
// ─────────────────────────────────────────────────────────────────────────────

interface FadeGroup extends THREE.Group {
  userData: { vis: number; target: number; base?: number };
}

function registerFade(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const bm = m as THREE.Material & { opacity?: number; userData: { base?: number } };
      if (bm.userData.base === undefined) bm.userData.base = bm.opacity ?? 1;
    });
  });
  (group as FadeGroup).userData.vis = 0;
  (group as FadeGroup).userData.target = 0;
  group.visible = false;
}

function applyFade(group: THREE.Group): void {
  const fg = group as FadeGroup;
  const v = fg.userData.vis;
  group.visible = v > 0.001;
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const bm = m as THREE.Material & { opacity: number; userData: { base?: number } };
      bm.opacity = (bm.userData.base ?? bm.opacity) * v;
    });
  });
}

interface HUDScene {
  cam: [number, number, number];
  look: [number, number, number];
  orb: [number, number, number, number];
  show: string[];
  grid: number;
}

const SCENES: Record<string, HUDScene> = {
  idle:       { cam: [0, 0, 8.5],  look: [0, 0, 0],     orb: [0, 0, 0, 1.0],   show: [],             grid: 0 },
  map:        { cam: [0, 7.5, 9.5], look: [0, 0.4, 0],   orb: [0, 3.4, 0, 0.4], show: ["map"],        grid: 1 },
  cities:     { cam: [0, 4.6, 7.2], look: [0, 1.0, 0.4], orb: [0, 3.5, 0, 0.4], show: ["map", "bars"],grid: 1 },
  topology:   { cam: [0, 1.4, 9.5], look: [0, 0.3, 0],   orb: [0, 3.0, 0, 0.4], show: ["topo"],       grid: 1 },
  ghost:      { cam: [0.6, 1.8, 10],look: [0, 0.3, -0.8],orb: [0, 3.0, 0, 0.4], show: ["topo","ghost"],grid: 1 },
  mitigation: { cam: [0, 2.0, 10],  look: [0, 0.7, 0],   orb: [0, 3.2, 0, 0.4], show: ["topo","mit"], grid: 1 },
  dashboard:  { cam: [0, 6.6, 9.0], look: [0, 0.2, 0],   orb: [0, 3.3, 0, 0.5], show: ["map"],        grid: 1 },
};

interface LinkObject {
  pts: THREE.Points;
  pos: Float32Array;
  M: number;
  x0: number;
  x1: number;
  update: (t: number, broken: boolean, flowColor: number) => void;
}

interface HUDEngine {
  setScene: (name: string) => void;
  highlight: (key: string, ok?: boolean) => void;
  clearHighlight: () => void;
  getScreenPos: (key: string) => { x: number; y: number; behind: boolean } | null;
  setSpeaking: (on: boolean) => void;
  /** Drive the orb from a real 0..1 audio level (mic + agent). */
  setAudioLevel: (level: number) => void;
  dispose: () => void;
}

function createHUDScene(host: HTMLElement): HUDEngine {
  let width = host.clientWidth || window.innerWidth;
  let height = host.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 200);
  camera.position.set(0, 0, 12);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  host.appendChild(renderer.domElement);

  const disc = makeDiscTexture();
  const root = new THREE.Group();
  scene.add(root);

  // ── Orb ──────────────────────────────────────────────────────────────────
  const orb = buildOrb(disc);
  const orbAnchor = new THREE.Group();
  orbAnchor.add(orb.group);
  scene.add(orbAnchor);
  const orbState = {
    pos: new THREE.Vector3(0, 0, 0),
    scl: 1,
    tpos: new THREE.Vector3(0, 0, 0),
    tscl: 1,
  };

  // ── Anchors (for HTML callout positioning) ────────────────────────────────
  const anchors: Record<string, THREE.Vector3> = {};
  function setAnchor(k: string, v: THREE.Vector3) { anchors[k] = v; }

  // ── MODULE: Region map (hex cluster) ─────────────────────────────────────
  const mapG = new THREE.Group();
  root.add(mapG);
  const HEX = 0.62, hexH = 0.22;
  const cells: { q: number; r: number; x: number; z: number }[] = [];
  const R = 2;
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      const x = 1.5 * HEX * q;
      const z = Math.sqrt(3) * HEX * (r + q / 2);
      if (Math.hypot(x, z) > 2.55) continue;
      cells.push({ q, r, x, z });
    }
  }
  const cityIdx = [Math.floor(cells.length * 0.32), Math.floor(cells.length * 0.55), Math.floor(cells.length * 0.7)];
  const cityNames = ["dallas", "austin", "houston"];
  const tiles: { mesh: THREE.Mesh; edge: THREE.LineSegments; isCity: boolean; base: number; x: number; z: number }[] = [];
  const beacons: { beam: THREE.Mesh; ring: THREE.Mesh; x: number; z: number; phase: number }[] = [];

  cells.forEach((c, i) => {
    const isCity = cityIdx.includes(i);
    const cityName = isCity ? cityNames[cityIdx.indexOf(i)]! : null;
    const geo = new THREE.CylinderGeometry(HEX * 0.94, HEX * 0.94, hexH, 6);
    const top = new THREE.Mesh(geo, additiveMat(isCity ? COL.red : 0x0e2c44, isCity ? 0.5 : 0.32));
    top.position.set(c.x, hexH / 2, c.z);
    top.rotation.y = Math.PI / 6;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(isCity ? COL.red : COL.cyan, isCity ? 0.9 : 0.5));
    edge.position.copy(top.position);
    edge.rotation.y = top.rotation.y;
    mapG.add(top, edge);
    const topMat = top.material as THREE.MeshBasicMaterial;
    tiles.push({ mesh: top, edge, isCity, base: topMat.opacity, x: c.x, z: c.z });
    if (isCity) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8), additiveMat(COL.red, 0.6));
      beam.position.set(c.x, 0.9, c.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 40), additiveMat(COL.red, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(c.x, hexH + 0.02, c.z);
      mapG.add(beam, ring);
      beacons.push({ beam, ring, x: c.x, z: c.z, phase: beacons.length * 0.8 });
      if (cityName) setAnchor(cityName, new THREE.Vector3(c.x, 1.5, c.z));
    }
  });
  setAnchor("region", new THREE.Vector3(0, 1.2, 0));
  registerFade(mapG);

  // ── City drilldown bars ───────────────────────────────────────────────────
  const barsG = new THREE.Group();
  root.add(barsG);
  const cityBars: THREE.Mesh[] = [];
  beacons.forEach((b, i) => {
    const h = [1.5, 1.9, 1.2][i] ?? 1.4;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, h, 0.26), additiveMat(i === 1 ? COL.amber : COL.red, 0.7));
    bar.position.set(b.x, hexH + h / 2, b.z);
    bar.userData = { full: h };
    barsG.add(bar);
    cityBars.push(bar);
  });
  registerFade(barsG);

  // ── Payment topology ──────────────────────────────────────────────────────
  const topoG = new THREE.Group();
  root.add(topoG);
  const nodeNames = ["app", "checkout", "gateway", "processor", "bank"] as const;
  const nodeX = [-4.2, -2.1, 0, 2.1, 4.2];
  type NodeName = (typeof nodeNames)[number];
  const nodes: Record<NodeName, { g: THREE.Group; core: THREE.Mesh; wire: THREE.LineSegments; ring: THREE.Mesh; col: number; x: number }> = {} as never;

  nodeNames.forEach((name, i) => {
    const isGate = name === "gateway";
    const col = isGate ? COL.red : COL.cyan;
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), additiveMat(col, 0.18));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.45, 1)), lineMat(col, 0.85));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.66, 48), additiveMat(col, 0.5));
    ring.rotation.x = -Math.PI / 2.1;
    g.add(core, wire, ring);
    g.position.set(nodeX[i]!, 0, 0);
    topoG.add(g);
    nodes[name] = { g, core, wire, ring, col, x: nodeX[i]! };
    setAnchor(name, new THREE.Vector3(nodeX[i]!, 0.9, 0));
  });

  function makeLink(x0: number, x1: number, color: number): LinkObject {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, 0, 0)]),
      lineMat(color, 0.5),
    );
    const M = 22;
    const pos = new Float32Array(M * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 0.12, map: disc, color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    topoG.add(line, pts);
    const lineMaterial = line.material as THREE.LineBasicMaterial;
    const ptsMaterial = pts.material as THREE.PointsMaterial;
    const attr = pg.attributes["position"] as THREE.BufferAttribute | undefined;
    return {
      pts, pos, M, x0, x1,
      update(t: number, broken: boolean, flowColor: number) {
        ptsMaterial.color.setHex(flowColor);
        lineMaterial.color.setHex(flowColor);
        for (let i = 0; i < M; i++) {
          const f = ((t * 0.5 + i / M) % 1);
          const dead = broken && f > 0.58;
          pos[i * 3] = x0 + (x1 - x0) * f;
          pos[i * 3 + 1] = dead ? Math.sin(i * 12 + t * 6) * 0.18 : 0;
          pos[i * 3 + 2] = dead ? Math.cos(i * 7 + t * 5) * 0.18 : 0;
        }
        if (attr) attr.needsUpdate = true;
      },
    };
  }

  const links: LinkObject[] = [
    makeLink(nodeX[0]!, nodeX[1]!, COL.cyan),
    makeLink(nodeX[1]!, nodeX[2]!, COL.cyan),
    makeLink(nodeX[2]!, nodeX[3]!, COL.cyan), // gateway→processor (broken one)
    makeLink(nodeX[3]!, nodeX[4]!, COL.cyan),
  ];
  registerFade(topoG);

  // ── Mitigation path ───────────────────────────────────────────────────────
  const mitG = new THREE.Group();
  root.add(mitG);
  const lbPos = new THREE.Vector3(-1.05, 1.7, 0);
  const secPos = new THREE.Vector3(1.05, 1.7, 0);

  function extraNode(p: THREE.Vector3, color: number) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), additiveMat(color, 0.18));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.39, 1)), lineMat(color, 0.85));
    g.add(core, wire);
    g.position.copy(p);
    mitG.add(g);
    return g;
  }
  extraNode(lbPos, COL.green);
  extraNode(secPos, COL.green);
  setAnchor("lb", lbPos.clone().add(new THREE.Vector3(0, 0.6, 0)));
  setAnchor("secondary", secPos.clone().add(new THREE.Vector3(0, 0.6, 0)));

  function bezierLine(a: THREE.Vector3, b: THREE.Vector3) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.6;
    const c = new THREE.QuadraticBezierCurve3(a, mid, b);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(40)), lineMat(COL.green, 0.7));
    mitG.add(line);
    return line;
  }
  bezierLine(new THREE.Vector3(nodeX[1]!, 0, 0), lbPos);
  bezierLine(lbPos, secPos);
  bezierLine(secPos, new THREE.Vector3(nodeX[3]!, 0, 0));
  registerFade(mitG);

  // ── Ghost (prior incident overlay) ────────────────────────────────────────
  const ghostG = new THREE.Group();
  root.add(ghostG);
  topoG.children.forEach((o) => {
    if (o.type === "Line" || o.type === "LineSegments") {
      const cl = o.clone() as THREE.Line | THREE.LineSegments;
      cl.material = lineMat(COL.violet, 0.4);
      ghostG.add(cl);
    }
  });
  ghostG.position.set(0, 0, -2.2);
  ghostG.scale.setScalar(0.92);
  registerFade(ghostG);

  // ── Grid floor ────────────────────────────────────────────────────────────
  const grid = new THREE.GridHelper(40, 40, COL.cyan, 0x123047);
  const gridMat = grid.material as unknown as { opacity: number; transparent: boolean; depthWrite: boolean; userData: { base: number } };
  gridMat.transparent = true;
  gridMat.opacity = 0.0;
  gridMat.depthWrite = false;
  gridMat.userData.base = 0.14;
  grid.position.y = -0.02;
  scene.add(grid);
  const gridState = { vis: 0, target: 0 };

  // ── Module map ────────────────────────────────────────────────────────────
  const moduleMap: Record<string, THREE.Group> = { map: mapG, bars: barsG, topo: topoG, ghost: ghostG, mit: mitG };

  const camT = { pos: new THREE.Vector3(0, 0, 8.5), look: new THREE.Vector3(0, 0, 0) };

  function setScene(name: string) {
    const s = SCENES[name] ?? SCENES["idle"]!;
    camT.pos.set(...s.cam);
    camT.look.set(...s.look);
    orbState.tpos.set(s.orb[0], s.orb[1], s.orb[2]);
    orbState.tscl = s.orb[3];
    Object.keys(moduleMap).forEach((k) => {
      (moduleMap[k]! as FadeGroup).userData.target = s.show.includes(k) ? 1 : 0;
    });
    gridState.target = s.grid;
  }
  setScene("idle");

  // ── Highlight state ───────────────────────────────────────────────────────
  let highlightKey: string | null = null;
  let highlightOk = false;
  function highlight(key: string, ok = false) { highlightKey = key; highlightOk = ok; }
  function clearHighlight() { highlightKey = null; }

  function getScreenPos(key: string): { x: number; y: number; behind: boolean } | null {
    const v = anchors[key];
    if (!v) return null;
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, behind: p.z > 1 };
  }

  // ── Speaking energy ───────────────────────────────────────────────────────
  // `speaking` is the legacy boolean-driven sine envelope (kept for the typing
  // animation / demo mode). `audio` is the REAL 0..1 mic+agent level when a
  // live room is connected; when present it drives the orb directly.
  const sstate = { speaking: 0, target: 0, px: 0, py: 0, audio: 0, audioTarget: 0 };
  function setSpeaking(on: boolean) { sstate.target = on ? 1 : 0; }
  function setAudioLevel(level: number) {
    sstate.audioTarget = Math.max(0, Math.min(1, level));
  }

  const onPointerMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    sstate.px = (e.clientX - r.left) / r.width - 0.5;
    sstate.py = (e.clientY - r.top) / r.height - 0.5;
  };
  host.addEventListener("pointermove", onPointerMove, { passive: true });

  function onResize() {
    width = host.clientWidth || window.innerWidth;
    height = host.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener("resize", onResize);

  // ── Render loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    const t = clock.getElapsedTime();
    sstate.speaking += (sstate.target - sstate.speaking) * 0.08;
    // Smooth the real audio level a touch more (the hook already smooths it;
    // this just keeps the orb from jittering between frames).
    sstate.audio += (sstate.audioTarget - sstate.audio) * 0.18;
    // Idle baseline keeps the orb breathing when silent. The real mic+agent
    // level (sstate.audio) drives the visible pulse; the legacy boolean-driven
    // sine envelope (sstate.speaking) layers in for the demo / typing path so
    // both modes animate. With a live audio source, sstate.audio dominates.
    const idle = 0.3;
    const liveEnergy = sstate.audio * 0.95;
    const demoEnergy = sstate.speaking * (0.42 + 0.32 * Math.abs(Math.sin(t * 6)) * Math.abs(Math.sin(t * 1.7)));
    const energy = idle + Math.max(liveEnergy, demoEnergy);

    camera.position.lerp(camT.pos.clone().add(new THREE.Vector3(sstate.px * 0.5, -sstate.py * 0.3, 0)), 0.05);
    camera.lookAt(camT.look);

    Object.values(moduleMap).forEach((g) => {
      const fg = g as FadeGroup;
      fg.userData.vis += (fg.userData.target - fg.userData.vis) * 0.08;
      applyFade(g);
    });
    gridState.vis += (gridState.target - gridState.vis) * 0.08;
    gridMat.opacity = gridMat.userData.base * gridState.vis;

    orbState.pos.lerp(orbState.tpos, 0.06);
    orbState.scl += (orbState.tscl - orbState.scl) * 0.06;
    orbAnchor.position.copy(orbState.pos);
    orbAnchor.scale.setScalar(orbState.scl);
    orb.update(t, energy);

    // Beacon pulses
    beacons.forEach((b) => {
      const k = 0.5 + 0.5 * Math.sin(t * 2.4 + b.phase);
      const ringMat = b.ring.material as THREE.MeshBasicMaterial;
      const beamMat = b.beam.material as THREE.MeshBasicMaterial;
      const mapVis = (mapG as FadeGroup).userData.vis;
      b.ring.scale.setScalar(1 + k * 1.6);
      ringMat.opacity = 0.7 * (1 - k) * mapVis;
      beamMat.opacity = (0.35 + k * 0.4) * mapVis;
    });
    tiles.forEach((tl) => {
      if (tl.isCity) {
        const m = tl.mesh.material as THREE.MeshBasicMaterial;
        m.opacity = (tl.base + Math.sin(t * 2.4) * 0.12) * (mapG as FadeGroup).userData.vis;
      }
    });

    // City bar grow
    cityBars.forEach((bar) => {
      const barsVis = (barsG as FadeGroup).userData.vis;
      bar.scale.y = barsVis;
      bar.position.y = 0.22 + ((bar.userData as { full: number }).full * barsVis) / 2;
    });

    // Topology flows
    const gw = nodes.gateway;
    if (gw) { gw.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 4)); }
    const mitVis = (mitG as FadeGroup).userData.vis;
    links.forEach((lk, i) => {
      const isBroken = i === 2 && mitVis < 0.5;
      const flowColor = mitVis > 0.5 ? COL.green : (i === 2 ? COL.red : COL.cyan);
      lk.update(t, isBroken, flowColor);
    });
    if (gw) {
      const c = mitVis > 0.5 ? COL.green : COL.red;
      const wireMat = gw.wire.material as THREE.LineBasicMaterial;
      const ringMat = gw.ring.material as THREE.MeshBasicMaterial;
      wireMat.color.setHex(c);
      ringMat.color.setHex(c);
    }

    // Ghost drift
    ghostG.position.z = -2.2 + Math.sin(t * 0.6) * 0.1;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setScene,
    highlight,
    clearHighlight,
    getScreenPos,
    setSpeaking,
    setAudioLevel,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      host.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HUD state derived from events
// ─────────────────────────────────────────────────────────────────────────────

interface HUDState {
  scene: string;
  panels: string[];
  reply: string;
  userQuote: string;
  speaking: boolean;
  callout: { key: string; label: string; ok: boolean } | null;
  showBrowser: boolean;
  showGuardrail: boolean;
  showApproval: boolean;
  incidentId: string;
}

const INITIAL_STATE: HUDState = {
  scene: "idle",
  panels: [],
  reply: "",
  userQuote: "",
  speaking: false,
  callout: null,
  showBrowser: false,
  showGuardrail: false,
  showApproval: false,
  incidentId: "",
};

// Map scene.state visual → HUD scene name
function visualToScene(visual: string): string {
  const map: Record<string, string> = {
    failure_map: "map",
    failure_map_drilldown: "cities",
    payment_topology: "topology",
    prior_incident_overlay: "ghost",
    mitigation_morph: "mitigation",
    dashboard: "dashboard",
  };
  return map[visual] ?? "idle";
}

// Beat → panels (driven by event types)
function panelsForBeat(current: string[], eventType: string, event: VoiceBridgeEvent): string[] {
  switch (eventType) {
    case "map.hotspots": return ["p-region"];
    case "scene.state": {
      const p = event.payload as { visual: string };
      if (p.visual === "failure_map_drilldown") return ["p-region", "p-cities"];
      if (p.visual === "payment_topology") return [...current.filter(x => x !== "p-cities")];
      if (p.visual === "prior_incident_overlay") return ["p-prior"];
      if (p.visual === "dashboard") return ["p-region", "p-cities", "p-prior", "p-topo", "p-plan", "p-customer"];
      return current;
    }
    case "topology.built": return ["p-topo"];
    case "failure.localized": return [...current, "p-topo"].filter((v, i, a) => a.indexOf(v) === i);
    case "similar_incident.recalled": return ["p-prior"];
    case "mitigation.proposed": return ["p-plan"];
    case "dashboard.generated": return ["p-region", "p-cities", "p-prior", "p-topo", "p-plan", "p-customer"];
    default: return current;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React component
// ─────────────────────────────────────────────────────────────────────────────

interface IncidentHUDProps {
  /** If provided, events come from the parent (live LiveKit stream). */
  externalEvents?: VoiceBridgeEvent[];
  /** Called when user sends text input. */
  onUserIntent?: (text: string) => void;
  /**
   * Live conversational mode: the agent drives the HUD from speech, so the demo
   * auto-start is suppressed and an always-listening mic control is shown.
   */
  live?: boolean;
  /** Mic state + toggle for the persistent mute control (live mode). */
  mic?: {
    enabled: boolean;
    onToggle: () => void;
    /** Short status label, e.g. "Listening", "Connecting", "Mic muted". */
    status?: string;
  };
}

export function IncidentHUD({ externalEvents, onUserIntent, live, mic }: IncidentHUDProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HUDEngine | null>(null);
  const [hudState, setHudState] = useState<HUDState>(INITIAL_STATE);
  const [typingText, setTypingText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [isAuto, setIsAuto] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [clock, setClock] = useState("");

  // Live room (present only inside CallProvider; null in standalone demo mode).
  const room = useMaybeRoomContext();
  // Real mic + agent audio level, 0..1, rAF-smoothed by the hook.
  const audioLevel = useAudioLevel(room);

  // Agent-built dynamic panels, keyed by component id. render upserts, patch
  // shallow-merges, remove deletes. Insertion order is preserved for stable
  // layout (Object key order is insertion order for string keys).
  const [dynamicComponents, setDynamicComponents] = useState<Record<string, HudComponentPayload>>({});
  // Web-search results surfaced into the browser-research float.
  const [webSearch, setWebSearch] = useState<{ query: string; results: WebSearchResult[] } | null>(null);

  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoPlayerRef = useRef<{ stepIndex: number; running: boolean; timers: ReturnType<typeof setTimeout>[] }>({
    stepIndex: 0,
    running: false,
    timers: [],
  });

  // Live clock
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString("en-GB"));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Build Three.js scene once
  useEffect(() => {
    if (!hostRef.current) return;
    const engine = createHUDScene(hostRef.current);
    hudRef.current = engine;
    return () => { engine.dispose(); hudRef.current = null; };
  }, []);

  // Feed the real mic + agent audio level into the orb. The hook returns 0 when
  // no live room is connected, so the orb falls back to its idle baseline.
  useEffect(() => {
    hudRef.current?.setAudioLevel(audioLevel);
  }, [audioLevel]);

  // Type a reply with cursor animation
  const typeReply = useCallback((text: string) => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setIsTyping(true);
    setHudState((s) => ({ ...s, speaking: true }));
    hudRef.current?.setSpeaking(true);
    let i = 0;
    typingTimerRef.current = setInterval(() => {
      i++;
      setTypingText(text.slice(0, i));
      if (i >= text.length) {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        setTimeout(() => {
          setIsTyping(false);
          setHudState((s) => ({ ...s, speaking: false }));
          hudRef.current?.setSpeaking(false);
        }, 500);
      }
    }, 22);
  }, []);

  // Apply a single event to HUD state
  const applyEvent = useCallback((event: VoiceBridgeEvent) => {
    const type = event.type;
    const payload = event.payload as unknown as Record<string, unknown>;

    setHudState((prev) => {
      const next = { ...prev };

      switch (type) {
        case "incident.started":
          next.incidentId = (payload["incident_id"] as string) ?? "";
          next.scene = "idle";
          break;

        case "user.intent":
          next.userQuote = (payload["text"] as string) ?? "";
          break;

        case "scene.state": {
          const visual = (payload["visual"] as string) ?? "";
          const sceneName = visualToScene(visual);
          if (sceneName !== prev.scene) {
            next.scene = sceneName;
            hudRef.current?.setScene(sceneName);
          }
          break;
        }

        case "map.hotspots": {
          next.panels = panelsForBeat(prev.panels, type, event);
          // Callout: region
          next.callout = { key: "region", label: "TEXAS · <b>18.4%</b> premium failures", ok: false };
          break;
        }

        case "topology.built": {
          next.panels = panelsForBeat(prev.panels, type, event);
          hudRef.current?.highlight("gateway", false);
          next.callout = { key: "gateway", label: "GATEWAY · <b>queue saturated</b>", ok: false };
          break;
        }

        case "failure.localized": {
          next.panels = panelsForBeat(prev.panels, type, event);
          hudRef.current?.highlight("gateway", false);
          next.callout = { key: "gateway", label: "GATEWAY · <b>queue saturated</b>", ok: false };
          break;
        }

        case "similar_incident.recalled": {
          next.panels = panelsForBeat(prev.panels, type, event);
          next.showBrowser = true;
          hudRef.current?.highlight("gateway", false);
          next.callout = { key: "gateway", label: "PRIOR PATTERN · <b>92% match</b>", ok: false };
          break;
        }

        case "memory.recalled": {
          next.panels = panelsForBeat(prev.panels, type, event);
          break;
        }

        case "mitigation.proposed": {
          next.panels = panelsForBeat(prev.panels, type, event);
          hudRef.current?.highlight("secondary", true);
          next.callout = { key: "secondary", label: "SECONDARY GATEWAY · <b>rerouted</b>", ok: true };
          next.showBrowser = false;
          break;
        }

        case "guardrail.checked": {
          if ((payload["decision"] as string) === "block") {
            next.showGuardrail = true;
            setTimeout(() => setHudState((s) => ({ ...s, showGuardrail: true })), 700);
          }
          break;
        }

        case "approval.requested": {
          next.showApproval = true;
          next.showGuardrail = false;
          break;
        }

        case "dashboard.generated":
        case "report.created": {
          next.panels = panelsForBeat(prev.panels, type, event);
          next.showApproval = false;
          hudRef.current?.clearHighlight();
          next.callout = null;
          break;
        }

        case "agent.utterance": {
          const text = (payload["text"] as string) ?? "";
          typeReply(text);
          // TTS via browser speech synthesis as fallback
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            const utt = new SpeechSynthesisUtterance(text);
            utt.rate = 1.05;
            utt.pitch = 1.0;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utt);
          }
          break;
        }

        case "hud.component": {
          // Optional scene animation lives in the same beat as the component.
          const sceneHint = payload["scene_hint"] as string | undefined;
          if (sceneHint) {
            const sceneName = visualToScene(sceneHint);
            if (sceneName !== prev.scene) {
              next.scene = sceneName;
              hudRef.current?.setScene(sceneName);
            }
          }
          break;
        }

        case "web.search.results": {
          // Reuse the existing browser-research float to show the results.
          next.showBrowser = true;
          break;
        }
      }

      return next;
    });

    // Registry + web-search updates live outside the setHudState updater so the
    // updater stays a function of prev HUD state only (the dynamic registry is
    // its own piece of state). render = upsert, patch = shallow-merge, remove =
    // delete; insertion order is preserved so layout is stable across patches.
    if (type === "hud.component") {
      const data = event.payload as HudComponentPayload;
      setDynamicComponents((prevMap) => {
        if (data.op === "remove") {
          if (!(data.id in prevMap)) return prevMap;
          const copy = { ...prevMap };
          delete copy[data.id];
          return copy;
        }
        if (data.op === "patch") {
          const existing = prevMap[data.id];
          if (!existing) {
            // Patch before any render — treat it as the initial render.
            return { ...prevMap, [data.id]: data };
          }
          // Shallow-merge; items are replaced wholesale when present.
          const merged: HudComponentPayload = {
            ...existing,
            ...data,
            op: "render",
            items: data.items !== undefined ? data.items : existing.items,
          };
          return { ...prevMap, [data.id]: merged };
        }
        // op === "render": create or replace by id.
        return { ...prevMap, [data.id]: { ...data, op: "render" } };
      });
    } else if (type === "web.search.results") {
      const data = event.payload as { query: string; results: WebSearchResult[] };
      setWebSearch({ query: data.query, results: data.results ?? [] });
    }
  }, [typeReply]);

  // External event stream (live LiveKit). Apply EVERY new event, not just the
  // latest: the agent emits several events back-to-back (e.g. scene.state then
  // map.hotspots), and React may batch the appends into one render where the
  // array grows by more than one. Tracking a cursor applies the full delta so
  // no scene transition or panel reveal is dropped.
  const appliedCountRef = useRef(0);
  useEffect(() => {
    if (!externalEvents) return;
    // A reset (e.g. demo restart) shrinks the array — rewind the cursor.
    if (externalEvents.length < appliedCountRef.current) appliedCountRef.current = 0;
    for (let i = appliedCountRef.current; i < externalEvents.length; i++) {
      const event = externalEvents[i];
      if (event) applyEvent(event);
    }
    appliedCountRef.current = externalEvents.length;
  }, [externalEvents, applyEvent]);

  // Demo player — plays mock steps sequentially
  const playStep = useCallback((index: number) => {
    if (index < 0 || index >= INCIDENT_MOCK_STEPS.length) return;
    setBeat(index);
    const step = INCIDENT_MOCK_STEPS[index]!;
    const event = step.build();
    applyEvent(event);
    demoPlayerRef.current.stepIndex = index;
  }, [applyEvent]);

  const goNext = useCallback(() => {
    setBeat((b) => {
      const next = Math.min(b + 1, INCIDENT_MOCK_STEPS.length - 1);
      playStep(next);
      return next;
    });
  }, [playStep]);

  const goPrev = useCallback(() => {
    setBeat((b) => {
      const prev = Math.max(b - 1, 0);
      playStep(prev);
      return prev;
    });
  }, [playStep]);

  // Auto-play timer
  useEffect(() => {
    if (live) {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      return;
    }
    if (!isAuto) {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      return;
    }
    if (beat >= INCIDENT_MOCK_STEPS.length - 1) {
      // Defer out of the effect body (avoid synchronous setState-in-effect).
      const id = setTimeout(() => setIsAuto(false), 0);
      return () => clearTimeout(id);
    }
    const step = INCIDENT_MOCK_STEPS[beat + 1];
    const delay = step ? step.delayMs + 1800 : 2000;
    autoTimerRef.current = setTimeout(() => {
      goNext();
    }, delay);
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [isAuto, beat, goNext, live]);

  // Start demo on mount (beat 0). Suppressed in live mode — the agent drives
  // the HUD from the operator's speech instead of the scripted sequence.
  useEffect(() => {
    if (!live && !externalEvents) {
      const tid = setTimeout(() => playStep(0), 500);
      return () => clearTimeout(tid);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard controls
  useEffect(() => {
    if (live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); setIsAuto(false); goNext(); }
      else if (e.key === "ArrowLeft") { setIsAuto(false); goPrev(); }
      else if (e.key.toLowerCase() === "a") setIsAuto((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, live]);

  // Sync callout position each frame via CSS variable (callout follows 3D anchor)
  const calloutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf: number;
    function track() {
      if (calloutRef.current && hudRef.current && hudState.callout) {
        const pos = hudRef.current.getScreenPos(hudState.callout.key);
        if (pos && !pos.behind) {
          calloutRef.current.style.left = pos.x + "px";
          calloutRef.current.style.top = pos.y + "px";
          calloutRef.current.style.opacity = "1";
        } else {
          calloutRef.current.style.opacity = "0";
        }
      } else if (calloutRef.current) {
        calloutRef.current.style.opacity = "0";
      }
      raf = requestAnimationFrame(track);
    }
    track();
    return () => cancelAnimationFrame(raf);
  }, [hudState.callout]);

  // User submits a question
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    const text = userInput.trim();
    setUserInput("");
    setHudState((s) => ({ ...s, userQuote: text }));
    if (onUserIntent) onUserIntent(text);
  };

  const { panels, reply, userQuote, speaking, callout, showBrowser, showGuardrail, showApproval, incidentId } = hudState;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#020912", color: "#dbeeff", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{--cyan:#39c0ff;--cyan-dim:#1c6a93;--blue:#2f6bff;--red:#ff3b5c;--green:#22e0a0;--amber:#ffc24a;--violet:#8b6bff;--ink:#dbeeff;--mist:#6f9fc0;--frame:rgba(57,192,255,.32);}
        .hud-bg{position:fixed;inset:0;z-index:0;background:radial-gradient(120% 90% at 50% 116%,rgba(34,120,170,.34) 0%,rgba(8,30,52,.5) 34%,#03101c 60%,#020912 100%);}
        .hud-bg::after{content:"";position:absolute;inset:0;opacity:.5;background:radial-gradient(60% 40% at 50% 108%,rgba(57,192,255,.22),transparent 70%);}
        .hud-panel{position:absolute;z-index:6;width:300px;background:linear-gradient(160deg,rgba(15,42,66,.95),rgba(8,24,40,.95));border:1px solid var(--frame);padding:14px 16px;box-shadow:inset 0 0 24px rgba(57,192,255,.06),0 14px 40px rgba(0,0,0,.4);opacity:0;transform:translate3d(0,8px,0);transition:opacity .5s,transform .5s;pointer-events:none;}
        .hud-panel.on{opacity:1!important;transform:translate3d(0,0,0);}
        .hud-panel h4{font-family:'Space Grotesk',ui-sans-serif;font-weight:600;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--cyan);display:flex;align-items:center;gap:8px;margin-bottom:11px;}
        .hud-panel h4::before{content:"";width:6px;height:6px;background:var(--cyan);box-shadow:0 0 8px var(--cyan);transform:rotate(45deg);}
        .hud-corner{position:absolute;width:9px;height:9px;border:1.5px solid var(--cyan);opacity:.8;}
        .hud-corner.tl{top:-1px;left:-1px;border-right:0;border-bottom:0;}
        .hud-corner.br{bottom:-1px;right:-1px;border-left:0;border-top:0;}
        .bigstat{display:flex;align-items:baseline;gap:10px;}
        .bigstat .v{font-family:'Space Grotesk';font-weight:700;font-size:40px;line-height:1;}
        .bigstat .v.red{color:var(--red);text-shadow:0 0 18px rgba(255,59,92,.5);}
        .bigstat .u{font-size:13px;color:var(--mist);}
        .sub-row{display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--mist);margin-top:9px;}
        .sub-row b{color:var(--ink);font-weight:600;}
        .barrow{display:flex;align-items:center;gap:9px;margin-top:9px;font-family:'JetBrains Mono';font-size:12px;}
        .barrow .lab{width:62px;color:var(--mist);}
        .barrow .track{flex:1;height:7px;background:rgba(57,192,255,.12);position:relative;overflow:hidden;}
        .barrow .fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,var(--cyan),var(--red));box-shadow:0 0 10px rgba(255,59,92,.4);}
        .barrow .num{width:46px;text-align:right;color:var(--ink);}
        .chk{display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono';font-size:12.5px;margin-top:8px;color:var(--ink);}
        .chk .mk{width:18px;height:18px;display:grid;place-items:center;border:1px solid var(--frame);font-size:11px;}
        .chk.ok .mk{color:var(--green);border-color:rgba(34,224,160,.5);}
        .chk.bad .mk{color:var(--red);border-color:rgba(255,59,92,.6);background:rgba(255,59,92,.1);}
        .chk.bad{color:#ffd0d8;}
        .note{font-size:12.5px;line-height:1.5;color:var(--mist);margin-top:10px;}
        .note b{color:var(--ink);}
        .steps{display:flex;flex-direction:column;gap:9px;margin-top:4px;}
        .step{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;}
        .step .n{width:20px;height:20px;flex:none;display:grid;place-items:center;font-family:'JetBrains Mono';font-size:11px;color:var(--cyan);border:1px solid var(--frame);}
        .step .tx{color:var(--ink);line-height:1.4;}
        .step .tx i{color:var(--mist);font-style:normal;display:block;font-size:11px;}
        .pill{display:flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid var(--frame);background:rgba(10,28,46,.5);clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));}
        .pill .led{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);animation:hud-blink 1.4s infinite;}
        @keyframes hud-blink{0%,100%{opacity:1;}50%{opacity:.35;}}
        .reticle{width:74px;height:74px;margin:-37px 0 0 -37px;position:absolute;left:50%;top:50%;}
        .reticle::before,.reticle::after{content:"";position:absolute;inset:0;border:1.5px solid var(--red);border-radius:50%;}
        .reticle::after{inset:10px;border-style:dashed;animation:hud-spin 7s linear infinite;}
        .reticle.ok::before,.reticle.ok::after{border-color:var(--green);}
        @keyframes hud-spin{to{transform:rotate(360deg);}}
        .calabel{position:absolute;left:46px;top:-12px;white-space:nowrap;font-family:'JetBrains Mono';font-size:11px;color:#ffd0d8;background:rgba(40,8,16,.7);border:1px solid rgba(255,59,92,.5);padding:5px 10px;clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px));}
        .calabel.ok{color:#c8ffe9;background:rgba(8,40,24,.7);border-color:rgba(34,224,160,.5);}
        .caline{position:absolute;left:37px;top:37px;width:30px;height:1px;background:var(--red);box-shadow:0 0 6px var(--red);}
        .caline.ok{background:var(--green);box-shadow:0 0 6px var(--green);}
        .reply-box{position:relative;font-family:'Space Grotesk';font-weight:500;font-size:clamp(17px,2.1vw,23px);line-height:1.35;color:#f0f9ff;background:linear-gradient(160deg,rgba(13,38,60,.66),rgba(7,22,38,.6));border:1px solid var(--frame);padding:16px 26px;clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px));box-shadow:inset 0 0 26px rgba(57,192,255,.07),0 16px 50px rgba(0,0,0,.45);text-wrap:balance;min-height:64px;}
        .cursor{display:inline-block;width:9px;height:1.05em;background:var(--cyan);margin-left:3px;vertical-align:-2px;animation:hud-blink .8s steps(1) infinite;}
        .speakwrap{display:flex;align-items:center;gap:9px;font-family:'JetBrains Mono';font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan);}
        .speakwrap .eq{display:flex;align-items:flex-end;gap:2px;height:13px;}
        .speakwrap .eq i{width:2.5px;background:var(--cyan);border-radius:2px;height:25%;box-shadow:0 0 6px var(--cyan);}
        .speakwrap.live .eq i{animation:hud-eq .7s ease-in-out infinite;}
        .speakwrap.live .eq i:nth-child(2){animation-delay:.1s;}.speakwrap.live .eq i:nth-child(3){animation-delay:.22s;}.speakwrap.live .eq i:nth-child(4){animation-delay:.32s;}.speakwrap.live .eq i:nth-child(5){animation-delay:.15s;}
        @keyframes hud-eq{0%,100%{height:22%;}50%{height:100%;}}
        .float-card{position:absolute;opacity:0;transform:translateY(14px) scale(.98);transition:opacity .45s,transform .45s;pointer-events:none;}
        .float-card.on{opacity:1!important;transform:none;pointer-events:auto;}
        .hud-ctrl{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--ink);cursor:pointer;border:1px solid var(--frame);background:rgba(10,28,46,.55);padding:10px 15px;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));font-family:'Space Grotesk';}
        .hud-ctrl:hover{border-color:var(--cyan);box-shadow:0 0 14px rgba(57,192,255,.25);}
        .hud-ctrl.primary{background:linear-gradient(120deg,rgba(57,192,255,.22),rgba(47,107,255,.2));color:#eaf6ff;}
        .hud-ctrl:disabled{opacity:.4;cursor:default;}
        .hud-dot{width:8px;height:8px;transform:rotate(45deg);border:1px solid var(--cyan-dim);cursor:pointer;transition:all .25s;flex:none;}
        .hud-dot.on{background:var(--cyan);border-color:var(--cyan);box-shadow:0 0 9px var(--cyan);}
        .arow{display:flex;justify-content:space-between;font-family:'JetBrains Mono';font-size:12px;padding:7px 0;border-bottom:1px dashed rgba(57,192,255,.14);}
        .arow .k{color:var(--mist);}.arow .v{color:var(--ink);}.arow .v.warn{color:var(--amber);}.arow .v.ok{color:var(--green);}
        .stamp{margin-top:14px;font-family:'Space Grotesk';font-weight:700;letter-spacing:.16em;font-size:13px;color:var(--amber);border:1.5px solid var(--amber);display:inline-block;padding:7px 14px;transform:rotate(-3deg);text-transform:uppercase;box-shadow:0 0 16px rgba(255,194,74,.3);}
        .hud-mic{height:42px;min-width:136px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid rgba(57,192,255,.35);background:rgba(10,28,46,.68);color:var(--ink);font-family:'Space Grotesk';font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));}
        .hud-mic.on{border-color:rgba(34,224,160,.58);box-shadow:0 0 18px rgba(34,224,160,.18),inset 0 0 18px rgba(34,224,160,.06);}
        .hud-mic:disabled{opacity:.48;cursor:default;}
        .hud-mic .orb{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(120,140,180,.38);color:#fff;flex:none;}
        .hud-mic.on .orb{background:linear-gradient(135deg,#22e0a0,#2f6bff);box-shadow:0 0 13px rgba(34,224,160,.45);}
        .hud-input{flex:1;background:rgba(57,192,255,.06);border:1px solid var(--frame);color:var(--ink);font-family:'Space Grotesk';font-size:13px;padding:10px 14px;outline:none;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));}
        .hud-input::placeholder{color:var(--mist);}
        .hud-input:focus{border-color:var(--cyan);box-shadow:0 0 10px rgba(57,192,255,.15);}
        .res{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px dashed rgba(57,192,255,.14);opacity:0;transform:translateX(8px);transition:opacity .35s,transform .35s;}
        .res.on{opacity:1!important;transform:none;}
        .res .fav{width:18px;height:18px;flex:none;background:linear-gradient(135deg,var(--cyan),var(--blue));clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);}
        .res .rt{font-size:12px;color:var(--ink);line-height:1.35;}.res .rt i{display:block;font-style:normal;font-family:'JetBrains Mono';font-size:10.5px;color:var(--green);}
        @keyframes hud-dyn-pulse{0%{opacity:.55;box-shadow:inset 0 0 24px rgba(57,192,255,.06),0 0 0 1px rgba(57,192,255,.5),0 14px 40px rgba(0,0,0,.4);}100%{opacity:1;box-shadow:inset 0 0 24px rgba(57,192,255,.06),0 0 0 0 rgba(57,192,255,0),0 14px 40px rgba(0,0,0,.4);}}
      `}</style>

      {/* Background gradient */}
      <div className="hud-bg" />

      {/* Three.js canvas host */}
      <div ref={hostRef} style={{ position: "fixed", inset: 0, zIndex: 1 }} />

      {/* UI layer */}
      <div style={{ position: "fixed", inset: 0, zIndex: 5, pointerEvents: "none" }}>

        {/* Top bar */}
        <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 18, fontFamily: "'Space Grotesk', ui-sans-serif" }}>
          <div style={{ fontWeight: 700, fontSize: 19, letterSpacing: ".04em", color: "#eaf6ff", textShadow: "0 0 18px rgba(57,192,255,.4)", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 13, height: 13, border: "2px solid var(--cyan)", transform: "rotate(45deg)", boxShadow: "0 0 10px var(--cyan)", display: "inline-block" }} />
            CommandOS
            <span style={{ fontSize: 11, letterSpacing: ".28em", textTransform: "uppercase", color: "#6f9fc0", fontWeight: 500 }}>Incident Intelligence</span>
          </div>
        </div>

        {/* Status pills */}
        <div style={{ position: "absolute", top: 22, right: 26, display: "flex", gap: 10, alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#6f9fc0" }}>
          <div className="pill"><span className="led" />{incidentId || "INCIDENT"} · LIVE</div>
          <div className="pill" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{clock}</div>
        </div>

        {/* Persistent mic / mute control (live mode) — always visible so the
            operator can stop the mic without interrupting the agent. */}
        {mic && (
          <div style={{ position: "absolute", top: 18, left: 26, display: "flex", alignItems: "center", gap: 12, pointerEvents: "auto" }}>
            <button
              type="button"
              onClick={mic.onToggle}
              aria-pressed={mic.enabled}
              title={mic.enabled ? "Mute microphone" : "Unmute microphone"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                border: "1px solid var(--frame)",
                background: "rgba(10,28,46,.55)",
                color: "var(--ink)",
                fontFamily: "'Space Grotesk', ui-sans-serif",
                fontWeight: 600,
                fontSize: 12.5,
                padding: "8px 14px 8px 8px",
                clipPath: "polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))",
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  background: mic.enabled
                    ? "linear-gradient(135deg,#22e0a0,#2f6bff)"
                    : "rgba(120,140,180,0.45)",
                  boxShadow: mic.enabled ? "0 0 14px rgba(34,224,160,.5)" : "none",
                  flexShrink: 0,
                }}
              >
                {mic.enabled ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="3" x2="21" y2="21" />
                    <path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-1" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                )}
              </span>
              <span className={`speakwrap${mic.enabled ? " live" : ""}`} style={{ gap: 8 }}>
                <span className="eq" style={{ height: 12 }}><i /><i /><i /><i /><i /></span>
                {mic.status ?? (mic.enabled ? "Listening" : "Mic muted")}
              </span>
            </button>
          </div>
        )}

        {/* Left panel stack */}
        <div style={{ position: "absolute", top: 84, left: 26, width: 300, zIndex: 6, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={`hud-panel${panels.includes("p-region") ? " on" : ""}`} id="p-region">
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>Region · Premium</h4>
            <div className="bigstat"><span className="v red">18.4<span style={{ fontSize: 22 }}>%</span></span><span className="u">failure rate</span></div>
            <div className="sub-row"><span>Baseline</span><b>2.1%</b></div>
            <div className="barrow"><span className="lab">Texas</span><div className="track"><div className="fill" style={{ width: "88%" }} /></div><span className="num">18.4%</span></div>
            <div className="barrow"><span className="lab">National</span><div className="track"><div className="fill" style={{ width: "11%", background: "var(--cyan)" }} /></div><span className="num">2.1%</span></div>
          </div>

          <div className={`hud-panel${panels.includes("p-cities") ? " on" : ""}`} id="p-cities">
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>City breakdown</h4>
            <div className="barrow"><span className="lab">Dallas</span><div className="track"><div className="fill" style={{ width: "74%" }} /></div><span className="num">vol ↑</span></div>
            <div className="barrow"><span className="lab" style={{ color: "var(--amber)" }}>Austin</span><div className="track"><div className="fill" style={{ width: "96%", background: "linear-gradient(90deg,var(--amber),var(--red))" }} /></div><span className="num">spike</span></div>
            <div className="barrow"><span className="lab">Houston</span><div className="track"><div className="fill" style={{ width: "52%" }} /></div><span className="num">—</span></div>
          </div>

          <div className={`hud-panel${panels.includes("p-prior") ? " on" : ""}`} id="p-prior">
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>Prior incident · match</h4>
            <div className="bigstat"><span className="v" style={{ color: "var(--violet)" }}>92<span style={{ fontSize: 22 }}>%</span></span><span className="u">pattern match · 34d ago</span></div>
            <div className="note"><b>Outcome:</b> restarted too early — queue depth still high → duplicate-charge risk. <b>Fix that worked:</b> shift Texas traffic to a secondary gateway before restart.</div>
          </div>
        </div>

        {/* Right panel stack */}
        <div style={{ position: "absolute", top: 84, right: 26, width: 300, zIndex: 6, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={`hud-panel${panels.includes("p-topo") ? " on" : ""}`} id="p-topo">
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>Flow trace</h4>
            <div className="chk ok"><span className="mk">✓</span> Checkout validation</div>
            <div className="chk ok"><span className="mk">✓</span> Gateway authorization</div>
            <div className="chk bad"><span className="mk">✕</span> Processor confirmation</div>
            <div className="note"><b>Hypothesis:</b> gateway <b>queue saturation</b> — not card declines.</div>
          </div>

          <div className={`hud-panel${panels.includes("p-plan") ? " on" : ""}`} id="p-plan">
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>Recommended mitigation</h4>
            <div className="steps">
              <div className="step"><span className="n">1</span><span className="tx">Check queue depth<i>verify before any restart</i></span></div>
              <div className="step"><span className="n">2</span><span className="tx">Shift Texas traffic → secondary gateway<i>via load balancer</i></span></div>
              <div className="step"><span className="n">3</span><span className="tx">Controlled restart<i>after approval</i></span></div>
            </div>
          </div>

          <div className={`hud-panel${panels.includes("p-customer") ? " on" : ""}`} id="p-customer">
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>Customer update · draft</h4>
            <div className="note">We&apos;re aware some premium customers in Texas may see payment errors. We&apos;ve rerouted traffic and are restoring full service. No action needed — affected attempts were not charged.</div>
          </div>

          {/* Agent-built dynamic panels. The agent renders/patches/removes these
              live via hud.component events — they build and mutate in place. */}
          {Object.values(dynamicComponents).map((data) => (
            <DynamicPanel key={data.id} data={data} />
          ))}
        </div>

        {/* 3D callout (follows anchor via RAF) */}
        <div ref={calloutRef} style={{ position: "absolute", transform: "translate(-50%,-50%)", opacity: 0, transition: "opacity .35s", pointerEvents: "none" }}>
          <div className={`reticle${callout?.ok ? " ok" : ""}`} />
          <div className={`caline${callout?.ok ? " ok" : ""}`} />
          <div className={`calabel${callout?.ok ? " ok" : ""}`} dangerouslySetInnerHTML={{ __html: callout?.label ?? "" }} />
        </div>

        {/* Browser research float */}
        <div className={`float-card${showBrowser ? " on" : ""}`} style={{ right: 42, bottom: 130, width: 430 }}>
          <div style={{ background: "rgba(9,26,42,.92)", border: "1px solid var(--frame)", clipPath: "polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))", overflow: "hidden", boxShadow: "0 26px 70px rgba(0,0,0,.55)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid rgba(57,192,255,.18)", background: "rgba(6,18,30,.8)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57", display: "inline-block" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#febc2e", display: "inline-block" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840", display: "inline-block" }} />
              <span style={{ flex: 1, marginLeft: 6, fontFamily: "'JetBrains Mono'", fontSize: 11, color: "var(--ink)", background: "rgba(57,192,255,.08)", padding: "5px 9px", border: "1px solid rgba(57,192,255,.18)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                search ▸ {webSearch ? webSearch.query : "tx premium payment failures · gateway queue · prior incidents"}
              </span>
            </div>
            <div style={{ padding: "13px 14px" }}>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "var(--mist)", marginBottom: 10 }}>CommandOS web agent · <b style={{ color: "var(--cyan)" }}>live query</b></div>
              {webSearch ? (
                <>
                  {webSearch.results.map((r, i) => (
                    <div key={`${r.url}-${i}`} className={`res${showBrowser ? " on" : ""}`} style={{ transitionDelay: `${0.5 + i * 0.45}s` }}>
                      <span className="fav" />
                      <span className="rt">
                        {r.title}
                        <i>{(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}{r.snippet ? ` · ${r.snippet}` : ""}</i>
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop: 11, fontFamily: "'JetBrains Mono'", fontSize: 11, color: "var(--green)", display: "flex", alignItems: "center", gap: 8, opacity: showBrowser ? 1 : 0, transition: `opacity .4s ${0.5 + webSearch.results.length * 0.45 + 0.3}s` }}>
                    <span style={{ width: 10, height: 10, border: "2px solid var(--green)", borderTopColor: "transparent", borderRadius: "50%", animation: "hud-spin .8s linear infinite" }} />
                    Ingesting {webSearch.results.length} source{webSearch.results.length === 1 ? "" : "s"} into incident model…
                  </div>
                </>
              ) : (
                <>
                  <div className={`res${showBrowser ? " on" : ""}`} style={{ transitionDelay: "0.9s" }}>
                    <span className="fav" />
                    <span className="rt">Stripe status — elevated latency, US-South processor<i>status.stripe-like.com · 6m ago</i></span>
                  </div>
                  <div className={`res${showBrowser ? " on" : ""}`} style={{ transitionDelay: "1.4s" }}>
                    <span className="fav" />
                    <span className="rt">Gateway queue saturation: symptoms &amp; safe recovery<i>runbooks.internal · KB-2231</i></span>
                  </div>
                  <div className={`res${showBrowser ? " on" : ""}`} style={{ transitionDelay: "1.9s" }}>
                    <span className="fav" />
                    <span className="rt">Postmortem — TX premium spike (34d ago)<i>incidents.internal · INC-4471</i></span>
                  </div>
                  <div style={{ marginTop: 11, fontFamily: "'JetBrains Mono'", fontSize: 11, color: "var(--green)", display: "flex", alignItems: "center", gap: 8, opacity: showBrowser ? 1 : 0, transition: "opacity .4s 2.7s" }}>
                    <span style={{ width: 10, height: 10, border: "2px solid var(--green)", borderTopColor: "transparent", borderRadius: "50%", animation: "hud-spin .8s linear infinite" }} />
                    Ingesting 3 sources into incident model…
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Guardrail float */}
        <div className={`float-card${showGuardrail ? " on" : ""}`} style={{ left: "50%", top: "46%", transform: showGuardrail ? "translate(-50%,-50%)" : "translate(-50%,-50%) translateY(14px) scale(.98)", width: 440, zIndex: 10 }}>
          <div style={{ background: "linear-gradient(160deg,rgba(60,12,22,.86),rgba(30,8,16,.82))", border: "1px solid rgba(255,59,92,.55)", clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))", padding: "20px 22px", boxShadow: "0 26px 80px rgba(0,0,0,.6),inset 0 0 30px rgba(255,59,92,.12)", position: "relative" }}>
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4 style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "#ff8095", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, background: "var(--red)", boxShadow: "0 0 8px var(--red)", transform: "rotate(45deg)", display: "inline-block" }} />
              Action blocked
            </h4>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "#ffe2e7", marginTop: 4 }}>I can&apos;t recommend an immediate restart. <b>Queue depth is unknown</b>, and this exact sequence caused <b>duplicate-charge risk</b> last time.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <div style={{ flex: 1, textAlign: "center", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 13, padding: 11, border: "1px solid rgba(57,192,255,.4)", color: "var(--cyan)", background: "rgba(57,192,255,.08)", cursor: "pointer" }}>Run queue-depth check</div>
              <div style={{ flex: 1, textAlign: "center", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 13, padding: 11, border: "1px solid rgba(255,59,92,.4)", color: "#ffd0d8", background: "rgba(255,59,92,.08)", cursor: "pointer" }}>Prepare approval request</div>
            </div>
          </div>
        </div>

        {/* Approval float */}
        <div className={`float-card${showApproval ? " on" : ""}`} style={{ left: "50%", top: "46%", transform: showApproval ? "translate(-50%,-50%)" : "translate(-50%,-50%) translateY(14px) scale(.98)", width: 440, zIndex: 10 }}>
          <div className="hud-panel" style={{ opacity: 1, transform: "none", position: "relative" }}>
            <span className="hud-corner tl" /><span className="hud-corner br" />
            <h4>Approval request</h4>
            <div className="arow"><span className="k">Action</span><span className="v">Controlled gateway restart</span></div>
            <div className="arow"><span className="k">Precondition</span><span className="v warn">Queue-depth check must pass</span></div>
            <div className="arow"><span className="k">Traffic</span><span className="v ok">Texas → secondary gateway</span></div>
            <div className="arow"><span className="k">Attached</span><span className="v warn">Prior-incident warning (INC-4471)</span></div>
            <div className="stamp">Awaiting approval</div>
          </div>
        </div>

        {/* Conversation bar */}
        <div style={{ position: "absolute", left: "50%", bottom: 30, transform: "translateX(-50%)", width: "min(780px,86vw)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          {userQuote && (
            <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 500, fontSize: 14, letterSpacing: ".02em", color: "#6f9fc0", opacity: 0.9 }}>
              <span style={{ color: "#1c6a93" }}>❝ </span>{userQuote}<span style={{ color: "#1c6a93" }}> ❞</span>
            </div>
          )}
          <div className="reply-box">
            {typingText}{isTyping && <span className="cursor" />}
          </div>
          <div className={`speakwrap${speaking ? " live" : ""}`}>
            <span className="eq"><i /><i /><i /><i /><i /></span>
            <span>{speaking ? "orb speaking" : "orb idle"}</span>
          </div>
          {/* User input */}
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, width: "100%", pointerEvents: "auto" }}>
            <button
              type="button"
              className={`hud-mic${mic?.enabled ? " on" : ""}`}
              disabled={!mic}
              onClick={mic?.onToggle}
              aria-pressed={mic?.enabled ?? false}
              title={mic ? (mic.enabled ? "Mute microphone" : "Unmute microphone") : "Microphone unavailable"}
            >
              <span className="orb" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                </svg>
              </span>
              {mic?.status ?? "Mic"}
            </button>
            <input
              className="hud-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask CommandOS anything about this incident…"
            />
            <button type="submit" className="hud-ctrl primary" style={{ whiteSpace: "nowrap" }}>Send</button>
          </form>
        </div>

        {!live && (
          <>
        {/* Beat dots */}
        <div style={{ position: "absolute", bottom: 34, left: 30, display: "flex", gap: 7, alignItems: "center" }}>
          {INCIDENT_MOCK_STEPS.filter((s) => s.label.startsWith("Agent") || s.label.startsWith("User") || s.label.startsWith("Incident")).map((s, i) => (
            <div
              key={i}
              className={`hud-dot${i === beat ? " on" : ""}`}
              onClick={() => { setIsAuto(false); playStep(i); }}
              style={{ cursor: "pointer", pointerEvents: "auto" }}
            />
          ))}
        </div>

        {/* Controls */}
        <div style={{ position: "absolute", bottom: 30, right: 30, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "absolute", bottom: 42, right: 0, fontFamily: "'JetBrains Mono'", fontSize: "10.5px", color: "#6f9fc0", opacity: 0.7, whiteSpace: "nowrap" }}>
            ← → step · Space next · A auto
          </div>
          <button className="hud-ctrl" disabled={beat <= 0} onClick={() => { setIsAuto(false); goPrev(); }} style={{ pointerEvents: "auto", cursor: "pointer" }}>◂ Prev</button>
          <button className="hud-ctrl primary" disabled={beat >= INCIDENT_MOCK_STEPS.length - 1} onClick={() => { setIsAuto(false); goNext(); }} style={{ pointerEvents: "auto", cursor: "pointer" }}>Next ▸</button>
          <button className="hud-ctrl" onClick={() => setIsAuto((v) => !v)} style={{ pointerEvents: "auto", cursor: "pointer" }}>{isAuto ? "❚❚ Auto" : "▷ Auto"}</button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
