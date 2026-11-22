import { useEffect, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@features/motion';
import type { ThemeTokens } from '@features/theme';
import '../styles/welcome.css';
import '../styles/welcome-form.css';
import type { WelcomeSceneId } from '../lib/welcome-script';
import { WelcomeChatField } from './WelcomeChatField';

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return visible;
}

interface AuthSceneProps {
  sceneId: WelcomeSceneId;
  kind: ThemeTokens['kind'];
  entranceReady: boolean;
  children: ReactNode;
}

export function AuthScene({ sceneId, kind, entranceReady, children }: AuthSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();

  return (
    <div className="welcome-root" data-kind={kind} data-scene={sceneId} data-paused={pageVisible ? undefined : 'true'}>
      {entranceReady && <WelcomeChatField sceneId={sceneId} reducedMotion={reducedMotion} showConversation />}
      {entranceReady && (
        <main key={sceneId} className="welcome-stage">
          {children}
        </main>
      )}
    </div>
  );
}
