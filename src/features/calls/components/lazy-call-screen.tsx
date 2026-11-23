import { useEffect, useState, type ComponentProps } from 'react';
import { deferredComponent } from '@lib/lazy/deferred-component';
import { preloadWhenIdle } from '@lib/lazy/preload-when-idle';
import { useCall } from '../call-context';
import type { CallScreen as EagerCallScreen } from './CallScreen';

type CallScreenProps = ComponentProps<typeof EagerCallScreen>;

const LazyCallScreen = deferredComponent<CallScreenProps>(() => import('./CallScreen').then((module) => module.CallScreen));

export function CallScreen(props: CallScreenProps) {
  const { snapshot } = useCall();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => preloadWhenIdle([() => LazyCallScreen.preload().then(() => setIsLoaded(true))]), []);

  return isLoaded || snapshot.state.phase !== 'idle' ? <LazyCallScreen {...props} /> : null;
}
