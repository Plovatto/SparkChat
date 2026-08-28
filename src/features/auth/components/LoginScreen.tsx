import { useState } from 'react';
import '../styles/auth.css';
import { useLoginTheme } from '../hooks/useLoginTheme';
import type { CreateAccountInput, LoginMode, User } from '../types';
import { ChooseModeCard } from './ChooseModeCard';
import { CreateAccountForm } from './CreateAccountForm';
import { ExistingCodeForm } from './ExistingCodeForm';

interface LoginScreenProps {
  onAuthenticated: (user: User) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>('choose');
  const { darkMode, theme, toggle } = useLoginTheme();

  const handleCreateAccount = (input: CreateAccountInput) => {
    onAuthenticated(input);
  };

  if (mode === 'new') {
    return (
      <CreateAccountForm
        darkMode={darkMode}
        theme={theme}
        onToggleTheme={toggle}
        onBack={() => setMode('choose')}
        onSubmit={handleCreateAccount}
      />
    );
  }

  if (mode === 'existing') {
    return (
      <ExistingCodeForm
        darkMode={darkMode}
        theme={theme}
        onToggleTheme={toggle}
        onBack={() => setMode('choose')}
        onSubmit={onAuthenticated}
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
