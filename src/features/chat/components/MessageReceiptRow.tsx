import { AVATARS } from '@features/auth/constants/avatars';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { useTheme } from '@features/theme';
import type { MessageReceiptInfo } from '@lib/message-status';

interface MessageReceiptRowProps {
  receipt: MessageReceiptInfo;
  isOwn: boolean;
}

export function MessageReceiptRow({ receipt, isOwn }: MessageReceiptRowProps) {
  const { theme } = useTheme();
  const label = receipt.type === 'read' ? 'Lida por:' : 'Entregue para:';

  return (
    <div
      className="sc-anim-rise-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.7rem',
        color: theme.textMuted,
        marginTop: '4px',
        marginLeft: isOwn ? 'auto' : 0,
        paddingLeft: isOwn ? 0 : '12px',
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: '2px' }}>
        {receipt.users.map((participant) => (
          <Avatar
            key={participant.id}
            userId={participant.id}
            avatarIndex={AVATARS[participant.avatar] ? participant.avatar : 0}
            tone="solid"
            size={16}
            iconSize={10}
            title={participant.nickname}
            style={{ border: `1px solid ${theme.borderStrong}` }}
          />
        ))}
      </div>
    </div>
  );
}
