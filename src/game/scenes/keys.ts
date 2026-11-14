export const SceneKey = {
  Boot: 'Boot',
  Preloader: 'Preloader',
  Title: 'Title',
  Landed: 'Landed',
  NavChart: 'NavChart',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
