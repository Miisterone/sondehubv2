export const ALT_BANDS = [0, 8000, 16000, 24000, 32000] as const;

const ON_LIGHT = ['#0497ed', '#007fe4', '#0e67d8', '#2150c5', '#2339b1'];
const ON_DARK = ['#0f7cdb', '#1d93fe', '#63aeff', '#9fccff', '#d8eaff'];

export function altColours(darkBase: boolean): string[] {
  return darkBase ? ON_DARK : ON_LIGHT;
}

export function altBand(alt: number): number {
  let i = 0;
  while (i < ALT_BANDS.length - 1 && alt >= ALT_BANDS[i + 1]) i++;
  return i;
}

export function altStepExpression(darkBase: boolean): unknown[] {
  const c = altColours(darkBase);
  const expr: unknown[] = ['step', ['get', 'alt'], c[0]];
  for (let i = 1; i < ALT_BANDS.length; i++) expr.push(ALT_BANDS[i], c[i]);
  return expr;
}
