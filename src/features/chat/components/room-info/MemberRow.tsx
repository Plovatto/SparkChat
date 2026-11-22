import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LuCheck, LuCopy, LuCrown, LuEllipsisVertical, LuUserMinus } from 'react-icons/lu';
import { Avatar } from '@features/profile-photos/components/Avatar';
import { getDisplayName } from '@lib/format';
import type { RoomParticipant } from '@lib/socket';

interface MemberRowProps {
  participant: RoomParticipant;
  currentUserId: string | undefined;
  subtitle: string;
  canManage: boolean;
  isCopied: boolean;
  index: number;
  onCopy: () => void;
  onPromote: () => void;
  onRemove: () => void;
  onViewPhoto: (photoUrl: string) => void;
}

export function MemberRow({ participant, currentUserId, subtitle, canManage, isCopied, index, onCopy, onPromote, onRemove, onViewPhoto }: MemberRowProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const isSelf = participant.id === currentUserId;
  const name = getDisplayName(participant.id, participant.nickname, currentUserId);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const closeOnOutside = (event: PointerEvent) => {
      if (rowRef.current && event.target instanceof Node && !rowRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [isMenuOpen]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setIsMenuOpen(false);
    }
  };

  const runAndClose = (action: () => void) => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <div ref={rowRef} className="sc-info-member" data-menu-open={isMenuOpen} style={{ '--sc-info-i': index } as CSSProperties}>
      <Avatar userId={participant.id} avatarIndex={participant.avatar} tone="soft" size={40} iconSize={19} onPhotoClick={onViewPhoto}>
        {participant.status === 'online' && <span className="sc-info-member__online" />}
      </Avatar>
      <div className="sc-info-member__body">
        <span className="sc-info-member__name">
          <span className="sc-info-member__nickname">{name}</span>
          {participant.isAdmin && <LuCrown size={13} className="sc-info-member__crown" aria-label={t('roomInfo.admin')} />}
        </span>
        <span className="sc-info-member__meta" data-online={participant.status === 'online'}>
          {subtitle}
        </span>
      </div>
      {!isSelf && (
        <div className="sc-info-member__actions" onKeyDown={handleMenuKeyDown}>
          <button
            type="button"
            className="sc-info-member__more"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label={t('roomInfo.memberOptions', { name: participant.nickname })}
            title={t('roomInfo.memberOptions', { name: participant.nickname })}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isCopied ? <LuCheck size={17} className="sc-anim-badge-pop" aria-hidden="true" /> : <LuEllipsisVertical size={18} aria-hidden="true" />}
          </button>
          {isMenuOpen && (
            <div className="sc-info-menu" role="menu">
              <button type="button" role="menuitem" className="sc-info-menu__item" onClick={() => runAndClose(onCopy)}>
                <LuCopy size={15} aria-hidden="true" />
                {t('roomInfo.copyUsername')}
              </button>
              {canManage && !participant.isAdmin && (
                <button type="button" role="menuitem" className="sc-info-menu__item" onClick={() => runAndClose(onPromote)}>
                  <LuCrown size={15} aria-hidden="true" />
                  {t('roomInfo.promote')}
                </button>
              )}
              {canManage && (
                <button type="button" role="menuitem" className="sc-info-menu__item" data-tone="danger" onClick={() => runAndClose(onRemove)}>
                  <LuUserMinus size={15} aria-hidden="true" />
                  {t('roomInfo.remove')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
