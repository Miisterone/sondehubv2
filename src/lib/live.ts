import mqtt from 'mqtt';
import { normaliseListener, normalisePrediction, normaliseRecovery, type RawRecovery, type RawWsPrediction } from './api';
import type { Frame, Listener, Prediction, Recovery } from './types';
import { useStore } from '../store/useStore';

const WS_URL = 'wss://ws-reader.v2.sondehub.org/';
/** `batch` carries every telemetry frame, grouped — far fewer messages than `sondes/#`. */
const TOPICS = ['batch', 'prediction/#', 'listener/#', 'recovery/#'];
const FLUSH_MS = 1000;
const RATE_WINDOW_S = 10;

/**
 * Connects to the SondeHub live feed and pushes buffered updates into the store once a second,
 * so a burst of frames causes one render instead of hundreds.
 */
export function startLiveFeed(): () => void {
  const store = useStore.getState;
  let frames: Frame[] = [];
  let preds: Prediction[] = [];
  let listeners: Listener[] = [];
  let recoveries: Recovery[] = [];
  const rateBuckets: number[] = new Array(RATE_WINDOW_S).fill(0);
  let bucket = 0;
  let paused = false;

  const client = mqtt.connect(WS_URL, {
    clientId: `sondehubv2-${Math.random().toString(16).slice(2, 12)}`,
    reconnectPeriod: 3000,
    connectTimeout: 15_000,
    keepalive: 60,
    clean: true,
  });

  client.on('connect', () => {
    client.subscribe(TOPICS);
    store().setConn('live');
  });
  client.on('reconnect', () => store().setConn('connecting'));
  client.on('offline', () => store().setConn('offline'));
  client.on('close', () => {
    if (store().conn === 'live') store().setConn('connecting');
  });
  client.on('error', () => store().setConn('offline'));

  client.on('message', (topic, payload) => {
    if (paused) return;
    let data: unknown;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (topic === 'batch') {
      if (Array.isArray(data)) {
        frames.push(...(data as Frame[]));
        rateBuckets[bucket] += data.length;
      }
    } else if (topic.startsWith('prediction/')) {
      const p = normalisePrediction(data as RawWsPrediction);
      if (p) preds.push(p);
    } else if (topic.startsWith('listener/')) {
      const l = normaliseListener(data as Parameters<typeof normaliseListener>[0]);
      if (l) listeners.push(l);
    } else if (topic.startsWith('recovery/')) {
      const r = data as RawRecovery;
      if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) recoveries.push(normaliseRecovery(r));
    }
  });

  const flush = window.setInterval(() => {
    const s = store();
    if (frames.length) {
      s.ingest(frames);
      frames = [];
    }
    if (preds.length) {
      s.setPredictions(preds, false);
      preds = [];
    }
    if (listeners.length) {
      s.setListeners(listeners);
      listeners = [];
    }
    if (recoveries.length) {
      s.setRecoveries(recoveries, false);
      recoveries = [];
    }
  }, FLUSH_MS);

  const rate = window.setInterval(() => {
    const total = rateBuckets.reduce((a, b) => a + b, 0);
    bucket = (bucket + 1) % RATE_WINDOW_S;
    rateBuckets[bucket] = 0;
    const s = store();
    if (s.conn === 'live') s.setConn('live', total / RATE_WINDOW_S);
  }, 1000);

  // Drop the feed while the tab is hidden; a REST refresh catches up on return.
  const onVisibility = () => {
    paused = document.hidden;
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.clearInterval(flush);
    window.clearInterval(rate);
    document.removeEventListener('visibilitychange', onVisibility);
    client.end(true);
  };
}
