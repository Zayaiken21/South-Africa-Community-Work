// Profile colour themes. Each one tints the profile banner, photo ring and accents.
export type Theme = {id: string; label: string; from: string; to: string; accent: string; soft: string};
/** All colour themes. */
export const THEMES: Theme[] = [
  {id: 'savanna', label: 'Savanna', from: '#176b4e', to: '#a9c479', accent: '#176b4e', soft: '#e3f0e6'},
  {id: 'ocean', label: 'Ocean', from: '#0f4c81', to: '#3fb8c9', accent: '#1a6fb0', soft: '#e2eff9'},
  {id: 'sunset', label: 'Sunset', from: '#d9480f', to: '#f7b267', accent: '#c2410c', soft: '#fdece0'},
  {id: 'jacaranda', label: 'Jacaranda', from: '#5b3fa6', to: '#b794f4', accent: '#6d4bc4', soft: '#efe9fb'},
  {id: 'ruby', label: 'Ruby', from: '#9b1c31', to: '#f06a7c', accent: '#b4233b', soft: '#fbe6ea'},
  {id: 'gold', label: 'Gold', from: '#8a5a12', to: '#f2c94c', accent: '#9a6a12', soft: '#fbf1d9'},
  {id: 'midnight', label: 'Midnight', from: '#0e1613', to: '#3b4a6b', accent: '#2f3d5c', soft: '#e6e9f0'},
  {id: 'fynbos', label: 'Fynbos', from: '#b0306a', to: '#f4a259', accent: '#b0306a', soft: '#fbe7ef'},
];
/** A theme by id (default if unknown). */
export const theme = (id?: string | null) => THEMES.find(t => t.id === id) ?? THEMES[0];
/** CSS colour variables for a theme. */
export const themeStyle = (id?: string | null) => {
  const t = theme(id);
  return {'--t-from': t.from, '--t-to': t.to, '--t-accent': t.accent, '--t-soft': t.soft} as React.CSSProperties;
};
