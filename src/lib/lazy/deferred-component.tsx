import { Component, Suspense, type ComponentType, type JSX, type ReactNode } from 'react';
import { useHasOpened } from '@hooks/useHasOpened';
import { lazyWithPreload, type PreloadableComponent } from './lazy-with-preload';

type Loader<P> = () => Promise<ComponentType<P>>;

export interface DeferredComponent<P> {
  (props: P): JSX.Element | null;
  preload: () => Promise<void>;
}

interface LoadBoundaryProps {
  resetKey: unknown;
  onError: () => void;
  children: ReactNode;
}

interface LoadBoundaryState {
  failed: boolean;
  resetKey: unknown;
}

class LoadBoundary extends Component<LoadBoundaryProps, LoadBoundaryState> {
  override state: LoadBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<LoadBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: LoadBoundaryProps, state: LoadBoundaryState): Partial<LoadBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function deferred<P extends object>(load: Loader<P>, resetKeyOf: (props: P) => unknown): DeferredComponent<P> {
  let lazyComponent: PreloadableComponent<P> = lazyWithPreload(load);
  const replaceFailedLoad = () => {
    lazyComponent = lazyWithPreload(load);
  };
  const Deferred = ((props: P) => {
    const Lazy = lazyComponent as unknown as ComponentType<P>;
    return (
      <LoadBoundary resetKey={resetKeyOf(props)} onError={replaceFailedLoad}>
        <Suspense fallback={null}>
          <Lazy {...props} />
        </Suspense>
      </LoadBoundary>
    );
  }) as DeferredComponent<P>;
  Deferred.preload = () => lazyComponent.preload();
  return Deferred;
}

export function deferredComponent<P extends object>(load: Loader<P>): DeferredComponent<P> {
  return deferred(load, () => undefined);
}

export function deferredUntilOpen<P extends { isOpen: boolean }>(load: Loader<P>): DeferredComponent<P> {
  const Inner = deferred(load, (props: P) => props.isOpen);
  const Deferred = ((props: P) => {
    const hasOpened = useHasOpened(props.isOpen);
    return hasOpened ? <Inner {...props} /> : null;
  }) as DeferredComponent<P>;
  Deferred.preload = Inner.preload;
  return Deferred;
}
