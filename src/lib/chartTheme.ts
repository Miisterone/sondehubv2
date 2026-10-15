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
        text: '#b4bdc9',
        ink: '#f6f8fa',
        surface: '#0e1013',
        accent: '#91a4f4',
        accentFill: 'rgba(145,164,244,0.12)',
        pred: '#fb7185',
        zero: '#6b7480',
      }
    : {
        axis: '#e6e8eb',
        grid: '#e6e8eb',
        text: '#425466',
        ink: '#0a0a0a',
        surface: '#ffffff',
        accent: '#3451d1',
        accentFill: 'rgba(52,81,209,0.10)',
        pred: '#be123c',
        zero: '#7a8597',
      };
}
