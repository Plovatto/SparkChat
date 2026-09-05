import { useState, type CSSProperties } from 'react';
import '../styles/auth.css';
import { themeTokensToCssVars } from '@features/theme';
import type { LoginThemeControls } from '../hooks/useLoginTheme';
import type { LoginMode, PendingE2eCredential, PendingRegistration, User } from '../types';
import { ChooseModeCard } from './ChooseModeCard';
import { CreateAccountForm } from './CreateAccountForm';
import { LoginForm } from './LoginForm';

interface LoginScreenProps {
  loginTheme: LoginThemeControls;
  onRegister: (input: PendingRegistration) => void;
  onLogin: (user: User, e2eCredential?: PendingE2eCredential) => void;
  registerError?: string;
}

export function LoginScreen({ loginTheme, onRegister, onLogin, registerError }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>('choose');
  const { darkMode, theme, toggle } = loginTheme;
  const scopedThemeVars = themeTokensToCssVars(theme) as CSSProperties;

  return (
    <div style={scopedThemeVars} data-theme={theme.kind}>
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
        <ChooseModeCard
          darkMode={darkMode}
          theme={theme}
          onToggleTheme={toggle}
          onNewUser={() => setMode('new')}
          onExistingUser={() => setMode('existing')}
        />
      )}
    </div>
  );
}
