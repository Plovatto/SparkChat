import { FaReply, FaShare, FaTrash } from 'react-icons/fa';
import { IconPillButton } from '@components/common/IconPillButton';

interface MessageActionsRowProps {
  isOwn: boolean;
  onReply: () => void;
  onDelete: () => void;
  onForward: () => void;
}

export function MessageActionsRow({ isOwn, onReply, onDelete, onForward }: MessageActionsRowProps) {
  return (
    <div className="animate__animated animate__fadeIn animate__faster" style={{ display: 'flex', gap: '8px', margin: '3px 0' }}>
      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onReply();
        }}
        icon={<FaReply size={11} />}
        tone="accent"
        label="Responder"
      />

      <IconPillButton
        onClick={(event) => {
          event.stopPropagation();
          onForward();
        }}
        icon={<FaShare size={11} />}
        tone="accent"
        label="Encaminhar"
      />

      {isOwn && (
        <IconPillButton
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          icon={<FaTrash size={11} />}
          tone="danger"
          label="Excluir"
        />
      )}
    </div>
  );
}
