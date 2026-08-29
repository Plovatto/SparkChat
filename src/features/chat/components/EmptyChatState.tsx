import { FaComments } from 'react-icons/fa';
import { DEFAULT_ROOM_THEME } from '@features/rooms/constants/default-theme';

interface EmptyChatStateProps {
  selectedRoomName?: string;
}

export function EmptyChatState({ selectedRoomName }: EmptyChatStateProps) {
  const theme = DEFAULT_ROOM_THEME;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.background,
        color: theme.textSecondary,
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <FaComments size={100} className="animate-float" style={{ marginBottom: '30px', opacity: 0.2 }} />
      <h2 style={{ fontSize: '2rem', marginBottom: '15px', color: theme.text, fontWeight: 700 }}>
        {selectedRoomName ?? 'Selecione uma conversa'}
      </h2>
      <p style={{ fontSize: '1.1rem', color: theme.textSecondary, maxWidth: '400px' }}>
        {selectedRoomName
          ? 'A área de mensagens chega na próxima parte.'
          : 'Escolha um chat existente ou clique em "Novo Chat" para começar'}
      </p>
    </div>
  );
}
