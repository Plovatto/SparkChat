import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type PreloadableComponent<P> = LazyExoticComponent<ComponentType<P>> & {
  preload: () => Promise<void>;
};

export function lazyWithPreload<P>(load: () => Promise<ComponentType<P>>): PreloadableComponent<P> {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const loadOnce = () => {
    pending ??= load()
      .then((component) => ({ default: component }))
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    return pending;
  };
  const component = lazy(loadOnce) as PreloadableComponent<P>;
  component.preload = () => loadOnce().then(
    () => undefined,
    () => undefined,
  );
  return component;
}
