import type { FlightData, Sounding } from './flight';
import type { Sonde } from './types';
import { fmtAltShort, fmtHSpeed, fmtTemp, type Units } from './format';

export interface Insight {
  id: string;
  title: string;
  text: string;
}

interface Layer {
  alt: number[];
  value: number[];
}

function binned(alt: number[], values: (number | null)[], step: number, min = 1): Layer {
  const sums = new Map<number, { s: number; n: number }>();
  alt.forEach((a, i) => {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) return;
    const k = Math.floor(a / step);
    const e = sums.get(k);
    if (e) {
      e.s += v;
      e.n++;
    } else sums.set(k, { s: v, n: 1 });
  });
  const keys = [...sums.keys()].filter((k) => sums.get(k)!.n >= min).sort((a, b) => a - b);
  return { alt: keys.map((k) => (k + 0.5) * step), value: keys.map((k) => sums.get(k)!.s / sums.get(k)!.n) };
}

function isaPressure(h: number): number {
  if (h < 11000) return 1013.25 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
  if (h < 20000) return 226.32 * Math.exp(-(h - 11000) / 6341.6);
  return 54.749 * Math.pow(1 + (h - 20000) / 216650, -34.1632);
}

function lapseText(rate: number, units: Units): string {
  const n = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return units === 'metric' ? `${n(rate)}\u00a0°C par kilomètre` : `${n((rate * 1.8) / 3.28084)}\u00a0°F par 1\u00a0000\u00a0ft`;
}

function range(a: number, b: number, units: Units): string {
  return units === 'metric' ? `${(a / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} et ${fmtAltShort(b, units)}` : `${fmtAltShort(a, units)} et ${fmtAltShort(b, units)}`;
}

function findTropopause(t: Layer): number | null {
  for (let i = 0; i < t.alt.length - 1; i++) {
    if (t.alt[i] < 5000) continue;
    const lapse = (t.value[i] - t.value[i + 1]) / ((t.alt[i + 1] - t.alt[i]) / 1000);
    if (lapse > 2) continue;
    let covered = false;
    let ok = true;
    for (let j = i + 1; j < t.alt.length && t.alt[j] - t.alt[i] <= 2000; j++) {
      const avg = (t.value[i] - t.value[j]) / ((t.alt[j] - t.alt[i]) / 1000);
      if (avg > 2) ok = false;
      if (t.alt[j] - t.alt[i] >= 1800) covered = true;
    }
    if (!covered) return null;
    if (ok) return t.alt[i];
  }
  return null;
}

export function cloudLayers(s: Sounding): [number, number][] | null {
  const hum = binned(s.alt, s.hum, 100);
  const low = hum.alt.map((a, i) => [a, hum.value[i]] as const).filter(([a]) => a < 12000);
  if (low.length < 20 || low[low.length - 1][0] < 5000) return null;
  const layers: [number, number][] = [];
  let start: number | null = null;
  low.forEach(([a, v], i) => {
    const wet = v >= 90;
    if (wet && start === null) start = a - 50;
    const closing = start !== null && (!wet || i === low.length - 1);
    if (closing) {
      const top = wet ? a + 50 : low[i - 1][0] + 50;
      if (top - start! >= 300) layers.push([start!, top]);
      start = null;
    }
  });
  return layers;
}

