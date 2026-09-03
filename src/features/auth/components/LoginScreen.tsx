import { useState } from 'react';
import '../styles/auth.css';
import { useLoginTheme } from '../hooks/useLoginTheme';
import type { LoginMode, PendingRegistration, User } from '../types';
import { ChooseModeCard } from './ChooseModeCard';
import { CreateAccountForm } from './CreateAccountForm';
import { LoginForm } from './LoginForm';

interface LoginScreenProps {
  onRegister: (input: PendingRegistration) => void;
  onLogin: (user: User) => void;
  registerError?: string;
}

export function LoginScreen({ onRegister, onLogin, registerError }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>('choose');
  const { darkMode, theme, toggle } = useLoginTheme();

  if (mode === 'new') {
    return (
      <CreateAccountForm
        darkMode={darkMode}
        theme={theme}
        onToggleTheme={toggle}
        onBack={() => setMode('choose')}
        onSubmit={onRegister}
        registerError={registerError}
      />
    );
  }

  if (mode === 'existing') {
    return (
      <LoginForm
        darkMode={darkMode}
        theme={theme}
        onToggleTheme={toggle}
        onBack={() => setMode('choose')}
        onSubmit={onLogin}
      />
    );
  }

  return (
    <ChooseModeCard
      darkMode={darkMode}
      theme={theme}
      onToggleTheme={toggle}
      onNewUser={() => setMode('new')}
      onExistingUser={() => setMode('existing')}
    />
  );
}
