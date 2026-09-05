import type { CSSProperties } from 'react';
import { FaComments } from 'react-icons/fa';
import { useTheme } from '@features/theme';

export function EmptyChatState() {
  const { theme } = useTheme();

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.canvas,
        color: theme.textSecondary,
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <FaComments size={100} className="animate-float" style={{ marginBottom: '30px', color: theme.accentText, opacity: 0.35 }} />
      <h2
        className="sc-anim-rise-in sc-stagger"
        style={{ fontSize: '2rem', marginBottom: '15px', color: theme.textPrimary, fontWeight: 700, '--sc-stagger-index': 1 } as CSSProperties}
      >
        Selecione uma conversa
      </h2>
      <p
        className="sc-anim-rise-in sc-stagger"
        style={{ fontSize: '1.1rem', color: theme.textSecondary, maxWidth: '400px', '--sc-stagger-index': 2 } as CSSProperties}
      >
        Escolha um chat existente ou clique em &quot;Novo Chat&quot; para começar
      </p>
    </div>
  );
}
