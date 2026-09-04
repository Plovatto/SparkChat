import { AVATARS } from '@features/auth/constants/avatars';
import type { ThemePalette } from '@features/theme';
import type { MessageReceiptInfo } from '@lib/message-status';

interface MessageReceiptRowProps {
  receipt: MessageReceiptInfo;
  isOwn: boolean;
  theme: ThemePalette;
}

export function MessageReceiptRow({ receipt, isOwn, theme }: MessageReceiptRowProps) {
  const label = receipt.type === 'read' ? 'Lida por:' : 'Entregue para:';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.7rem',
        color: theme.textSecondary,
        opacity: 0.7,
        marginTop: '4px',
        marginLeft: isOwn ? 'auto' : 0,
        paddingLeft: isOwn ? 0 : '12px',
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: '2px' }}>
        {receipt.users.map((participant) => {
          const avatar = AVATARS[participant.avatar] ?? AVATARS[0];
          const Icon = avatar?.icon;
          return (
            <div
              key={participant.id}
              title={participant.nickname}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: avatar?.color ?? theme.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${theme.primary}33`,
                flexShrink: 0,
              }}
            >
              {Icon && <Icon size={10} color="white" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