export function flightInsights(sonde: Sonde, s: Sounding, d: FlightData, units: Units): Insight[] {
  const out: Insight[] = [];
  const temps = binned(s.alt, s.temp, 200);

  if (temps.alt.length >= 8 && temps.alt[temps.alt.length - 1] - temps.alt[0] >= 2000) {
    const t0 = temps.value[0];
    const tropo = findTropopause(temps);
    let k = 0;
    if (tropo !== null) k = temps.alt.indexOf(tropo);
    else
      temps.value.forEach((v, i) => {
        if (v < temps.value[k]) k = i;
      });
    const rate = (t0 - temps.value[k]) / ((temps.alt[k] - temps.alt[0]) / 1000);
    if (k > 0 && rate > 3) {
      out.push({
        id: 'cold',
        title: 'Plus haut, plus froid',
        text: `Il faisait ${fmtTemp(t0, units)} au départ et ${fmtTemp(temps.value[k], units)} vers ${fmtAltShort(temps.alt[k], units)} : en montant, l’air s’est refroidi d’environ ${lapseText(rate, units)}, car il se détend à mesure que la pression baisse.`,
      });
    }
    if (tropo !== null) {
      const i = temps.alt.indexOf(tropo);
      out.push({
        id: 'tropopause',
        title: `Tropopause vers ${fmtAltShort(tropo, units)}`,
        text: `Au-dessus, la température cesse de baisser (${fmtTemp(temps.value[i], units)} à ce niveau). C’est la frontière entre la troposphère, où se forment les nuages et la météo, et la stratosphère, plus sèche et plus calme.`,
      });
    }
  }

  const end = d.burst ?? d.last;
  if (end > 0) {
    const winds = binned(d.alt.slice(0, end + 1) as number[], d.hs.slice(0, end + 1), 500, 3);
    let k = -1;
    winds.value.forEach((v, i) => {
      if (k < 0 || v > winds.value[k]) k = i;
    });
    if (k >= 0 && winds.value[k] >= 5) {
      const speed = winds.value[k];
      const alt = winds.alt[k];
      const jet = speed * 3.6 >= 100 && alt >= 6000 && alt <= 15000;
      out.push({
        id: 'wind',
        title: jet ? 'Courant-jet' : 'Vent le plus fort',
        text: jet
          ? `${fmtHSpeed(speed, units)} vers ${fmtAltShort(alt, units)} : c’est le courant-jet, un couloir de vent très rapide qui fait le tour de la planète et emporte les ballons sur des dizaines de kilomètres.`
          : `${fmtHSpeed(speed, units)} vers ${fmtAltShort(alt, units)}. C’est ce vent d’altitude qui emporte le ballon loin de son point de départ.`,
      });
    }
  }

  const layers = cloudLayers(s);
  if (layers) {
    if (layers.length) {
      const shown = layers.slice(0, 2).map(([a, b]) => `entre ${range(a, b, units)}`);
      out.push({
        id: 'clouds',
        title: layers.length > 1 ? 'Couches nuageuses probables' : 'Nuage probable',
        text: `${shown.join(' puis ')}, l’humidité dépassait 90\u00a0% : la sonde a sans doute traversé ${layers.length > 1 ? 'des nuages' : 'un nuage'}.`.replace(/^e/, 'E'),
      });
    } else {
      out.push({
        id: 'dry',
        title: 'Air plutôt sec',
        text: 'L’humidité n’a jamais atteint 90\u00a0% sous 12 km : probablement pas de nuage épais sur son trajet.',
      });
    }
  }

  const burst = sonde.phase !== 'ascending' && sonde.maxAlt - sonde.last.alt > 500;
  const top = burst ? sonde.maxAlt : sonde.last.alt;
  if (top >= 15000) {
    const p = isaPressure(top);
    const ratio = Math.round(1013.25 / p);
    out.push({
      id: 'pressure',
      title: burst ? `Éclatement à ${fmtAltShort(top, units)}` : sonde.phase === 'ascending' ? `Déjà à ${fmtAltShort(top, units)}` : `Dernier signal à ${fmtAltShort(top, units)}`,
      text: `À cette altitude, la pression de l’air n’est plus que d’environ ${p < 10 ? p.toFixed(1).replace('.', ',') : Math.round(p)}\u00a0hPa, soit ${ratio} fois moins qu’au sol. Le ballon gonfle à mesure que l’air se raréfie, ${
        burst ? 'jusqu’à éclater' : sonde.phase === 'ascending' ? 'et finira par éclater, en général entre 20 et 35 km' : 'jusqu’à éclater, sans doute peu après ce dernier signal'
      }.`,
    });
  }

  return out;
}
