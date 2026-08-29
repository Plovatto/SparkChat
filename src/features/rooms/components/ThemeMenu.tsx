import { createPortal } from 'react-dom';
import { FaCheck } from 'react-icons/fa';
import { COLOR_THEMES, THEME_BASES, useTheme, type ColorThemeId, type ThemeBaseId } from '@features/theme';

interface ThemeMenuProps {
  isOpen: boolean;
  position: { top: number; right: number };
  onClose: () => void;
}

export function ThemeMenu({ isOpen, position, onClose }: ThemeMenuProps) {
  const { theme, baseTheme, colorTheme, changeBaseTheme, changeColorTheme } = useTheme();

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }} onClick={onClose} />

      <div
        style={{
          position: 'fixed',
          top: position.top,
          right: position.right,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '8px',
          minWidth: '240px',
          maxHeight: '400px',
          overflowY: 'auto',
          zIndex: 99999,
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: '8px 12px',
            fontSize: '0.7rem',
            color: theme.textSecondary,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}
        >
          📱 Modo Base
        </div>

        {(Object.keys(THEME_BASES) as ThemeBaseId[]).map((baseId) => {
          const base = THEME_BASES[baseId];
          const isSelected = baseTheme === baseId;

          return (
            <div
              key={baseId}
              onClick={() => {
                changeBaseTheme(baseId);
                onClose();
              }}
              style={{
                background: isSelected ? theme.surfaceLight : 'transparent',
                color: theme.text,
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!isSelected) {
                  event.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                }
              }}
              onMouseLeave={(event) => {
                if (!isSelected) {
                  event.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: base.background,
                  border: `2px solid ${base.background === '#ffffff' ? '#e0e0e0' : base.text}`,
                  boxShadow: isSelected ? `0 0 6px ${theme.primary}` : 'none',
                }}
              />
              {base.name}
              {isSelected && <FaCheck size={12} style={{ marginLeft: 'auto' }} />}
            </div>
          );
        })}

        <div style={{ margin: '8px 0', borderTop: `1px solid ${theme.border}`, opacity: 0.3 }} />

        <div
          style={{
            padding: '8px 12px',
            fontSize: '0.7rem',
            color: theme.textSecondary,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}
        >
          🎨 Tema de Cores
        </div>

        {(Object.keys(COLOR_THEMES) as ColorThemeId[]).map((colorId) => {
          const color = COLOR_THEMES[colorId];
          const isSelected = colorTheme === colorId;

          return (
            <div
              key={colorId}
              onClick={() => {
                changeColorTheme(colorId);
                onClose();
              }}
              style={{
                background: isSelected ? theme.surfaceLight : 'transparent',
                color: theme.text,
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!isSelected) {
                  event.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                }
              }}
              onMouseLeave={(event) => {
                if (!isSelected) {
                  event.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: color.headerGradient,
                  border: `2px solid ${theme.border}`,
                  boxShadow: isSelected ? `0 0 6px ${color.primary}` : 'none',
                }}
              />
              {color.name}
              {isSelected && <FaCheck size={12} style={{ marginLeft: 'auto' }} />}
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
