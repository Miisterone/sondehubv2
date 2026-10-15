import { useEffect, useRef, useState } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Spherical,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { FlightData } from '@/lib/flight';
import { HEIGHT, SIDE, positionAt, type AtmoOptions, type AtmoScene, type AtmoView, type Vec3 } from '@/lib/atmo3d';
import { elevationAt, type TerrainGrid } from '@/lib/terrainGrid';
import { FLOOR_ATTRIBUTION, TERRAIN_ATTRIBUTION, type FloorMap } from '@/lib/floorMap';
import { fmtAlt, fmtAltShort, fmtDist, type Units } from '@/lib/format';
import { intlTag, t, useT, type TKey } from '@/i18n';
import { altRange } from './atmoFormat';

const FOV = 30;
const VIEW = { theta: 0.42, phi: 1.2 };
const H = SIDE / 2;
const PLATE = 0.14;
const SPHERE_PX = { preview: 6.5, full: 8 };

export type { AtmoOptions, AtmoView };

type Mode = 'preview' | 'full';

interface Palette {
  bg: string;
  floor: string;
  plateSide: string;
  plateEdge: string;
  tropo: string;
  strat: string;
  ozone: string;
  cloudWall: string;
  tick: string;
  column: string;
  sheet: string;
  sheetOpacity: number;
  sheetEdge: string;
  boundary: string;
  cloudEdge: string;
  freezing: string;
  proj: string;
  accent: string;
  pred: string;
  ring: string;
  ringOpacity: number;
  payload: string;
  ink: string;
  section: string;
  sectionEdge: string;
  curtain: number;
  sky: string;
  ground: string;
}

function palette(theme: 'dark' | 'light'): Palette {
  return theme === 'dark'
    ? {
        bg: '#0e1013',
        floor: '#16191d',
        plateSide: '#1b1f24',
        plateEdge: '#2c3137',
        tropo: '#15181d',
        strat: '#111317',
        ozone: '#151927',
        cloudWall: '#1d2127',
        tick: '#22262c',
        column: '#2a2f36',
        sheet: '#6e7783',
        sheetOpacity: 0.12,
        sheetEdge: '#5a626d',
        boundary: '#9aa4b1',
        cloudEdge: '#454c57',
        freezing: '#7d8796',
        proj: '#3a414b',
        accent: '#8199f0',
        pred: '#7d8796',
        ring: '#f6f8fa',
        ringOpacity: 0.16,
        payload: '#d8dde4',
        ink: '#f6f8fa',
        section: '#1d2127',
        sectionEdge: '#5a626d',
        curtain: 0.09,
        sky: '#cfd6e6',
        ground: '#20242a',
      }
    : {
        bg: '#ffffff',
        floor: '#f6f8fa',
        plateSide: '#e4e9ef',
        plateEdge: '#cfd6de',
        tropo: '#f2f4f7',
        strat: '#fbfcfd',
        ozone: '#eff1f9',
        cloudWall: '#e9edf2',
        tick: '#e6e8eb',
        column: '#d9dee5',
        sheet: '#c3ccd8',
        sheetOpacity: 0.13,
        sheetEdge: '#a7b0bc',
        boundary: '#6f7a89',
        cloudEdge: '#c9d0d9',
        freezing: '#7d8796',
        proj: '#b3bcc7',
        accent: '#3451d1',
        pred: '#7d8796',
        ring: '#0a0a0a',
        ringOpacity: 0.2,
        payload: '#f6f8fa',
        ink: '#0a0a0a',
        section: '#e6eaef',
        sectionEdge: '#9aa4b1',
        curtain: 0.06,
        sky: '#ffffff',
        ground: '#b9c2cf',
      };
}

const clock = (s: number) => new Date(s * 1000).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit' });

