import { useEffect, useRef, useState } from 'react';
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { FlightData } from '@/lib/flight';
import { HEIGHT, SIDE, positionAt, type AtmoScene, type Band, type Vec3 } from '@/lib/atmo3d';
import { fmtAltShort, type Units } from '@/lib/format';

const FOV = 30;
const VIEW = { theta: 0.62, phi: 1.12 };

type Mode = 'preview' | 'full';

interface Palette {
  bg: string;
  floor: string;
  grid: string;
  tick: string;
  troposphere: string;
  stratosphere: string;
  ozone: string;
  cloud: string;
  cloudEdge: string;
  boundary: string;
  freezing: string;
  accent: string;
  pred: string;
  shadow: string;
  curtain: number;
}

function palette(theme: 'dark' | 'light'): Palette {
  return theme === 'dark'
    ? {
        bg: '#0e1013',
        floor: '#14171b',
        grid: '#262a30',
        tick: '#1f2328',
        troposphere: '#171a1f',
        stratosphere: '#111317',
        ozone: '#151a2b',
        cloud: '#2a2f37',
        cloudEdge: '#3a414b',
        boundary: '#5a626d',
        freezing: '#7d8796',
        accent: '#8199f0',
        pred: '#7d8796',
        shadow: '#30353d',
        curtain: 0.1,
      }
    : {
        bg: '#ffffff',
        floor: '#f6f8fa',
        grid: '#e6e8eb',
        tick: '#e6e8eb',
        troposphere: '#eef1f5',
        stratosphere: '#f8f9fb',
        ozone: '#eceffb',
        cloud: '#ffffff',
        cloudEdge: '#d3d9e0',
        boundary: '#8a94a3',
        freezing: '#7d8796',
        accent: '#3451d1',
        pred: '#7d8796',
        shadow: '#cfd5dc',
        curtain: 0.07,
      };
}

interface Wall {
  angle: number;
  centre: Vector3;
  axis: Vector3;
  normal: Vector3;
  group: Group;
}

type TagKind = 'point' | 'tick' | 'name' | 'edge' | 'band';

interface Tag {
  el: HTMLElement;
  kind: TagKind;
  alt: number;
  world: Vector3;
  priority: number;
  w: number;
  h: number;
}

function tickLabel(z: number, units: Units): string {
  if (z === 0) return '0';
  return units === 'metric' ? `${Math.round(z / 1000)} km` : `${Math.round((z * 3.28084) / 1000)} kft`;
}

