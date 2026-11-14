export const SceneKey = {
  Boot: 'Boot',
  Preloader: 'Preloader',
  Title: 'Title',
  Landed: 'Landed',
  NavChart: 'NavChart',
  Flight: 'Flight',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