function tickLabel(z: number, units: Units): string {
  return units === 'metric' ? `${Math.round(z / 1000)} km` : `${Math.round((z * 3.28084) / 1000)} kft`;
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

function niceStep(total: number, maxCount: number, steps: number[]): number {
  return steps.find((s) => total / s <= maxCount) ?? steps[steps.length - 1];
}

interface Align {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
}

interface Tag {
  el: HTMLElement;
  views: AtmoView[];
  prio: number;
  force: boolean;
  marker: boolean;
  anchor: () => Vector3 | null;
  align: (v: AtmoView) => Align;
  texts: { el: HTMLElement; get: () => string }[];
  w: number;
  h: number;
}

interface Wall {
  id: 'n' | 'e' | 's' | 'w';
  centre: Vector3;
  normal: Vector3;
  group: Group;
  shadow: Object3D[];
}

interface DropLine {
  t: number;
  objects: Object3D[];
}

interface Content {
  scene: AtmoScene;
  flight: FlightData;
  theme: 'dark' | 'light';
  pal: Palette;
  units: Units;
  live: boolean;
  options: AtmoOptions;
  floor: FloorMap | null;
  terrain: TerrainGrid | null;
}

interface Dynamic {
  balloon: Group;
  balloonTag: Tag;
  drop: Line2 | null;
  groundRing: Line2 | null;
  played: Line2;
  faint: Line2;
  curtain: Mesh | null;
  drops: DropLine[];
  current: Vector3;
}

const ALIGN = {
  left: { ax: 1, ay: 0.5, dx: -10, dy: 0 },
  right: { ax: 0, ay: 0.5, dx: 10, dy: 0 },
  centre: { ax: 0.5, ay: 0.5, dx: 0, dy: 0 },
} satisfies Record<string, Align>;

class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly pc = new PerspectiveCamera(FOV, 1, 0.1, 500);
  readonly oc = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  readonly root = new Group();
  readonly target = new Vector3(0, HEIGHT * 0.5, 0);
  readonly sph = { ...VIEW, zoom: 1 };
  view: AtmoView = 'persp';
  controls: OrbitControls | null = null;
  walls: Wall[] = [];
  visible: boolean[] = [];
  tags: Tag[] = [];
  content: Content | null = null;
  dyn: Dynamic | null = null;
  index: number | null = null;
  width = 0;
  height = 0;
  fitDist = 40;
  K = 1;
  axis = new Vector3(1, 0, 0);
  raf = 0;
  floorTex: { floor: FloorMap; tex: CanvasTexture } | null = null;
  terrainActive = false;
  private hemi = new HemisphereLight('#ffffff', '#b9c2cf', 1.6);
  private sun = new DirectionalLight('#ffffff', 1.5);
  private compass: HTMLElement;
  private needle: HTMLElement;
  private credit: HTMLElement;
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private clip = [
    new Plane(new Vector3(1, 0, 0), H),
    new Plane(new Vector3(-1, 0, 0), H),
    new Plane(new Vector3(0, 0, 1), H),
    new Plane(new Vector3(0, 0, -1), H),
  ];

  constructor(
    private host: HTMLDivElement,
    private overlay: HTMLDivElement,
    private mode: Mode,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.className = 'block h-full w-full';
    host.prepend(this.renderer.domElement);
    this.scene.add(this.root, this.hemi, this.sun);

    this.compass = document.createElement('div');
    this.compass.className = 'bg-background absolute bottom-3 left-3 flex size-[34px] items-center justify-center rounded-full border';
    this.compass.setAttribute('aria-hidden', 'true');
    this.needle = document.createElement('div');
    this.needle.className = 'relative size-[26px]';
    this.needle.innerHTML =
      '<svg width="26" height="26" viewBox="-13 -13 26 26"><path d="M0,-10 L3.6,1 L0,-1.4 L-3.6,1 Z" fill="var(--foreground)"/><path d="M0,10 L3.6,1 L0,3.2 L-3.6,1 Z" fill="var(--text-faint)" opacity="0.55"/></svg><span class="text-foreground absolute left-1/2 -translate-x-1/2 text-[9.5px] font-bold" style="top:-13px">N</span>';
    this.compass.append(this.needle);
    overlay.append(this.compass);
    this.credit = document.createElement('div');
    this.credit.className = 'text-faint absolute right-2 bottom-1.5 text-[10px]';
    this.credit.setAttribute('aria-hidden', 'true');
    overlay.append(this.credit);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  camera() {
    return this.view === 'persp' ? this.pc : this.oc;
  }

  private bindPreviewDrag() {
    const el = this.host;
    let last: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || this.view !== 'persp') return;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!last || e.pointerId !== last.id) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.sph.theta -= dx * 0.009;
      if (e.pointerType === 'mouse') this.sph.phi = MathUtils.clamp(this.sph.phi - dy * 0.006, 0.3, 1.45);
      this.applyView();
      this.request();
    };
    const up = (e: PointerEvent) => {
      if (last && e.pointerId === last.id) last = null;
    };
    const key = (e: KeyboardEvent) => {
      if (this.view !== 'persp') return;
      const step = { ArrowLeft: 0.12, ArrowRight: -0.12 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      this.sph.theta += step;
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

  private setupControls() {
    this.controls?.dispose();
    this.controls = null;
    if (this.mode !== 'full') return;
    const c = new OrbitControls(this.camera(), this.renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    if (this.view === 'persp') {
      c.enablePan = false;
      c.minPolarAngle = 0.12;
      c.maxPolarAngle = 1.5;
      c.rotateSpeed = 0.7;
      c.target.copy(this.target);
      c.minDistance = this.fitDist * 0.35;
      c.maxDistance = this.fitDist * 1.7;
    } else {
      c.enableRotate = false;
      c.screenSpacePanning = true;
      c.minZoom = 0.8;
      c.maxZoom = 8;
      c.target.set(0, 0, 0);
    }
    c.addEventListener('change', () => this.request());
    this.controls = c;
  }

  private margins() {
    const small = this.mode === 'preview' || this.width < 560;
    if (this.view === 'top') return small ? { l: 10, r: 10, t: 10, b: 20 } : { l: 24, r: 24, t: 24, b: 28 };
    if (this.view === 'profile') return small ? { l: 46, r: 86, t: 14, b: 46 } : { l: 64, r: 190, t: 28, b: 72 };
    return small ? { l: 46, r: 84, t: 10, b: 20 } : { l: 64, r: 200, t: 28, b: 40 };
  }

  private fit() {
    const w = this.width;
    const h = this.height;
    const m = this.margins();
    const aw = Math.max(40, w - m.l - m.r);
    const ah = Math.max(40, h - m.t - m.b);
    if (this.view === 'persp') {
      const pc = this.pc;
      pc.aspect = w / h;
      pc.clearViewOffset();
      pc.updateProjectionMatrix();
      const corners: Vector3[] = [];
      for (const x of [-H, H]) for (const z of [-H, H]) for (const y of [-PLATE, HEIGHT]) corners.push(new Vector3(x, y, z));
      const dir = new Vector3().setFromSpherical(new Spherical(1, VIEW.phi, VIEW.theta));
      let d = 40;
      let box = { x0: 0, x1: 0, y0: 0, y1: 0 };
      for (let it = 0; it < 30; it++) {
        pc.position.copy(this.target).addScaledVector(dir, d);
        pc.lookAt(this.target);
        pc.updateMatrixWorld();
        box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        for (const c of corners) {
          const p = c.clone().project(pc);
          const sx = (p.x * 0.5 + 0.5) * w;
          const sy = (-p.y * 0.5 + 0.5) * h;
          box.x0 = Math.min(box.x0, sx);
          box.x1 = Math.max(box.x1, sx);
          box.y0 = Math.min(box.y0, sy);
          box.y1 = Math.max(box.y1, sy);
        }
        d *= Math.pow(Math.max((box.x1 - box.x0) / aw, (box.y1 - box.y0) / ah), 0.85);
      }
      this.fitDist = d;
      if (this.controls) {
        this.controls.minDistance = d * 0.35;
        this.controls.maxDistance = d * 1.7;
      }
      pc.setViewOffset(w, h, (box.x0 + box.x1) / 2 - (m.l + aw / 2), (box.y0 + box.y1) / 2 - (m.t + ah / 2), w, h);
      this.applyView();
    } else {
      const oc = this.oc;
      const top = this.view === 'top';
      const s = top ? Math.min(aw, ah) / SIDE : Math.min(aw / SIDE, ah / (HEIGHT + PLATE));
      const cy = top ? 0 : (HEIGHT - PLATE) / 2;
      oc.left = -(m.l + aw / 2) / s;
      oc.right = oc.left + w / s;
      oc.top = cy + (m.t + ah / 2) / s;
      oc.bottom = oc.top - h / s;
      oc.zoom = 1;
      if (top) {
        oc.up.set(0, 0, -1);
        oc.position.set(0, 80, 0);
      } else {
        const fwd = new Vector3(0, 1, 0).cross(this.axis);
        oc.up.set(0, 1, 0);
        oc.position.copy(fwd).multiplyScalar(-80);
      }
      oc.lookAt(0, 0, 0);
      oc.updateProjectionMatrix();
      oc.updateMatrixWorld();
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
    }
    const cam = this.camera();
    cam.updateMatrixWorld();
    const ref = new Vector3(0, this.view === 'top' ? 0 : HEIGHT * 0.5, 0);
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const a = this.project(ref);
    const b = this.project(ref.clone().add(right));
    const ppu = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    this.K = SPHERE_PX[this.mode] / (0.15 * ppu);
  }

  applyView() {
    if (this.view !== 'persp') return;
    const s = new Spherical(this.fitDist * this.sph.zoom, this.sph.phi, this.sph.theta);
    this.pc.position.setFromSpherical(s).add(this.target);
    this.pc.lookAt(this.target);
    if (this.controls) this.controls.update();
  }

  reset() {
    Object.assign(this.sph, VIEW, { zoom: 1 });
    this.fit();
    if (this.controls) {
      this.controls.target.copy(this.view === 'persp' ? this.target : new Vector3());
      this.controls.update();
    }
    this.request();
  }

  setView(view: AtmoView) {
    this.view = view;
    Object.assign(this.sph, VIEW, { zoom: 1 });
    this.setupControls();
    if (this.mode === 'preview' && !this.cleanup.length) this.bindPreviewDrag();
    if (this.width) this.fit();
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0 || (w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    const prevK = this.K;
    this.fit();
    if (this.content && Math.abs(this.K / prevK - 1) > 0.15) this.build(this.content);
    else this.render();
  }

  request() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.controls?.update();
      this.render();
    });
  }

  private project(v: Vector3): { x: number; y: number; ok: boolean } {
    const p = v.clone().project(this.camera());
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, ok: p.z < 1 && p.z > -1 };
  }

  private lineMats: LineMaterial[] = [];

  private line(points: Vector3[], color: string, width: number, o: { dashed?: boolean; opacity?: number; dash?: [number, number]; clip?: boolean; noDepth?: boolean } = {}): Line2 {
    const g = new LineGeometry();
    g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
    const op = o.opacity ?? 1;
    const m = new LineMaterial({
      color,
      linewidth: width,
      worldUnits: false,
      dashed: !!o.dashed,
      dashSize: (o.dash?.[0] ?? 0.16) * this.K,
      gapSize: (o.dash?.[1] ?? 0.12) * this.K,
      transparent: op < 1,
      opacity: op,
      depthWrite: op >= 1 && !o.noDepth,
      clippingPlanes: o.clip ? this.clip : null,
    });
    m.resolution.set(this.width || 1, this.height || 1);
    this.lineMats.push(m);
    const l = new Line2(g, m);
    if (o.dashed) l.computeLineDistances();
    return l;
  }

  private basic(color: string, opacity?: number) {
    return new MeshBasicMaterial({ color, side: DoubleSide, transparent: opacity !== undefined, opacity: opacity ?? 1, depthWrite: opacity === undefined });
  }

  private addTag(o: {
    views: AtmoView[];
    prio: number;
    anchor: () => Vector3 | null;
    align: Align | ((v: AtmoView) => Align);
    title: () => string;
    sub?: () => string;
    titleCls?: string;
    cls?: string;
    force?: boolean;
  }): Tag {
    const el = document.createElement('div');
    el.className = `atmo-label tabular absolute top-0 left-0 text-[11.5px] leading-[1.25] whitespace-nowrap will-change-transform ${o.cls ?? 'text-muted-foreground'}`;
    el.setAttribute('aria-hidden', 'true');
    el.style.visibility = 'hidden';
    const title = document.createElement('span');
    title.className = `block ${o.titleCls ?? ''}`;
    el.append(title);
    const texts = [{ el: title, get: o.title }];
    if (o.sub) {
      const sub = document.createElement('span');
      sub.className = 'text-faint block text-[11px] font-normal';
      el.append(sub);
      texts.push({ el: sub, get: o.sub });
    }
    for (const x of texts) x.el.textContent = x.get();
    this.overlay.append(el);
    const align = o.align;
    const tag: Tag = { el, views: o.views, prio: o.prio, force: !!o.force, marker: false, anchor: o.anchor, align: typeof align === 'function' ? align : () => align, texts, w: 0, h: 0 };
    this.tags.push(tag);
    return tag;
  }

  private addMarker(views: AtmoView[], anchor: () => Vector3 | null, style: string, size: number): Tag {
    const el = document.createElement('span');
    el.className = 'absolute top-0 left-0 block rounded-full will-change-transform';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText += `width:${size}px;height:${size}px;box-sizing:border-box;visibility:hidden;${style}`;
    this.overlay.append(el);
    const tag: Tag = { el, views, prio: 100, force: true, marker: true, anchor, align: () => ({ ax: 0.5, ay: 0.5, dx: 0, dy: 0 }), texts: [], w: size, h: size };
    this.tags.push(tag);
    return tag;
  }

  relabel() {
    for (const tg of this.tags) for (const x of tg.texts) x.el.textContent = x.get();
    this.setIndex(this.index);
  }

  private clear() {
    this.root.children.slice().forEach((c) => {
      disposeTree(c);
      this.root.remove(c);
    });
    this.lineMats = [];
    this.tags.forEach((tg) => tg.el.remove());
    this.tags = [];
    this.walls = [];
    this.dyn = null;
  }

  setContent(c: Content) {
    this.content = c;
    const axis = this.axisFor(c.scene);
    if (!axis.equals(this.axis)) {
      this.axis = axis;
      if (this.view === 'profile' && this.width) this.fit();
    }
    this.build(c);
  }

  private axisFor(s: AtmoScene): Vector3 {
    const first = s.launch;
    const last = s.forecast[s.forecast.length - 1] ?? s.measured[s.measured.length - 1] ?? first;
    const dx = last[0] - first[0];
    const dz = -(last[1] - first[1]);
    return Math.abs(dx) >= Math.abs(dz) ? new Vector3(Math.sign(dx) || 1, 0, 0) : new Vector3(0, 0, Math.sign(dz) || 1);
  }

  private floorTexture(floor: FloorMap): CanvasTexture {
    if (this.floorTex?.floor === floor) return this.floorTex.tex;
    this.floorTex?.tex.dispose();
    const tex = new CanvasTexture(floor.canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.floorTex = { floor, tex };
    return tex;
  }

  private build(c: Content) {
    this.clear();
    const { scene: s, pal, units, flight, options } = c;
    const view = this.view;
    const K = this.K;
    const full = this.mode === 'full';
    const y = (z: number) => (z / s.top) * HEIGHT;
    const W = (p: Vec3) => new Vector3(((p[0] - s.center[0]) / s.span) * SIDE, y(p[2]), -((p[1] - s.center[1]) / s.span) * SIDE);
    const lonAt = (x: number) => s.bounds.west + ((x + H) / SIDE) * (s.bounds.east - s.bounds.west);
    const latAt = (z: number) => s.bounds.north - ((z + H) / SIDE) * (s.bounds.north - s.bounds.south);
    const terrain = c.terrain;
    this.terrainActive = !!terrain && options.terrain && view !== 'profile';
    const elev = (x: number, z: number) => (terrain ? elevationAt(terrain, (x + H) / SIDE, (z + H) / SIDE) : 0);
    const groundY = (x: number, z: number) => (this.terrainActive ? y(elev(x, z)) : 0);
    const onGround = (v: Vector3, lift = 0) => v.setY(groundY(v.x, v.z) + lift);

    this.scene.background = new Color(pal.bg);
    this.hemi.color.set(pal.sky);
    this.hemi.groundColor.set(pal.ground);
    this.hemi.intensity = this.terrainActive ? 1.35 : 1.6;
    this.sun.intensity = this.terrainActive ? 2.3 : 1.5;
    this.sun.position.set(...((this.terrainActive ? [-5, 6, -5] : [-4, 10, 6]) as [number, number, number]));

    const tex = options.map && c.floor ? this.floorTexture(c.floor) : null;
    const uvOf = (x: number, z: number): [number, number] => (c.floor ? c.floor.uv(latAt(z), lonAt(x)) : [(x + H) / SIDE, 1 - (z + H) / SIDE]);
    const side = new MeshLambertMaterial({ color: pal.plateSide, side: DoubleSide });

    const grid = (n: number, height: (x: number, z: number) => number) => {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = -H + (i / (n - 1)) * SIDE;
          const z = -H + (j / (n - 1)) * SIDE;
          pos.push(x, height(x, z), z);
          uv.push(...uvOf(x, z));
        }
      }
      for (let j = 0; j < n - 1; j++) {
        for (let i = 0; i < n - 1; i++) {
          const a = j * n + i;
          idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };

    if (this.terrainActive && terrain) {
      const n = Math.min(terrain.n, this.mode === 'full' ? 192 : 128);
      const surf = new Mesh(grid(n, groundY), tex ? new MeshLambertMaterial({ map: tex }) : new MeshLambertMaterial({ color: pal.floor }));
      this.root.add(surf);
      const edges = [
        (k: number) => new Vector3(-H + k * SIDE, 0, -H),
        (k: number) => new Vector3(H, 0, -H + k * SIDE),
        (k: number) => new Vector3(H - k * SIDE, 0, H),
        (k: number) => new Vector3(-H, 0, H - k * SIDE),
      ];
      for (const e of edges) {
        const sp: number[] = [];
        const top: Vector3[] = [];
        const m = 160;
        for (let k = 0; k < m; k++) {
          const a = e(k / (m - 1));
          if (k < m - 1) {
            const b = e((k + 1) / (m - 1));
            const ya = groundY(a.x, a.z);
            const yb = groundY(b.x, b.z);
            sp.push(a.x, -PLATE, a.z, b.x, -PLATE, b.z, b.x, yb, b.z, a.x, -PLATE, a.z, b.x, yb, b.z, a.x, ya, a.z);
          }
          top.push(onGround(a.clone()));
        }
        const sg = new BufferGeometry();
        sg.setAttribute('position', new Float32BufferAttribute(sp, 3));
        sg.computeVertexNormals();
        this.root.add(new Mesh(sg, side.clone()));
        this.root.add(this.line(top, pal.plateEdge, 1));
        this.root.add(this.line([e(0).setY(-PLATE), e(1).setY(-PLATE)], pal.plateEdge, 1));
      }
      for (const [x, z] of [
        [-H, -H],
        [H, -H],
        [H, H],
        [-H, H],
      ])
        this.root.add(this.line([new Vector3(x, -PLATE, z), new Vector3(x, groundY(x, z), z)], pal.plateEdge, 1));
    } else {
      const top = new Mesh(grid(view === 'top' ? 32 : 24, () => 0), tex ? new MeshBasicMaterial({ map: tex }) : new MeshBasicMaterial({ color: pal.floor }));
      this.root.add(top);
      const box = new BoxGeometry(SIDE, PLATE, SIDE);
      const plate = new Mesh(box, side);
      plate.position.y = -PLATE / 2 - 0.002;
      this.root.add(plate);
      const edges = new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color: pal.plateEdge }));
      edges.position.copy(plate.position);
      this.root.add(edges);
    }

    const meas = s.measured.map(W);
    const fore = s.forecast.map(W);
    const all = meas.concat(fore);
    const launchW = W(s.launch);
    const alongX = this.axis.x !== 0;

    const wallDefs: { id: Wall['id']; centre: Vector3; normal: Vector3; rot: number }[] = [
      { id: 'n', centre: new Vector3(0, 0, -H), normal: new Vector3(0, 0, 1), rot: 0 },
      { id: 'e', centre: new Vector3(H, 0, 0), normal: new Vector3(-1, 0, 0), rot: -Math.PI / 2 },
      { id: 's', centre: new Vector3(0, 0, H), normal: new Vector3(0, 0, -1), rot: Math.PI },
      { id: 'w', centre: new Vector3(-H, 0, 0), normal: new Vector3(1, 0, 0), rot: Math.PI / 2 },
    ];
    const bands: { from: number; to: number; color: string; o: number }[] = [
      { from: 0, to: s.tropopause.z, color: pal.tropo, o: 1 },
      { from: s.tropopause.z, to: s.top, color: pal.strat, o: 2 },
      ...s.bands.filter((b) => b.id === 'ozone').map((b) => ({ from: b.from, to: b.to, color: pal.ozone, o: 3 })),
      ...s.clouds.map(([a, b]) => ({ from: Math.max(0, a), to: Math.min(s.top, b), color: pal.cloudWall, o: 4 })),
    ];
    const minor: number[] = [];
    for (let z = 5000; z < s.top; z += 5000) minor.push(z);

    if (view !== 'top') {
      for (const wd of wallDefs) {
        const g = new Group();
        g.position.copy(wd.centre);
        g.rotation.y = wd.rot;
        for (const b of bands) {
          const hh = y(b.to) - y(b.from);
          if (hh <= 0) continue;
          const m = new Mesh(new PlaneGeometry(SIDE, hh), this.basic(b.color));
          m.position.set(0, y(b.from) + hh / 2, 0.003 * b.o);
          g.add(m);
        }
        const tp: number[] = [];
        for (const z of minor) tp.push(-H, y(z), 0.02, H, y(z), 0.02);
        const tg = new BufferGeometry();
        tg.setAttribute('position', new Float32BufferAttribute(tp, 3));
        g.add(new LineSegments(tg, new LineBasicMaterial({ color: pal.tick })));
        g.add(this.line([new Vector3(-H, y(s.tropopause.z), 0.025), new Vector3(H, y(s.tropopause.z), 0.025)], pal.boundary, 1.4, { dashed: !s.tropopause.measured }));
        if (s.freezing !== null && s.freezing > 0)
          g.add(this.line([new Vector3(-H, y(s.freezing), 0.025), new Vector3(H, y(s.freezing), 0.025)], pal.freezing, 1.1, { dashed: true, dash: [0.12, 0.1] }));
        for (const [a, b] of s.clouds) for (const z of [a, b]) if (z > 0 && z < s.top) g.add(this.line([new Vector3(-H, y(z), 0.022), new Vector3(H, y(z), 0.022)], pal.cloudEdge, 1));
        this.root.add(g);
        const shadow: Object3D[] = [];
        const parallel = alongX ? wd.id === 'n' || wd.id === 's' : wd.id === 'e' || wd.id === 'w';
        if (view === 'persp' && parallel && options.wallShadow) {
          const proj = (v: Vector3) => {
            const p = v.clone();
            if (wd.id === 'n') p.z = -H + 0.03;
            if (wd.id === 's') p.z = H - 0.03;
            if (wd.id === 'e') p.x = H - 0.03;
            if (wd.id === 'w') p.x = -H + 0.03;
            return p;
          };
          if (meas.length > 1) shadow.push(this.line(meas.map(proj), pal.proj, 1.3));
          if (fore.length > 1) shadow.push(this.line(fore.map(proj), pal.proj, 1.1, { dashed: true }));
          shadow.forEach((o) => this.root.add(o));
        }
        this.walls.push({ id: wd.id, centre: wd.centre, normal: wd.normal, group: g, shadow });
      }
    }

    if (view === 'persp') {
      const corners: [number, number][] = [
        [H, -H],
        [H, H],
        [-H, H],
        [-H, -H],
      ];
      for (const [x, z] of corners) this.root.add(this.line([new Vector3(x, groundY(x, z), z), new Vector3(x, HEIGHT, z)], pal.column, 1));
      this.root.add(this.line([...corners, corners[0]].map(([x, z]) => new Vector3(x, HEIGHT, z)), pal.column, 1));
      const sheet = new Mesh(new PlaneGeometry(SIDE, SIDE), this.basic(pal.sheet, pal.sheetOpacity));
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = y(s.tropopause.z);
      sheet.renderOrder = 2;
      this.root.add(sheet);
      this.root.add(this.line([...corners, corners[0]].map(([x, z]) => new Vector3(x, y(s.tropopause.z), z)), pal.sheetEdge, 1.2, { dashed: !s.tropopause.measured }));
    }

    const circle = (cx: number, cz: number, r: number, n: number, lift: number) => {
      const out: Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push(onGround(new Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r), lift));
      }
      return out;
    };

    const unitM = units === 'metric' ? 1000 : 1609.344;
    const ringStep = niceStep(s.span / unitM, 5, units === 'metric' ? [2, 5, 10, 25, 50, 100, 250, 500] : [1, 2, 5, 10, 20, 50, 100, 200, 500]);
    if (view !== 'profile') {
      for (let k = 1; k * ringStep * unitM < s.span * 1.45; k++) {
        const rw = ((k * ringStep * unitM) / s.span) * SIDE;
        this.root.add(this.line(circle(launchW.x, launchW.z, rw, this.terrainActive ? 360 : 200, this.terrainActive ? 0.014 : 0.006), pal.ring, 1, { opacity: pal.ringOpacity, clip: true, dashed: true, dash: [0.08, 0.08] }));
        const ang = view === 'top' ? -Math.PI * 0.32 : -Math.PI * 0.2;
        const at = new Vector3(launchW.x + Math.cos(ang) * rw, 0, launchW.z - Math.sin(ang) * rw);
        if (full && Math.abs(at.x) < H - 0.25 && Math.abs(at.z) < H - 0.25) {
          const label = fmtDist(k * ringStep * unitM, units);
          this.addTag({ views: ['persp', 'top'], prio: 1, anchor: () => onGround(at.clone(), 0.01), align: ALIGN.centre, title: () => label, cls: 'text-faint text-[10.5px]' });
        }
      }
    }

    const dropStep = units === 'metric' ? 2500 : 3048;
    const drops: DropLine[] = [];
    if (view === 'persp') {
      if (meas.length > 1) this.root.add(this.line(meas.map((p) => onGround(p.clone(), 0.016)), pal.accent, 1.6, { opacity: 0.55 }));
      if (fore.length > 1) this.root.add(this.line(fore.map((p) => onGround(p.clone(), 0.016)), pal.pred, 1.3, { dashed: true, opacity: 0.8 }));
      if (options.dropLines) {
        for (let k = 1; k < s.measured.length; k++) {
          const za = s.measured[k - 1][2];
          const zb = s.measured[k][2];
          const lo = Math.min(za, zb);
          const hi = Math.max(za, zb);
          for (let z = Math.max(dropStep, Math.ceil(lo / dropStep) * dropStep); z <= hi; z += dropStep) {
            if (z === lo && k > 1) continue;
            const f = (z - za) / (zb - za || 1);
            const a = meas[k - 1].clone().lerp(meas[k], f);
            const foot = onGround(a.clone(), 0.014);
            const ln = this.line([a, foot], pal.accent, 1, { opacity: 0.32, noDepth: true });
            const dot = this.line(circle(foot.x, foot.z, 0.035 * K, 16, this.terrainActive ? 0.02 : 0.016), pal.accent, 1.4, { opacity: 0.6 });
            this.root.add(ln, dot);
            const ia = s.measuredIdx[k - 1];
            const ib = s.measuredIdx[k];
            drops.push({ t: flight.x[ia] + (flight.x[ib] - flight.x[ia]) * f, objects: [ln, dot] });
          }
        }
      }
    }

    let curtain: Mesh | null = null;
    if (view === 'persp' && meas.length > 1) {
      const pos: number[] = [];
      for (let i = 0; i < meas.length - 1; i++) {
        const a = meas[i];
        const b = meas[i + 1];
        const ga = groundY(a.x, a.z) + 0.01;
        const gb = groundY(b.x, b.z) + 0.01;
        pos.push(a.x, ga, a.z, b.x, gb, b.z, b.x, b.y, b.z, a.x, ga, a.z, b.x, b.y, b.z, a.x, a.y, a.z);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      curtain = new Mesh(g, new MeshBasicMaterial({ color: pal.accent, transparent: true, opacity: pal.curtain, side: DoubleSide, depthWrite: false }));
      curtain.renderOrder = -1;
      this.root.add(curtain);
    }

    if (view === 'profile' && terrain && all.length > 1) {
      const fwd = new Vector3(0, 1, 0).cross(this.axis);
      const front = fwd.clone().negate();
      const along = (v: Vector3) => v.dot(this.axis);
      const lo = Math.min(...all.map(along));
      const hi = Math.max(...all.map(along));
      const pts: Vector3[] = [];
      const shape = new Shape();
      shape.moveTo(-H, 0);
      for (let k = 0; k < 240; k++) {
        const a = -H + (k / 239) * SIDE;
        const ac = Math.min(hi, Math.max(lo, a));
        let best = all[0];
        for (const p of all) if (Math.abs(along(p) - ac) < Math.abs(along(best) - ac)) best = p;
        const off = best.clone().sub(this.axis.clone().multiplyScalar(along(best)));
        const wx = this.axis.x * a + off.x;
        const wz = this.axis.z * a + off.z;
        const yy = y(elev(wx, wz));
        shape.lineTo(a, yy);
        pts.push(new Vector3(a, yy, 0));
      }
      shape.lineTo(H, 0);
      shape.lineTo(-H, 0);
      const holder = new Group();
      holder.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(this.axis, new Vector3(0, 1, 0), front));
      holder.position.copy(front).multiplyScalar(H - 0.04);
      const sm = new Mesh(new ShapeGeometry(shape), new MeshBasicMaterial({ color: pal.section }));
      sm.renderOrder = 1;
      holder.add(sm, this.line(pts, pal.sectionEdge, 1.2));
      this.root.add(holder);
    }

    const wide = view === 'top' ? 3 : 3.2;
    if (fore.length > 1) this.root.add(this.line(fore, pal.pred, 2.1, { dashed: true }));
    const meas2 = meas.length > 1 ? meas : [meas[0], meas[0]];
    const faint = this.line(meas2, pal.accent, wide, { opacity: 0.22 });
    const played = this.line(meas2, pal.accent, wide);
    faint.visible = false;
    this.root.add(faint, played);

    const balloon = new Group();
    const sphere = new Mesh(new SphereGeometry(1, 40, 24), new MeshLambertMaterial({ color: pal.accent, emissive: pal.accent, emissiveIntensity: 0.18 }));
    sphere.position.y = 0.9;
    balloon.add(sphere);
    if (view !== 'top') {
      const string = new Mesh(new BoxGeometry(0.06, 1.7, 0.06), new MeshBasicMaterial({ color: pal.ink }));
      string.position.y = -0.85;
      const box = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshLambertMaterial({ color: pal.payload }));
      box.position.y = -2;
      balloon.add(string, box);
    }
    this.root.add(balloon);

    let drop: Line2 | null = null;
    let groundRing: Line2 | null = null;
    if (view === 'persp') {
      drop = this.line([new Vector3(), new Vector3(0, 1, 0)], pal.accent, 1.2, { dashed: true, dash: [0.1, 0.08] });
      groundRing = this.line(circle(0, 0, 0.09 * K, 48, 0).map((p) => p.setY(0)), pal.accent, 1.6);
      this.root.add(drop, groundRing);
    }

    if (s.crossing && view !== 'profile') {
      const cw = W(s.crossing.p);
      const ring = new Mesh(new RingGeometry(0.15 * K, 0.2 * K, 64), this.basic(pal.accent));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(cw);
      if (view === 'top') ring.position.y = HEIGHT + 0.05;
      else ring.position.y += 0.004;
      ring.renderOrder = 3;
      this.root.add(ring);
    }

    const landing = s.landingP ? W(s.landingP) : null;
    if (landing && view !== 'profile') {
      const lw = onGround(landing.clone());
      const lift = this.terrainActive ? 0.035 : 0.016;
      this.root.add(this.line(circle(lw.x, lw.z, 0.13 * K, 48, lift), pal.pred, this.terrainActive ? 2 : 1.6));
      this.root.add(this.line(circle(lw.x, lw.z, 0.26 * K, 64, lift), pal.pred, this.terrainActive ? 1.6 : 1.2));
      const cross = (dx: number, dz: number) => [-1, 0, 1].map((k) => onGround(new Vector3(lw.x + dx * k * 0.36 * K, 0, lw.z + dz * k * 0.36 * K), lift));
      this.root.add(this.line(cross(1, 0), pal.pred, 1.2), this.line(cross(0, 1), pal.pred, 1.2));
      if (view === 'persp' && landing.y - lw.y > 0.06) this.root.add(this.line([landing, lw.clone().setY(lw.y + 0.014)], pal.pred, 1.2, { dashed: true, dash: [0.08, 0.07] }));
    }

    const leftCorner = (z: number) => this.corner(y(z), 'left');
    const rightCorner = (z: number) => this.corner(y(z), 'right');
    const edgeAlign = (dy = 0) => ({ ...ALIGN.right, dy });

    const tickStep = s.ticks.length > 1 ? s.ticks[1] - s.ticks[0] : 10000;
    const shownTicks = full ? minor : minor.filter((z) => z % Math.max(10000, tickStep) === 0);
    for (const z of shownTicks) this.addTag({ views: ['persp', 'profile'], prio: 2, anchor: () => leftCorner(z), align: ALIGN.left, title: () => tickLabel(z, units), cls: 'text-faint text-[11px]' });

    const ozone = s.bands.find((b) => b.id === 'ozone');
    const nameAnchor = (z: number) => () => {
      if (this.view === 'profile') return this.axis.clone().multiplyScalar(-H + 0.35).setY(y(z));
      const vis = this.walls.filter((_, i) => this.visible[i]);
      if (!vis.length) return null;
      const leftWall = vis.reduce((a, b) => (this.project(a.centre.clone().setY(y(z))).x < this.project(b.centre.clone().setY(y(z))).x ? a : b));
      return leftWall.centre.clone().setY(y(z));
    };
    const nameAlign = (v: AtmoView) => (v === 'profile' ? { ax: 0, ay: 0.5, dx: 0, dy: 0 } : ALIGN.centre);
    this.addTag({
      views: ['persp', 'profile'],
      prio: 4,
      anchor: nameAnchor(s.tropopause.z * (full ? 0.5 : 0.62)),
      align: nameAlign,
      title: () => t('atmo3d.layer.troposphere'),
      cls: 'text-foreground text-[12.5px] font-semibold',
    });
    this.addTag({
      views: ['persp', 'profile'],
      prio: 4,
      anchor: nameAnchor(ozone ? (s.tropopause.z + ozone.from) / 2 : (s.tropopause.z + s.top) / 2),
      align: nameAlign,
      title: () => t('atmo3d.layer.stratosphere'),
      cls: 'text-foreground text-[12.5px] font-semibold',
    });
    if (ozone && full)
      this.addTag({
        views: ['persp', 'profile'],
        prio: 3,
        anchor: nameAnchor((ozone.from + ozone.to) / 2),
        align: nameAlign,
        title: () => t('atmo3d.layer.ozone'),
        sub: () => altRange(ozone.from, ozone.to, units),
        cls: 'text-muted-foreground text-[12px]',
      });

    this.addTag({
      views: ['persp', 'profile'],
      prio: 5,
      anchor: () => rightCorner(s.tropopause.z),
      align: edgeAlign(),
      title: () => (full ? t('atmo3d.scene.tropopauseAlt', { alt: fmtAltShort(s.tropopause.z, units) }) : t('atmo3d.scene.tropopauseName')),
      sub: () => (full ? t(s.tropopause.measured ? 'atmo3d.scene.tropopauseMeasuredBy' : 'atmo3d.scene.tropopauseTypicalLat') : fmtAltShort(s.tropopause.z, units)),
      cls: 'text-foreground',
      titleCls: 'font-semibold',
    });
    if (full && s.freezing !== null && s.freezing > 0) {
      const fz = s.freezing;
      this.addTag({ views: ['persp', 'profile'], prio: 2, anchor: () => rightCorner(fz), align: edgeAlign(9), title: () => t('atmo3d.scene.freezing', { alt: fmtAltShort(fz, units) }) });
    }
    if (full)
      for (const [a, b] of s.clouds) {
        if (b - a < 300) continue;
        this.addTag({ views: ['persp', 'profile'], prio: 1, anchor: () => rightCorner((a + b) / 2), align: edgeAlign(a < 5000 ? -8 : 0), title: () => t('atmo3d.layer.clouds') });
      }

    if (view === 'profile') {
      const step = niceStep(s.span / unitM, 6, units === 'metric' ? [2, 5, 10, 25, 50, 100, 250, 500] : [1, 2, 5, 10, 20, 50, 100, 200, 500]);
      const fwd = new Vector3(0, 1, 0).cross(this.axis);
      const base = launchW.dot(this.axis);
      for (let k = -20; k <= 20; k++) {
        const a = base + ((k * step * unitM) / s.span) * SIDE;
        if (Math.abs(a) > H) continue;
        const label = k === 0 ? '0' : fmtDist(Math.abs(k) * step * unitM, units);
        this.addTag({
          views: ['profile'],
          prio: 2,
          anchor: () => this.axis.clone().multiplyScalar(a).setY(-PLATE).addScaledVector(fwd, -H),
          align: { ax: 0.5, ay: 0, dx: 0, dy: 10 },
          title: () => label,
          cls: 'text-faint text-[11px]',
        });
      }
      const dirKey: TKey = alongX ? (this.axis.x > 0 ? 'atmo3d.axis.east' : 'atmo3d.axis.west') : this.axis.z > 0 ? 'atmo3d.axis.south' : 'atmo3d.axis.north';
      this.addTag({ views: ['profile'], prio: 2, anchor: () => new Vector3(0, -PLATE, 0), align: { ax: 0.5, ay: 0, dx: 0, dy: 30 }, title: () => t(dirKey), cls: 'text-muted-foreground text-[11.5px]' });
    }

    const launchAnchor = () => (this.view === 'profile' ? launchW.clone() : onGround(launchW.clone(), 0.01));
    this.addMarker(['persp', 'profile', 'top'], launchAnchor, 'border:2px solid var(--foreground);background:var(--background)', 11);
    this.addTag({
      views: ['persp', 'profile', 'top'],
      prio: 6,
      force: true,
      anchor: launchAnchor,
      align: (v) => (v === 'profile' ? { ax: 0, ay: 1, dx: 14, dy: 2 } : v === 'top' ? { ax: 0.5, ay: 0, dx: 0, dy: 12 } : { ax: 1, ay: 0.5, dx: -12, dy: 0 }),
      title: () => (s.airborneStart ? t('atmo3d.scene.firstSignal') : t('atmo3d.scene.launch')),
      sub: () => clock(s.times.launch),
      cls: 'text-foreground',
      titleCls: 'font-semibold',
    });

    const burstAlign = (v: AtmoView) => (v === 'top' ? { ax: 1, ay: 1, dx: -12, dy: -9 } : { ax: 0, ay: 0.5, dx: 12, dy: 0 });
    if (s.burst) {
      const bw = W(s.burst);
      const bt = s.times.burst;
      this.addMarker(['persp', 'profile', 'top'], () => bw, 'background:var(--foreground);border:2px solid var(--background)', 11);
      this.addTag({
        views: ['persp', 'profile', 'top'],
        prio: 6,
        anchor: () => bw,
        align: burstAlign,
        title: () => t(s.glider ? 'atmo3d.scene.release' : 'atmo3d.scene.burst'),
        sub: () => (full && bt !== null ? t('atmo3d.scene.altAt', { alt: fmtAltShort(s.burst![2], units), time: clock(bt) }) : fmtAltShort(s.burst![2], units)),
        cls: 'text-foreground',
        titleCls: 'font-semibold',
      });
    }
    if (s.burstP) {
      const bw = W(s.burstP);
      const bt = s.times.burstPredicted;
      this.addMarker(['persp', 'profile', 'top'], () => bw, 'border:2px dashed var(--chart-pred);background:var(--background)', 12);
      this.addTag({
        views: ['persp', 'profile', 'top'],
        prio: 6,
        anchor: () => bw,
        align: burstAlign,
        title: () => t('atmo3d.scene.burstPredicted'),
        sub: () => (full && bt !== null ? t('atmo3d.scene.altAt', { alt: fmtAltShort(s.burstP![2], units), time: clock(bt) }) : fmtAltShort(s.burstP![2], units)),
        titleCls: 'font-semibold',
      });
    }

    if (landing) {
      const lt = s.times.landing;
      const anchor = () => (this.view === 'profile' ? landing.clone() : onGround(landing.clone()));
      this.addMarker(['profile'], anchor, 'border:2px solid var(--chart-pred);background:var(--background)', 11);
      this.addTag({
        views: ['persp', 'profile', 'top'],
        prio: 6,
        anchor,
        align: (v) => (v === 'profile' ? { ax: 1, ay: 1, dx: -12, dy: -12 } : v === 'top' ? { ax: 0.5, ay: 1, dx: 0, dy: -22 } : { ax: 0.5, ay: 0, dx: 0, dy: 16 }),
        title: () => t('atmo3d.scene.landingPredicted'),
        sub: () => (lt !== null ? clock(lt) : ''),
        titleCls: 'font-semibold',
      });
    }

    if (s.crossing) {
      const cw = W(s.crossing.p);
      const ct = s.crossing.t;
      this.addMarker(['profile'], () => cw, 'border:2px solid var(--primary);background:var(--background)', 11);
      this.addTag({
        views: full ? ['persp', 'profile', 'top'] : ['profile', 'top'],
        prio: 6,
        anchor: () => cw,
        align: { ax: 1, ay: 0.5, dx: -16, dy: -2 },
        title: () => t('atmo3d.scene.crossed'),
        sub: () => (this.view === 'top' ? t('atmo3d.scene.altAt', { alt: fmtAltShort(s.tropopause.z, units), time: clock(ct) }) : clock(ct)),
        cls: 'text-foreground',
        titleCls: 'font-semibold',
      });
    }

    if (view === 'top') {
      const t0 = s.times.launch;
      const t1 = s.times.landing ?? s.times.now;
      const dur = t1 - t0;
      const stepMin = niceStep(dur / 60, 6, [10, 15, 30, 60, 120, 240]);
      const firstTick = Math.ceil(t0 / (stepMin * 60)) * stepMin * 60;
      for (let tt = firstTick; tt < t1; tt += stepMin * 60) {
        const avoid = [s.times.now, s.times.burstPredicted, s.times.landing, s.crossing?.t].filter((v): v is number => v !== null && v !== undefined);
        if (avoid.some((v) => Math.abs(v - tt) < dur * 0.06)) continue;
        let k = 0;
        while (k < flight.x.length - 1 && flight.x[k + 1] < tt) k++;
        const p = positionAt(flight, s, k);
        const v = W(p);
        const predicted = tt > s.times.now;
        this.addMarker(['top'], () => v, `background:${predicted ? 'var(--chart-pred)' : 'var(--primary)'};border:2px solid var(--background)`, 9);
        const label = clock(tt);
        this.addTag({ views: ['top'], prio: 3, anchor: () => v, align: { ax: 0.5, ay: 1, dx: 0, dy: -9 }, title: () => label, cls: 'text-faint text-[11px]' });
      }
      this.addTag({ views: ['top'], prio: 2, anchor: () => new Vector3(0, 0.01, -H + 0.32), align: ALIGN.centre, title: () => t('atmo3d.scene.north'), cls: 'text-faint text-[11px] font-bold' });
    }

    if (this.terrainActive && terrain && view === 'persp') {
      const [pi, pj] = terrain.maxAt;
      const pv = new Vector3(-H + (pi / (terrain.n - 1)) * SIDE, 0, -H + (pj / (terrain.n - 1)) * SIDE);
      onGround(pv, 0.01);
      const peak = terrain.max;
      this.addMarker(['persp'], () => pv, 'background:var(--foreground);border:2px solid var(--background)', 9);
      this.addTag({
        views: ['persp'],
        prio: 5,
        anchor: () => pv,
        align: { ax: 0.5, ay: 1, dx: 0, dy: -10 },
        title: () => t('atmo3d.scene.peak'),
        sub: () => fmtAlt(Math.round(peak / 10) * 10, units),
        cls: 'text-foreground',
        titleCls: 'font-semibold',
      });
    }

    const balloonTag = this.addTag({
      views: ['persp', 'profile', 'top'],
      prio: 9,
      force: true,
      anchor: () => this.dyn?.current ?? null,
      align: { ax: 0, ay: 0.5, dx: 16, dy: 2 },
      title: () => '',
      sub: () => '',
      cls: 'text-foreground',
      titleCls: `font-heading font-semibold ${full ? 'text-[16px]' : 'text-[15px]'}`,
    });

    this.tags.sort((a, b) => Number(b.marker) - Number(a.marker) || b.prio - a.prio);
    this.dyn = { balloon, balloonTag, drop, groundRing, played, faint, curtain, drops, current: new Vector3() };

    const credits = [options.map && c.floor ? FLOOR_ATTRIBUTION : null, this.terrainActive ? TERRAIN_ATTRIBUTION : null].filter(Boolean);
    this.credit.textContent = view === 'profile' ? '' : credits.join(', ');
    this.compass.style.display = view === 'persp' && full ? '' : 'none';

    this.setIndex(this.index);
  }

  private corner(yy: number, side: 'left' | 'right'): Vector3 {
    const cs = [
      [H, -H],
      [H, H],
      [-H, H],
      [-H, -H],
    ].map(([x, z]) => new Vector3(x, yy, z));
    let best = cs[0];
    let bx = this.project(best).x;
    for (const c of cs) {
      const x = this.project(c).x;
      if (side === 'left' ? x < bx - 0.5 : x > bx + 0.5) {
        best = c;
        bx = x;
      }
    }
    return best;
  }

  measure() {
    for (const tg of this.tags) {
      if (tg.marker) continue;
      tg.w = tg.el.offsetWidth;
      tg.h = tg.el.offsetHeight;
    }
  }

  setIndex(index: number | null) {
    this.index = index;
    const c = this.content;
    const d = this.dyn;
    if (!c || !d) return;
    const s = c.scene;
    const y = (z: number) => (z / s.top) * HEIGHT;
    const i = index === null ? s.currentIndex : Math.min(s.currentIndex, Math.max(0, index));
    const p = index === null ? s.current : positionAt(c.flight, s, i);
    const w = new Vector3(((p[0] - s.center[0]) / s.span) * SIDE, y(p[2]), -((p[1] - s.center[1]) / s.span) * SIDE);
    d.current.copy(w);
    d.balloon.position.copy(w);
    const [title, sub] = d.balloonTag.texts;
    title.get = () => fmtAltShort(p[2], c.units);
    sub.get = () => clock(c.flight.x[i]);
    title.el.textContent = title.get();
    sub.el.textContent = sub.get();
    const terrain = c.terrain;
    const ground = this.terrainActive && terrain ? y(elevationAt(terrain, (w.x + H) / SIDE, (w.z + H) / SIDE)) : 0;
    if (d.drop) {
      (d.drop.geometry as LineGeometry).setPositions([w.x, w.y, w.z, w.x, ground + 0.016, w.z]);
      d.drop.computeLineDistances();
      d.drop.visible = w.y - ground > 0.05;
    }
    if (d.groundRing) d.groundRing.position.set(w.x, ground + 0.018, w.z);
    let k = 0;
    while (k < s.measuredIdx.length && s.measuredIdx[k] <= i) k++;
    const segments = Math.max(0, k - 1);
    (d.played.geometry as LineGeometry).instanceCount = index === null ? Infinity : segments;
    d.faint.visible = index !== null;
    if (d.curtain) d.curtain.geometry.setDrawRange(0, index === null ? Infinity : segments * 6);
    const now = c.flight.x[i];
    for (const dl of d.drops) for (const o of dl.objects) o.visible = dl.t <= now + 1;
    this.measure();
    this.request();
  }

  private layout() {
    const cam = this.camera();
    if (this.view === 'persp') {
      this.visible = this.walls.map((wl) => wl.normal.dot(cam.position.clone().sub(wl.centre)) > 0);
    } else if (this.view === 'profile') {
      const toCam = new Vector3();
      cam.getWorldDirection(toCam).negate();
      this.visible = this.walls.map((wl) => wl.normal.dot(toCam) > 0.5);
    } else this.visible = this.walls.map(() => false);
    this.walls.forEach((wl, i) => {
      wl.group.visible = this.visible[i];
      wl.shadow.forEach((o) => (o.visible = this.visible[i]));
    });

    if (this.view === 'persp') {
      const o = this.project(new Vector3(0, 0, 0));
      const n = this.project(new Vector3(0, 0, -1));
      this.needle.style.transform = `rotate(${Math.atan2(n.x - o.x, -(n.y - o.y))}rad)`;
    }

    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const hit = (r: { x: number; y: number; w: number; h: number }) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    for (const tg of this.tags) {
      const hide = () => (tg.el.style.visibility = 'hidden');
      if (!tg.views.includes(this.view)) {
        hide();
        continue;
      }
      const a = tg.anchor();
      if (!a) {
        hide();
        continue;
      }
      const p = this.project(a);
      if (!p.ok) {
        hide();
        continue;
      }
      if (tg.marker) {
        if (p.x < -10 || p.y < -10 || p.x > this.width + 10 || p.y > this.height + 10) {
          hide();
          continue;
        }
        tg.el.style.visibility = 'visible';
        tg.el.style.transform = `translate3d(${(p.x - tg.w / 2).toFixed(1)}px,${(p.y - tg.h / 2).toFixed(1)}px,0)`;
        placed.push({ x: p.x - tg.w / 2 - 2, y: p.y - tg.h / 2 - 2, w: tg.w + 4, h: tg.h + 4 });
        continue;
      }
      const al = tg.align(this.view);
      const x = p.x + al.dx - tg.w * al.ax;
      const yy = p.y + al.dy - tg.h * al.ay;
      const rect = { x: x - 2, y: yy - 1, w: tg.w + 4, h: tg.h + 2 };
      const off = x < 2 || yy < 2 || x + tg.w > this.width - 2 || yy + tg.h > this.height - 2;
      if (off || (hit(rect) && !tg.force)) {
        hide();
        continue;
      }
      placed.push(rect);
      tg.el.style.visibility = 'visible';
      tg.el.style.transform = `translate3d(${x.toFixed(1)}px,${yy.toFixed(1)}px,0)`;
    }
  }

  private scaleBalloon() {
    const d = this.dyn;
    if (!d) return;
    const px = SPHERE_PX[this.mode];
    let perPx: number;
    if (this.view === 'persp') {
      const dist = this.pc.position.distanceTo(d.balloon.position);
      perPx = (2 * dist * Math.tan(MathUtils.degToRad(FOV) / 2)) / this.height;
    } else {
      perPx = (this.oc.top - this.oc.bottom) / this.oc.zoom / this.height;
    }
    d.balloon.scale.setScalar(px * perPx);
  }

  render() {
    if (!this.width) return;
    const cam = this.camera();
    cam.updateMatrixWorld();
    this.scaleBalloon();
    this.layout();
    this.renderer.render(this.scene, cam);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.controls?.dispose();
    this.clear();
    this.floorTex?.tex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.compass.remove();
    this.credit.remove();
  }
}

