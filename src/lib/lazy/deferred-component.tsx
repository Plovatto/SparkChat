import { Suspense, type ComponentType, type JSX } from 'react';
import { useHasOpened } from '@hooks/useHasOpened';
import { lazyWithPreload } from './lazy-with-preload';

type Loader<P> = () => Promise<ComponentType<P>>;

export interface DeferredComponent<P> {
  (props: P): JSX.Element | null;
  preload: () => Promise<void>;
}

export function deferredComponent<P extends object>(load: Loader<P>): DeferredComponent<P> {
  const lazyComponent = lazyWithPreload(load);
  const Lazy = lazyComponent as unknown as ComponentType<P>;
  const Deferred = ((props: P) => (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  )) as DeferredComponent<P>;
  Deferred.preload = lazyComponent.preload;
  return Deferred;
}

export function deferredUntilOpen<P extends { isOpen: boolean }>(load: Loader<P>): DeferredComponent<P> {
  const Inner = deferredComponent(load);
  const Deferred = ((props: P) => {
    const hasOpened = useHasOpened(props.isOpen);
    return hasOpened ? <Inner {...props} /> : null;
  }) as DeferredComponent<P>;
  Deferred.preload = Inner.preload;
  return Deferred;
}
