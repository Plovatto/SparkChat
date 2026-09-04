import { FaReply, FaShare, FaTrash } from 'react-icons/fa';
import { IconPillButton } from '@components/common/IconPillButton';
import type { ThemePalette } from '@features/theme';

interface MessageActionsRowProps {
  isOwn: boolean;
  theme: ThemePalette;
  onReply: () => void;
  onDelete: () => void;
  onForward: () => void;
}

export function MessageActionsRow({ isOwn, theme, onReply, onDelete, onForward }: MessageActionsRowProps) {
  return (
    <div className="animate__animated animate__fadeIn animate__faster" style={{ display: 'flex', gap: '8px', margin: '3px 0' }}>
      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onReply();
        }}
        background={theme.surface}
        textColor={theme.text}
        icon={<FaReply size={11} />}
        iconBackground={`${theme.primary}26`}
        iconColor={theme.primary}
        label="Responder"
      />

      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onForward();
        }}
        background={theme.surface}
        textColor={theme.text}
        icon={<FaShare size={11} />}
        iconBackground={`${theme.primary}26`}
        iconColor={theme.primary}
        label="Encaminhar"
      />

      {isOwn && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          background={theme.surface}
          textColor={theme.text}
          icon={<FaTrash size={11} />}
          iconBackground="rgba(239, 83, 80, 0.16)"
          iconColor="#ef5350"
          label="Excluir"
        />
      )}
    </div>
  );
}