function disposeTree(root: Object3D) {
  root.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    const mat = m.material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

interface Content {
  scene: AtmoScene;
  flight: FlightData;
  pal: Palette;
  units: Units;
  live: boolean;
}

class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 400);
  readonly target = new Vector3(0, HEIGHT * 0.47, 0);
  readonly root = new Group();
  readonly view = { ...VIEW, zoom: 1 };
  controls: OrbitControls | null = null;
  walls: Wall[] = [];
  corners: { line: Object3D; walls: [number, number] }[] = [];
  lineMats: LineMaterial[] = [];
  tags: Tag[] = [];
  content: Content | null = null;
  sonde: { tag: Tag; label: HTMLElement; drop: Line2; played: Line2; faint: Line2 } | null = null;
  index: number | null = null;
  width = 0;
  height = 0;
  fitted = false;
  raf = 0;
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(
    private host: HTMLDivElement,
    private overlay: HTMLDivElement,
    private mode: Mode,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'block h-full w-full';
    host.prepend(this.renderer.domElement);
    this.scene.add(this.root);

    if (mode === 'full') {
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.enablePan = false;
      c.minPolarAngle = 0.12;
      c.maxPolarAngle = 1.48;
      c.rotateSpeed = 0.7;
      c.target.copy(this.target);
      c.addEventListener('change', () => this.request());
      this.controls = c;
    } else {
      this.bindPreview();
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private bindPreview() {
    const el = this.host;
    let last: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!last || e.pointerId !== last.id) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.view.theta -= dx * 0.009;
      if (e.pointerType === 'mouse') this.view.phi = MathUtils.clamp(this.view.phi - dy * 0.006, 0.3, 1.45);
      this.applyView();
      this.request();
    };
    const up = (e: PointerEvent) => {
      if (last && e.pointerId === last.id) last = null;
    };
    const key = (e: KeyboardEvent) => {
      const step = { ArrowLeft: 0.12, ArrowRight: -0.12 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      this.view.theta += step;
      this.applyView();
      this.request();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', key);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('keydown', key);
    });
  }

  private fitDistance(): number {
    const r = 0.5 * Math.sqrt(2 * SIDE * SIDE + HEIGHT * HEIGHT);
    const vf = MathUtils.degToRad(FOV) / 2;
    const usable = this.width > 0 ? Math.max(0.5, (this.width - 96) / this.width) : 1;
    const hf = Math.atan(Math.tan(vf) * this.camera.aspect * usable);
    return (r / Math.sin(Math.min(vf, hf))) * (this.mode === 'full' ? 0.9 : 0.94);
  }

  applyView() {
    const s = new Spherical(this.fitDistance() * this.view.zoom, this.view.phi, this.view.theta);
    this.camera.position.setFromSpherical(s).add(this.target);
    this.camera.lookAt(this.target);
    if (this.controls) this.controls.update();
  }

  reset() {
    Object.assign(this.view, VIEW, { zoom: 1 });
    if (this.controls) this.controls.target.copy(this.target);
    this.applyView();
    this.request();
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0 || (w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const m of this.lineMats) m.resolution.set(w, h);
    if (this.controls) {
      const d = this.fitDistance();
      this.controls.minDistance = d * 0.45;
      this.controls.maxDistance = d * 1.7;
    }
    if (!this.fitted || !this.controls) {
      this.fitted = true;
      this.applyView();
    }
    this.render();
  }

  request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.controls?.update();
      this.render();
    });
  }

  private toWorld(p: Vec3, s: AtmoScene, lift = 0): Vector3 {
    return new Vector3(((p[0] - s.center[0]) / s.span) * SIDE, (p[2] / s.top) * HEIGHT + lift, -((p[1] - s.center[1]) / s.span) * SIDE);
  }

  private lineMat(color: string, width: number, opts: { dashed?: boolean; opacity?: number } = {}): LineMaterial {
    const m = new LineMaterial({
      color: new Color(color).getHex(),
      linewidth: width,
      worldUnits: false,
      dashed: !!opts.dashed,
      dashSize: 0.16,
      gapSize: 0.12,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
      depthWrite: opts.opacity === undefined,
    });
    m.resolution.set(this.width || 1, this.height || 1);
    this.lineMats.push(m);
    return m;
  }

  private line(points: Vector3[], mat: LineMaterial): Line2 {
    const g = new LineGeometry();
    g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
    const l = new Line2(g, mat);
    if (mat.dashed) l.computeLineDistances();
    return l;
  }

  private tag(kind: TagKind, html: string, className: string, alt = 0, world = new Vector3(), priority = 0): Tag {
    const el = document.createElement('div');
    el.className = `absolute top-0 left-0 whitespace-nowrap will-change-transform ${className}`;
    el.innerHTML = html;
    el.setAttribute('aria-hidden', 'true');
    this.overlay.append(el);
    const t: Tag = { el, kind, alt, world, priority, w: 0, h: 0 };
    this.tags.push(t);
    return t;
  }

  private clear() {
    this.root.children.slice().forEach((c) => {
      disposeTree(c);
      this.root.remove(c);
    });
    this.lineMats = [];
    this.tags.forEach((t) => t.el.remove());
    this.tags = [];
    this.walls = [];
    this.corners = [];
    this.sonde = null;
  }

  setContent(c: Content) {
    this.clear();
    this.content = c;
    const { scene: s, pal, units } = c;
    const half = SIDE / 2;
    const y = (z: number) => (z / s.top) * HEIGHT;
    this.scene.background = new Color(pal.bg);

    const floor = new Mesh(new PlaneGeometry(SIDE, SIDE), new MeshBasicMaterial({ color: pal.floor, side: DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    this.root.add(floor);

    const steps = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000];
    const gridM = steps.find((m) => s.span / m <= 6) ?? 500_000;
    const grid: number[] = [];
    for (let k = Math.ceil(-s.span / 2 / gridM); k * gridM <= s.span / 2; k++) {
      const v = ((k * gridM) / s.span) * SIDE;
      if (Math.abs(v) >= half - 1e-3) continue;
      grid.push(v, 0.002, -half, v, 0.002, half, -half, 0.002, v, half, 0.002, v);
    }
    const gridGeo = new BufferGeometry();
    gridGeo.setAttribute('position', new Float32BufferAttribute(grid, 3));
    this.root.add(new LineSegments(gridGeo, new LineBasicMaterial({ color: pal.grid })));

    const wallDefs: [number, number, number][] = [
      [0, 0, -half],
      [-Math.PI / 2, half, 0],
      [Math.PI, 0, half],
      [Math.PI / 2, -half, 0],
    ];
    const bandOrder: Band['id'][] = ['troposphere', 'stratosphere', 'ozone', 'cloud'];
    for (const [angle, cx, cz] of wallDefs) {
      const group = new Group();
      group.position.set(cx, 0, cz);
      group.rotation.y = angle;
      for (const b of [...s.bands].sort((a, b2) => bandOrder.indexOf(a.id) - bandOrder.indexOf(b2.id))) {
        const h = y(b.to) - y(b.from);
        if (h <= 0) continue;
        const plane = new Mesh(new PlaneGeometry(SIDE, h), new MeshBasicMaterial({ color: pal[b.id], side: DoubleSide }));
        plane.position.set(0, y(b.from) + h / 2, 0.004 * (bandOrder.indexOf(b.id) + 1));
        group.add(plane);
        if (b.id === 'cloud') {
          for (const z of [b.from, b.to]) group.add(this.line([new Vector3(-half, y(z), 0.02), new Vector3(half, y(z), 0.02)], this.lineMat(pal.cloudEdge, 1)));
        }
      }
      const ticks: number[] = [];
      for (const z of s.ticks) if (z > 0 && z < s.top) ticks.push(-half, y(z), 0.025, half, y(z), 0.025);
      const tickGeo = new BufferGeometry();
      tickGeo.setAttribute('position', new Float32BufferAttribute(ticks, 3));
      group.add(new LineSegments(tickGeo, new LineBasicMaterial({ color: pal.grid })));
      group.add(
        this.line(
          [new Vector3(-half, y(s.tropopause.z), 0.03), new Vector3(half, y(s.tropopause.z), 0.03)],
          this.lineMat(pal.boundary, 1.5, { dashed: !s.tropopause.measured }),
        ),
      );
      if (s.freezing !== null && s.freezing > 0) {
        group.add(this.line([new Vector3(-half, y(s.freezing), 0.03), new Vector3(half, y(s.freezing), 0.03)], this.lineMat(pal.freezing, 1.2, { dashed: true })));
      }
      group.add(this.line([new Vector3(-half, HEIGHT, 0.03), new Vector3(half, HEIGHT, 0.03)], this.lineMat(pal.grid, 1)));
      this.root.add(group);
      const normal = new Vector3(Math.sin(angle), 0, Math.cos(angle));
      const axis = new Vector3(Math.cos(angle), 0, -Math.sin(angle));
      this.walls.push({ angle, centre: new Vector3(cx, 0, cz), axis, normal, group });
    }

    const corner = [
      [half, -half, 0, 1],
      [half, half, 1, 2],
      [-half, half, 2, 3],
      [-half, -half, 3, 0],
    ] as const;
    for (const [x, z, a, b] of corner) {
      const l = this.line([new Vector3(x, 0, z), new Vector3(x, HEIGHT, z)], this.lineMat(pal.grid, 1));
      this.root.add(l);
      this.corners.push({ line: l, walls: [a, b] });
    }

    const meas = s.measured.map((p) => this.toWorld(p, s));
    const fore = s.forecast.map((p) => this.toWorld(p, s));
    const flat = (pts: Vector3[]) => pts.map((p) => new Vector3(p.x, 0.006, p.z));
    const curtain = (pts: Vector3[], color: string, opacity: number) => {
      if (pts.length < 2) return;
      const pos: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        pos.push(a.x, 0.006, a.z, b.x, 0.006, b.z, b.x, b.y, b.z, a.x, 0.006, a.z, b.x, b.y, b.z, a.x, a.y, a.z);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const m = new Mesh(g, new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false }));
      m.renderOrder = -1;
      this.root.add(m);
    };
    curtain(meas, pal.accent, pal.curtain);
    curtain(fore, pal.pred, pal.curtain * 0.6);
    if (meas.length > 1) this.root.add(this.line(flat(meas), this.lineMat(pal.shadow, 1.3)));
    if (fore.length > 1) this.root.add(this.line(flat(fore), this.lineMat(pal.shadow, 1.2, { dashed: true })));
    if (fore.length > 1) this.root.add(this.line(fore, this.lineMat(pal.pred, 2, { dashed: true })));
    const faint = this.line(meas.length > 1 ? meas : [meas[0], meas[0]], this.lineMat(pal.accent, 2.5, { opacity: 0.25 }));
    const played = this.line(meas.length > 1 ? meas : [meas[0], meas[0]], this.lineMat(pal.accent, 2.5));
    faint.visible = false;
    this.root.add(faint, played);
    const drop = this.line([new Vector3(), new Vector3(0, 1, 0)], this.lineMat(pal.pred, 1.2, { dashed: true }));
    this.root.add(drop);

    const full = this.mode === 'full';
    const ring = (stroke: string, fill: string, size: number, inner = false) =>
      `<span class="absolute top-0 left-0 block -translate-x-1/2 -translate-y-1/2 rounded-full" style="width:${size}px;height:${size}px;background:${fill};border:2px solid ${stroke}">${
        inner ? `<span class="absolute top-1/2 left-1/2 block size-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full" style="background:${stroke}"></span>` : ''
      }</span>`;
    const caption = (text: string) => `<span class="atmo-label text-foreground absolute top-0 left-0 -translate-y-1/2 pl-[11px] text-[11.5px] font-semibold">${text}</span>`;

    this.tag('point', ring('var(--foreground)', 'var(--background)', 11) + (full ? caption(s.airborneStart ? 'Premier signal' : 'Lâcher') : ''), '', 0, this.toWorld(s.launch, s), 1);
    if (s.burst) this.tag('point', ring('var(--background)', 'var(--foreground)', 11) + (full ? caption('Éclatement') : ''), '', 0, this.toWorld(s.burst, s), 2);
    if (s.burstP) this.tag('point', ring('var(--chart-pred)', 'var(--background)', 10) + (full ? caption('Éclatement prévu') : ''), '', 0, this.toWorld(s.burstP, s), 2);
    if (s.landingP) this.tag('point', ring('var(--chart-pred)', 'var(--background)', 13, true) + (full ? caption('Atterrissage prévu') : ''), '', 0, this.toWorld(s.landingP, s), 1);

    const sondeTag = this.tag(
      'point',
      `<span class="absolute top-0 left-0 block size-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style="background:var(--primary);border-color:var(--background)"></span>${
        c.live ? '<span class="live-dot absolute top-0 left-0 block size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full" style="background:var(--primary)"></span>' : ''
      }<span data-alt class="atmo-label text-foreground font-heading tabular absolute top-0 left-0 -translate-y-1/2 pl-[13px] text-[13px] font-semibold"></span>`,
      'z-10',
      0,
      new Vector3(),
      3,
    );
    this.sonde = { tag: sondeTag, label: sondeTag.el.querySelector('[data-alt]') as HTMLElement, drop, played, faint };

    for (const z of s.ticks) this.tag('tick', tickLabel(z, units), 'atmo-label tabular text-faint text-[11px]', z);
    const names = s.bands.filter((b) => b.id !== 'cloud' || b.to - b.from >= 600);
    const shownClouds = new Set<number>();
    for (const b of names) {
      if (b.id === 'cloud') {
        const k = Math.round((b.from + b.to) / 2 / 1000);
        if (shownClouds.has(k)) continue;
        shownClouds.add(k);
      }
      const ozone = s.bands.find((x) => x.id === 'ozone');
      const mid = b.id === 'stratosphere' && ozone ? (b.from + ozone.from) / 2 : (b.from + b.to) / 2;
      const prio = b.id === 'troposphere' || b.id === 'stratosphere' ? 3 : b.id === 'ozone' ? 2 : 1;
      this.tag('name', b.label, `atmo-label text-[12px] ${prio === 3 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`, mid, new Vector3(), prio);
    }
    this.tag(
      'edge',
      s.tropopause.measured ? `Tropopause ${fmtAltShort(s.tropopause.z, units)}` : `Tropopause typique ${fmtAltShort(s.tropopause.z, units)}`,
      'atmo-label text-foreground text-[11.5px] font-semibold',
      s.tropopause.z,
      new Vector3(),
      3,
    );
    if (s.freezing !== null && s.freezing > 0) this.tag('edge', `0 °C à ${fmtAltShort(s.freezing, units)}`, 'atmo-label text-muted-foreground text-[11.5px]', s.freezing, new Vector3(), 2);
    for (const [a, b] of s.clouds) {
      if (b - a < 300) continue;
      this.tag('band', 'Nuages', 'atmo-label text-muted-foreground text-[11.5px]', (a + b) / 2, new Vector3(), 1);
    }
    this.tag('point', 'N', 'text-faint text-[11px] font-semibold -translate-x-1/2 -translate-y-1/2', 0, new Vector3(0, 0.01, -half + 0.45), 0);

    this.setIndex(this.index);
  }

  measure() {
    for (const t of this.tags) {
      const target = t.kind === 'point' ? (t.el.querySelector('.atmo-label') as HTMLElement | null) : t.el;
      t.w = target?.offsetWidth ?? 0;
      t.h = target?.offsetHeight ?? 0;
    }
  }

  setIndex(index: number | null) {
    this.index = index;
    const c = this.content;
    const so = this.sonde;
    if (!c || !so) return;
    const s = c.scene;
    const i = index === null ? s.currentIndex : Math.min(s.currentIndex, Math.max(0, index));
    const p = index === null ? s.current : positionAt(c.flight, s, i);
    const w = this.toWorld(p, s);
    so.tag.world.copy(w);
    so.label.textContent = fmtAltShort(p[2], c.units);
    (so.drop.geometry as LineGeometry).setPositions([w.x, w.y, w.z, w.x, 0.006, w.z]);
    so.drop.computeLineDistances();
    so.drop.visible = w.y > 0.05;
    let k = 0;
    while (k < s.measuredIdx.length && s.measuredIdx[k] <= i) k++;
    const segments = Math.max(0, k - 1);
    (so.played.geometry as LineGeometry).instanceCount = index === null ? Infinity : segments;
    so.faint.visible = index !== null;
    this.measure();
    this.request();
  }

  private project(v: Vector3): { x: number; y: number; ok: boolean } {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, ok: p.z < 1 };
  }

  private layout() {
    const c = this.content;
    if (!c) return;
    const cam = this.camera.position;
    const visible = this.walls.map((w) => w.normal.dot(cam.clone().sub(w.centre)) > 0);
    this.walls.forEach((w, i) => (w.group.visible = visible[i]));
    this.corners.forEach((k) => (k.line.visible = visible[k.walls[0]] || visible[k.walls[1]]));

    const shown = this.walls
      .map((w, i) => ({ w, i, sx: this.project(w.centre).x }))
      .filter((x) => visible[x.i])
      .sort((a, b) => a.sx - b.sx);
    const left = shown[0]?.w;
    const right = shown[shown.length - 1]?.w;
    const y = (z: number) => (z / c.scene.top) * HEIGHT;
    const end = (w: Wall, side: 'left' | 'right', z: number, t = 1) => {
      const half = SIDE / 2;
      const a = w.centre.clone().addScaledVector(w.axis, half * t).setY(y(z));
      const b = w.centre.clone().addScaledVector(w.axis, -half * t).setY(y(z));
      const pa = this.project(a).x;
      const pb = this.project(b).x;
      return (side === 'left' ? pa < pb : pa > pb) ? a : b;
    };

    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const collide = (r: { x: number; y: number; w: number; h: number }) => placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    const put = (t: Tag, x: number, yy: number, ax: number, ay: number, avoid: boolean) => {
      const rx = x - t.w * ax;
      const ry = yy - t.h * ay;
      const rect = { x: rx - 3, y: ry - 2, w: t.w + 6, h: t.h + 4 };
      const off = rx < -2 || rx + t.w > this.width + 2 || ry < -2 || ry + t.h > this.height + 2;
      if (off || (avoid && collide(rect))) {
        t.el.style.visibility = 'hidden';
        return;
      }
      if (avoid) placed.push(rect);
      t.el.style.visibility = 'visible';
      t.el.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
    };

    const order = [...this.tags].sort((a, b) => (a.kind === 'point' ? -1 : 0) - (b.kind === 'point' ? -1 : 0) || b.priority - a.priority);
    for (const t of order) {
      if (t.kind === 'point') {
        const p = this.project(t.world);
        if (!p.ok) {
          t.el.style.visibility = 'hidden';
          continue;
        }
        t.el.style.visibility = 'visible';
        t.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
        placed.push({ x: p.x - 8, y: p.y - 9, w: 16 + (t.w ? t.w + 12 : 0), h: 18 });
        continue;
      }
      if (!left || !right) {
        t.el.style.visibility = 'hidden';
        continue;
      }
      if (t.kind === 'tick') {
        const p = this.project(end(left, 'left', t.alt));
        put(t, p.x - 7, p.y, 1, 0.5, true);
      } else if (t.kind === 'name') {
        const p = this.project(left.centre.clone().setY(y(t.alt)));
        put(t, p.x, p.y, 0.5, 0.5, true);
      } else {
        const p = this.project(end(right, 'right', t.alt, 0.9));
        if (t.kind === 'band') put(t, p.x, p.y, 1, 0.5, true);
        else put(t, p.x, p.y - 3, 1, 1, true);
      }
    }
  }

  render() {
    if (!this.width) return;
    this.camera.updateMatrixWorld();
    this.layout();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.controls?.dispose();
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export interface Atmosphere3DProps {
  scene: AtmoScene;
  flight: FlightData;
  theme: 'dark' | 'light';
  units: Units;
  mode: Mode;
  index: number | null;
  live: boolean;
  resetKey?: number;
  label: string;
  className?: string;
}

export default function Atmosphere3D({ scene, flight, theme, units, mode, index, live, resetKey, label, className }: Atmosphere3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current || !overlay.current) return;
    let e: Engine;
    try {
      e = new Engine(host.current, overlay.current, mode);
    } catch {
      setFailed(true);
      return;
    }
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [mode]);

  useEffect(() => {
    engine.current?.setContent({ scene, flight, pal: palette(theme), units, live });
  }, [scene, flight, theme, units, live, mode]);

  useEffect(() => {
    engine.current?.setIndex(index);
  }, [index]);

  useEffect(() => {
    if (resetKey) engine.current?.reset();
  }, [resetKey]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    let alive = true;
    document.fonts.ready.then(() => {
      if (!alive || !engine.current) return;
      engine.current.measure();
      engine.current.request();
    });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="bg-surface flex h-full items-center justify-center rounded-md border px-6 text-center text-[13px]">
        La vue 3D demande WebGL, qui n’est pas disponible sur cet appareil ou ce navigateur.
      </div>
    );
  }

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      tabIndex={mode === 'preview' ? 0 : undefined}
      className={`focus-visible:ring-ring/50 relative h-full w-full overflow-hidden outline-none select-none focus-visible:ring-2 ${mode === 'preview' ? 'cursor-grab touch-pan-y active:cursor-grabbing' : 'touch-none'} ${className ?? ''}`}
    >
      <div ref={overlay} className="pointer-events-none absolute inset-0" />
    </div>
  );
}
