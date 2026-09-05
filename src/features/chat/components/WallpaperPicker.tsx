import type { CSSProperties } from 'react';
import { FaImage } from 'react-icons/fa';
import { CHAT_BACKGROUNDS, useTheme } from '@features/theme';

interface WallpaperPickerProps {
  roomId: string;
}

export function WallpaperPicker({ roomId }: WallpaperPickerProps) {
  const { theme, getRoomWallpaper, setRoomWallpaper } = useTheme();
  const currentId = getRoomWallpaper(roomId)?.id ?? 'default';

  return (
    <div>
      <div
        style={{
          fontSize: '0.85rem',
          color: theme.textSecondary,
          marginBottom: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <FaImage /> Papel de Parede
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          maxHeight: '250px',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '3px',
        }}
      >
        {CHAT_BACKGROUNDS.map((background, index) => {
          const isSelected = currentId === background.id;
          return (
            <button
              type="button"
              key={background.id}
              onClick={() => setRoomWallpaper(roomId, background.id, false)}
              title={background.name}
              data-selected={isSelected}
              className="sc-tile sc-anim-tile-in sc-stagger"
              style={
                {
                  height: '80px',
                  borderRadius: '10px',
                  background: background.isImage
                    ? `${background.background} center/cover no-repeat`
                    : (background.background ?? theme.canvas),
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  padding: 0,
                  overflow: 'hidden',
                  '--sc-stagger-index': Math.min(index, 8),
                  '--sc-stagger-step': '30ms',
                } as CSSProperties
              }
            >
              <div
                style={{
                  width: '100%',
                  padding: '5px',
                  background: theme.scrim,
                  color: theme.onScrim,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {background.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
