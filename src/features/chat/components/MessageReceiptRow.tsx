import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
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
                background: avatar?.color ?? theme.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${theme.borderStrong}`,
                flexShrink: 0,
              }}
            >
              {Icon && <Icon size={10} color={AVATAR_ICON_COLOR} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
