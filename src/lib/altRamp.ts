export const ALT_BANDS = [0, 8000, 16000, 24000, 32000] as const;

const ON_LIGHT = ['#4c6fe0', '#3451d1', '#2a3fa8', '#1f2f7e', '#141e55'];
const ON_DARK = ['#4c6fe0', '#6f8bea', '#91a4f4', '#b8c5f8', '#e1e7fd'];

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
