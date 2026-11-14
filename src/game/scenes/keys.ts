export const SceneKey = {
  Boot: 'Boot',
  Preloader: 'Preloader',
  Title: 'Title',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
