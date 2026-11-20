import { useState, type CSSProperties } from 'react';
import { themeTokensToCssVars } from '@features/theme';
import type { LoginThemeControls } from '../hooks/useLoginTheme';
import type { WelcomeSceneId } from '../lib/welcome-script';
import type { LoginMode, PendingE2eCredential, PendingRegistration, User } from '../types';
import { AuthScene } from './AuthScene';
import { ChooseModeCard } from './ChooseModeCard';
import { CreateAccountForm } from './CreateAccountForm';
import { LoginForm } from './LoginForm';

interface LoginScreenProps {
  loginTheme: LoginThemeControls;
  onRegister: (input: PendingRegistration) => void;
  onLogin: (user: User, e2eCredential?: PendingE2eCredential) => void;
  registerError?: string;
  entranceReady?: boolean;
}

const SCENE_BY_MODE: Record<LoginMode, WelcomeSceneId> = {
  choose: 'choose',
  new: 'register',
  existing: 'login',
};

export function LoginScreen({ loginTheme, onRegister, onLogin, registerError, entranceReady = true }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>('choose');
  const { darkMode, theme, toggle } = loginTheme;
  const scopedThemeVars = themeTokensToCssVars(theme) as CSSProperties;

  return (
    <div style={scopedThemeVars} data-theme={theme.kind}>
      <AuthScene sceneId={SCENE_BY_MODE[mode]} kind={theme.kind} entranceReady={entranceReady}>
        {mode === 'new' ? (
          <CreateAccountForm
            darkMode={darkMode}
            theme={theme}
            onToggleTheme={toggle}
            onBack={() => setMode('choose')}
            onSubmit={onRegister}
            registerError={registerError}
          />
        ) : mode === 'existing' ? (
          <LoginForm darkMode={darkMode} theme={theme} onToggleTheme={toggle} onBack={() => setMode('choose')} onSubmit={onLogin} />
        ) : (
          <ChooseModeCard darkMode={darkMode} onToggleTheme={toggle} onNewUser={() => setMode('new')} onExistingUser={() => setMode('existing')} />
        )}
      </AuthScene>
    </div>
  );
}
