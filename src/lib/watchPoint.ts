import { useMemo } from 'react';
import { useStore, type WatchPoint } from '@/store/useStore';
import { getLocale } from '@/i18n';

export interface Centre {
  lat: number;
  lon: number;
  kind: 'gps' | 'point';
  label?: string;
}

export interface Place {
  id: string;
  lat: number;
  lon: number;
  name: string;
  detail: string;
}

const PHOTON = 'https://photon.komoot.io';
const PHOTON_LANGS = new Set(['de', 'en', 'fr']);

export function centreOf(point: WatchPoint | null, me: { lat: number; lon: number } | null): Centre | null {
  if (point) return { lat: point.lat, lon: point.lon, kind: 'point', label: point.label };
  if (me) return { lat: me.lat, lon: me.lon, kind: 'gps' };
  return null;
}

export function useNearbyCentre(): Centre | null {
  const point = useStore((s) => s.settings.watchPoint);
  const me = useStore((s) => s.userLocation);
  return useMemo(() => centreOf(point, me), [point, me]);
}

export function currentCentre(): Centre | null {
  const s = useStore.getState();
  return centreOf(s.settings.watchPoint, s.userLocation);
}

export function fmtPoint(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

const NUM = String.raw`[-+]?\d+(?:[.,]\d+)?`;
const DMS = new RegExp(String.raw`(${NUM})\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|”|'')\s*)?([NSEWO])?`, 'gi');

const toNum = (s: string) => Number(s.replace(',', '.'));

function withHemisphere(v: number, h: string | undefined): { v: number; axis?: 'lat' | 'lon' } {
  if (!h) return { v };
  const c = h.toUpperCase();
  const neg = c === 'S' || c === 'W' || c === 'O';
  return { v: neg ? -Math.abs(v) : Math.abs(v), axis: c === 'N' || c === 'S' ? 'lat' : 'lon' };
}

function valid(lat: number, lon: number): [number, number] | null {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

function ordered(a: { v: number; axis?: 'lat' | 'lon' }, b: { v: number; axis?: 'lat' | 'lon' }): [number, number] | null {
  if (a.axis === 'lon' || b.axis === 'lat') return valid(b.v, a.v);
  return valid(a.v, b.v);
}

export function parseCoords(text: string): [number, number] | null {
  const q = text.trim();
  if (!q) return null;

  if (q.includes('°')) {
    const parts = [...q.matchAll(DMS)];
    if (parts.length !== 2) return null;
    const [a, b] = parts.map((m) => {
      const deg = toNum(m[1]);
      const v = Math.abs(deg) + (m[2] ? toNum(m[2]) / 60 : 0) + (m[3] ? toNum(m[3]) / 3600 : 0);
      return withHemisphere(deg < 0 ? -v : v, m[4]);
    });
    return ordered(a, b);
  }

  const hemi = q.match(new RegExp(String.raw`^\s*([NSEWO])?\s*(${NUM})\s*([NSEWO])?\s*[,;\s]\s*([NSEWO])?\s*(${NUM})\s*([NSEWO])?\s*$`, 'i'));
  if (hemi && (hemi[1] || hemi[3] || hemi[4] || hemi[6])) {
    return ordered(withHemisphere(toNum(hemi[2]), hemi[1] ?? hemi[3]), withHemisphere(toNum(hemi[5]), hemi[4] ?? hemi[6]));
  }

  const sep = q.match(/^\s*([-+]?\d+(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)\s*$/);
  if (sep) return valid(Number(sep[1]), Number(sep[2]));

  const frenchDecimals = q.match(/^\s*([-+]?\d+,\d+)\s*[;\s]\s*([-+]?\d+,\d+)\s*$/);
  if (frenchDecimals) return valid(toNum(frenchDecimals[1]), toNum(frenchDecimals[2]));

  return null;
}

interface PhotonProps {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  type?: string;
}

interface PhotonResponse {
  features?: { properties: PhotonProps; geometry: { type: string; coordinates: [number, number] } }[];
}

function photonLang(): string {
  const l = getLocale();
  return PHOTON_LANGS.has(l) ? l : 'default';
}

function placeName(p: PhotonProps): string {
  if (p.name) return p.name;
  if (p.street) return p.housenumber ? `${p.housenumber} ${p.street}` : p.street;
  return p.city ?? p.county ?? p.state ?? p.country ?? '';
}

function placeDetail(p: PhotonProps, name: string): string {
  const parts = [p.city, p.county, p.state, p.country].filter((x): x is string => !!x && x !== name);
  return [...new Set(parts)].slice(0, 3).join(', ');
}

export async function searchPlaces(query: string, bias: { lat: number; lon: number } | null, signal: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '6', lang: photonLang() });
  if (bias) {
    params.set('lat', bias.lat.toFixed(3));
    params.set('lon', bias.lon.toFixed(3));
  }
  const res = await fetch(`${PHOTON}/api/?${params}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as PhotonResponse;
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of data.features ?? []) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const name = placeName(f.properties);
    if (!name) continue;
    const detail = placeDetail(f.properties, name);
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${f.properties.osm_type ?? ''}${f.properties.osm_id ?? out.length}`, lat, lon, name, detail });
  }
  return out;
}

export async function reverseLabel(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: photonLang(), limit: '1' });
  try {
    const res = await fetch(`${PHOTON}/reverse?${params}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as PhotonResponse;
    const p = data.features?.[0]?.properties;
    if (!p) return null;
    return p.city ?? p.county ?? p.name ?? p.state ?? null;
  } catch {
    return null;
  }
}

export function zoomForRadius(km: number): number {
  return km <= 25 ? 9 : km <= 50 ? 8 : km <= 100 ? 7 : 6;
}

const pickClicks = new WeakSet<Event>();

export function isPickClick(e: { originalEvent?: Event }): boolean {
  return !!e.originalEvent && pickClicks.has(e.originalEvent);
}

export function placeWatchPointFromClick(lat: number, lon: number, originalEvent: Event) {
  pickClicks.add(originalEvent);
  const st = useStore.getState();
  const label = fmtPoint(lat, lon);
  st.setPickingPoint(false);
  st.setWatchPoint({ lat, lon, label });
  void reverseLabel(lat, lon).then((name) => {
    const cur = useStore.getState().settings.watchPoint;
    if (name && cur && cur.lat === lat && cur.lon === lon && cur.label === label) useStore.getState().setWatchPoint({ ...cur, label: name });
  });
}
