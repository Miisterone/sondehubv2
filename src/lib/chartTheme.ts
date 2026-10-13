export interface ChartTheme {
  axis: string;
  grid: string;
  text: string;
  ink: string;
  surface: string;
  accent: string;
  accentFill: string;
  pred: string;
  zero: string;
}

export function chartTheme(theme: 'dark' | 'light'): ChartTheme {
  return theme === 'dark'
    ? {
        axis: '#262a30',
        grid: '#1c2025',
        text: '#a3adba',
        ink: '#f6f8fa',
        surface: '#0e1013',
        accent: '#8199f0',
        accentFill: 'rgba(129,153,240,0.12)',
        pred: '#6e7783',
        zero: '#4a515b',
      }
    : {
        axis: '#e6e8eb',
        grid: '#eef0f3',
        text: '#425466',
        ink: '#0a0a0a',
        surface: '#ffffff',
        accent: '#3451d1',
        accentFill: 'rgba(52,81,209,0.10)',
        pred: '#7d8796',
        zero: '#b8bec7',
      };
}