export interface Atmosphere3DProps {
  scene: AtmoScene;
  flight: FlightData;
  theme: 'dark' | 'light';
  units: Units;
  mode: Mode;
  view: AtmoView;
  options: AtmoOptions;
  floor: FloorMap | null;
  terrain: TerrainGrid | null;
  index: number | null;
  live: boolean;
  resetKey?: number;
  label: string;
  className?: string;
}

export default function Atmosphere3D({ scene, flight, theme, units, mode, view, options, floor, terrain, index, live, resetKey, label, className }: Atmosphere3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [failed, setFailed] = useState(false);
  const tr = useT();

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
    const e = engine.current;
    if (!e) return;
    if (e.view !== view || !e.content) e.setView(view);
    e.setContent({ scene, flight, theme, pal: palette(theme), units, live, options, floor, terrain });
  }, [mode, view, scene, flight, theme, units, live, options, floor, terrain]);

  useEffect(() => {
    engine.current?.relabel();
  }, [tr]);

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
    return <div className="bg-surface flex h-full items-center justify-center rounded-md border px-6 text-center text-[13px]">{tr('atmo3d.webglUnavailable')}</div>;
  }

  const draggable = mode === 'preview' && view === 'persp';
  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      tabIndex={draggable ? 0 : undefined}
      className={`focus-visible:ring-ring/50 relative h-full w-full overflow-hidden outline-none select-none focus-visible:ring-2 ${draggable ? 'cursor-grab touch-pan-y active:cursor-grabbing' : mode === 'full' ? 'touch-none' : ''} ${className ?? ''}`}
    >
      <div ref={overlay} className="pointer-events-none absolute inset-0" />
    </div>
  );
}
