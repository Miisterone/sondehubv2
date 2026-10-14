export const ALT_BANDS = [0, 8000, 16000, 24000, 32000] as const;

const ON_LIGHT = ['#86b6ef', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const ON_DARK = ['#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb'];

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
