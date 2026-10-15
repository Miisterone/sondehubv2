const S3 = 'https://sondehub-history.s3.amazonaws.com';
const DAYS = 31;
const DAY_MS = 86_400_000;
const CONCURRENCY = 24;

interface Point {
  time: number;
  lat: number;
  lon: number;
  alt: number;
}

interface Summary {
  serial: string;
  type?: string;
  first: Point;
  top: Point;
  last: Point;
}

interface RawFrame {
  datetime?: string;
  lat?: number;
  lon?: number;
  alt?: number;
  type?: string;
  subtype?: string;
}

function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!);
}

async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ 'list-type': '2', prefix });
    if (token) q.set('continuation-token', token);
    const res = await fetch(`${S3}/?${q}`);
    if (!res.ok) throw new Error(`S3 ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decode(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : undefined;
  } while (token);
  return keys;
}

function point(f: RawFrame | undefined): Point | null {
  if (!f) return null;
  const time = Date.parse(f.datetime ?? '');
  const { lat, lon, alt } = f;
  if (!Number.isFinite(time) || typeof lat !== 'number' || typeof lon !== 'number' || typeof alt !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) return null;
  return { time, lat: +lat.toFixed(5), lon: +lon.toFixed(5), alt: Math.round(alt) };
}

async function summary(key: string, serial: string): Promise<Summary | null> {
  try {
    const res = await fetch(`${S3}/${key.split('/').map(encodeURIComponent).join('/')}`);
    if (!res.ok) return null;
    const raw = (await res.json()) as RawFrame[];
    if (!Array.isArray(raw) || raw.length < 3) return null;
    const [first, top, last] = raw.slice(0, 3).map(point);
    if (!first || !top || !last) return null;
    return { serial, type: raw[0].subtype ?? raw[0].type, first, top, last };
  } catch {
    return null;
  }
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function json(body: unknown, status: number, cache: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' },
  });
}

async function siteFlights(site: string, now = Date.now()): Promise<Summary[]> {
  const since = now - DAYS * DAY_MS;
  const months = new Set<string>();
  for (let t = since; t <= now + DAY_MS; t += DAY_MS) {
    const d = new Date(t);
    months.add(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const keys = (await Promise.all([...months].map((m) => listKeys(`launchsites/${site}/${m}/`)))).flat();
  const wanted: { key: string; serial: string }[] = [];
  for (const key of new Set(keys)) {
    const m = key.match(/^launchsites\/[^/]+\/(\d{4})\/(\d{2})\/(\d{2})\/(.+)\.json$/);
    if (!m || Date.UTC(+m[1], +m[2] - 1, +m[3]) < since - DAY_MS) continue;
    wanted.push({ key, serial: m[4] });
  }
  const list = await pool(wanted, CONCURRENCY, (w) => summary(w.key, w.serial));
  const seen = new Set<string>();
  const flights: Summary[] = [];
  for (const f of list) {
    if (!f || f.first.time < since || f.first.time > now) continue;
    const id = `${f.serial}|${Math.round(f.first.time / 600_000)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    flights.push(f);
  }
  return flights.sort((a, b) => b.first.time - a.first.time);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const site = new URL(request.url).searchParams.get('site') ?? '';
    if (!/^[\w-]{1,32}$/.test(site)) return json({ error: 'invalid site' }, 400, 'no-store');
    try {
      const flights = await siteFlights(site);
      return json({ site, generated: Date.now(), days: DAYS, flights }, 200, 'public, max-age=600, s-maxage=1800, stale-while-revalidate=86400');
    } catch (e) {
      return json({ error: (e as Error).message }, 502, 'no-store');
    }
  },
};
