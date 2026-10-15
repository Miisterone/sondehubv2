const S3 = 'https://sondehub-history.s3.amazonaws.com';
const MAX_FRAMES = 4000;
const SETTLED_MS = 3 * 86_400_000;

type Raw = Record<string, unknown>;

const SENSOR = ['temp', 'humidity', 'pressure', 'vel_v', 'vel_h', 'heading', 'sats', 'batt', 'frequency', 'tx_frequency', 'burst_timer', 'type', 'subtype', 'manufacturer'] as const;
const UPLOADER = ['uploader_callsign', 'uploader_position', 'uploader_antenna', 'software_name', 'software_version', 'snr', 'rssi'] as const;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function json(body: unknown, status: number, cache: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' },
  });
}

interface Slot {
  t: number;
  frames: Raw[];
}

function reduce(serial: string, raw: Raw[]) {
  const slots = new Map<string, Slot>();
  for (const f of raw) {
    const dt = f.datetime;
    if (typeof dt !== 'string') continue;
    const lat = num(f.lat);
    const lon = num(f.lon);
    const alt = num(f.alt);
    if (lat === undefined || lon === undefined || alt === undefined || (lat === 0 && lon === 0)) continue;
    const t = Date.parse(dt);
    if (!Number.isFinite(t)) continue;
    const key = String(Math.floor(t / 1000));
    const slot = slots.get(key);
    if (slot) slot.frames.push(f);
    else slots.set(key, { t, frames: [f] });
  }
  const ordered = [...slots.values()].sort((a, b) => a.t - b.t);
  if (ordered.length === 0) return null;

  const span = ordered[ordered.length - 1].t - ordered[0].t;
  const gap = Math.max(1000, Math.ceil(span / MAX_FRAMES));
  let top = 0;
  ordered.forEach((s, i) => {
    if ((num(s.frames[0].alt) ?? 0) > (num(ordered[top].frames[0].alt) ?? 0)) top = i;
  });
  const kept: Slot[] = [];
  let lastT = -Infinity;
  ordered.forEach((s, i) => {
    if (i === 0 || i === top || i === ordered.length - 1 || s.t - lastT >= gap) {
      kept.push(s);
      lastT = s.t;
    }
  });

  const picked = new Map<string, number>();
  const out: Record<string, Raw> = {};
  for (const s of kept) {
    const withCall = s.frames.filter((f) => typeof f.uploader_callsign === 'string');
    let main = withCall[0] ?? s.frames[0];
    for (const f of withCall) {
      if ((picked.get(f.uploader_callsign as string) ?? 0) < (picked.get(main.uploader_callsign as string) ?? 0)) main = f;
    }
    if (typeof main.uploader_callsign === 'string') picked.set(main.uploader_callsign, (picked.get(main.uploader_callsign) ?? 0) + 1);
    const frame: Raw = {
      serial,
      datetime: new Date(s.t).toISOString(),
      lat: num(main.lat),
      lon: num(main.lon),
      alt: num(main.alt),
    };
    for (const k of SENSOR) {
      const v = s.frames.find((f) => f[k] !== undefined && f[k] !== null)?.[k];
      if (v !== undefined) frame[k] = v;
    }
    for (const k of UPLOADER) if (main[k] !== undefined && main[k] !== null) frame[k] = main[k];
    const n = num(s.frames.find((f) => num(f.frame) !== undefined)?.frame);
    if (n !== undefined) frame.frame = n;
    const others = withCall.filter((f) => f !== main);
    if (others.length) {
      frame.uploaders = [main, ...others]
        .filter((f, i, a) => a.findIndex((g) => g.uploader_callsign === f.uploader_callsign) === i)
        .map((f) => ({ uploader_callsign: f.uploader_callsign, snr: num(f.snr), rssi: num(f.rssi), frequency: num(f.frequency) }));
    }
    out[frame.datetime as string] = frame;
  }
  return { frames: { [serial]: out }, last: ordered[ordered.length - 1].t, total: ordered.length, kept: kept.length };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const serial = new URL(request.url).searchParams.get('serial') ?? '';
    if (!/^[\w.:-]{1,48}$/.test(serial)) return json({ error: 'invalid serial' }, 400, 'no-store');
    try {
      const res = await fetch(`${S3}/serial/${encodeURIComponent(serial)}.json.gz`);
      if (res.status === 404 || res.status === 403) return json({}, 404, 'public, max-age=300, s-maxage=3600');
      if (!res.ok) return json({ error: `S3 ${res.status}` }, 502, 'no-store');
      const raw = (await res.json()) as Raw[];
      if (!Array.isArray(raw)) return json({}, 404, 'public, max-age=300, s-maxage=3600');
      const reduced = reduce(serial, raw);
      if (!reduced) return json({}, 404, 'public, max-age=300, s-maxage=3600');
      const settled = Date.now() - reduced.last > SETTLED_MS;
      return json(reduced.frames, 200, settled ? 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400' : 'public, max-age=600, s-maxage=3600');
    } catch (e) {
      return json({ error: (e as Error).message }, 502, 'no-store');
    }
  },
};
