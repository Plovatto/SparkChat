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
        {CHAT_BACKGROUNDS.map((background) => {
          const isSelected = currentId === background.id;
          return (
            <div
              key={background.id}
              onClick={() => setRoomWallpaper(roomId, background.id)}
              title={background.name}
              style={{
                height: '80px',
                borderRadius: '10px',
                background: background.isImage
                  ? `${background.background} center/cover no-repeat`
                  : (background.background ?? theme.background),
                cursor: 'pointer',
                border: isSelected ? '3px solid #667eea' : `2px solid ${theme.border}`,
                boxShadow: isSelected ? '0 0 0 2px #667eea40' : 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'scale(1.05)';
                if (!isSelected) {
                  event.currentTarget.style.borderColor = theme.primary;
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'scale(1)';
                if (!isSelected) {
                  event.currentTarget.style.borderColor = theme.border;
                }
              }}
            >
              <div
                style={{
                  width: '100%',
                  padding: '5px',
                  background: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {background.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
