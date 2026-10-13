import type { FlightPhase, Prediction, Sonde } from './types';

export function makeVisible(query: string, phases: Record<FlightPhase, boolean>) {
  const q = query.trim().toLowerCase();
  return (s: Sonde) => {
    if (!phases[s.phase]) return false;
    if (!q) return true;
    return (
      s.serial.toLowerCase().includes(q) ||
      (s.type ?? '').toLowerCase().includes(q) ||
      (s.subtype ?? '').toLowerCase().includes(q) ||
      (s.manufacturer ?? '').toLowerCase().includes(q) ||
      Object.keys(s.receivers).some((c) => c.toLowerCase().includes(q))
    );
  };
}

/**
 * A prediction is worth showing while the sonde flies, and also after it was last heard
 * well above the ground: the predicted landing is then the best estimate of where it is.
 */
export function usefulPrediction(s: Sonde | undefined, p: Prediction | undefined): p is Prediction {
  if (!s || !p || !p.landing) return false;
  if (s.phase === 'ascending' || s.phase === 'descending') return true;
  return s.phase === 'landed' && s.last.alt > 1500 && p.descending;
}
