import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck, FaMobileAlt, FaPalette } from 'react-icons/fa';
import { buildTheme, COLOR_THEMES, THEME_BASES, useTheme, type ColorThemeId, type ThemeBaseId } from '@features/theme';

interface ThemeMenuProps {
  isOpen: boolean;
  position: { top: number; right: number };
  onClose: () => void;
}

const MENU_WIDTH_PX = 340;

export function ThemeMenu({ isOpen, position, onClose }: ThemeMenuProps) {
  const { theme, baseTheme, colorTheme, changeBaseTheme, changeColorTheme } = useTheme();

  const colorPreviews = useMemo(
    () =>
      (Object.keys(COLOR_THEMES) as ColorThemeId[]).map((colorId) => ({
        colorId,
        name: COLOR_THEMES[colorId].name,
        tokens: buildTheme(baseTheme, colorId).tokens,
      })),
    [baseTheme],
  );

  const basePreviews = useMemo(
    () =>
      (Object.keys(THEME_BASES) as ThemeBaseId[]).map((baseId) => ({
        baseId,
        name: THEME_BASES[baseId].name,
        tokens: buildTheme(baseId, colorTheme).tokens,
      })),
    [colorTheme],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    window.addEventListener('resize', onClose);
    return () => window.removeEventListener('resize', onClose);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const clampedRight = Math.min(Math.max(position.right, 12), window.innerWidth - MENU_WIDTH_PX - 12);

  const sectionTitleStyle = {
    padding: '8px 12px',
    fontSize: '0.7rem',
    color: theme.textSecondary,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  return createPortal(
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }} onClick={onClose} />

      <div
        className="animate__animated animate__fadeIn animate__faster"
        style={{
          position: 'fixed',
          top: position.top,
          right: clampedRight,
          background: theme.surfaceElevated,
          border: `1px solid ${theme.border}`,
          borderRadius: '14px',
          padding: '8px',
          width: `${MENU_WIDTH_PX}px`,
          maxWidth: 'calc(100vw - 20px)',
          maxHeight: `min(520px, calc(100vh - ${position.top + 16}px))`,
          overflowY: 'auto',
          zIndex: 99999,
          boxShadow: theme.shadowLg,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={sectionTitleStyle}>
          <FaMobileAlt size={11} /> Modo Base
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '6px' }}>
          {basePreviews.map(({ baseId, name, tokens }) => {
            const isSelected = baseTheme === baseId;

            return (
              <button
                key={baseId}
                type="button"
                onClick={() => changeBaseTheme(baseId)}
                data-selected={isSelected}
                className="sc-menu-item"
                style={{
                  borderRadius: '10px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '34px',
                    borderRadius: '8px',
                    background: tokens.canvas,
                    border: `2px solid ${isSelected ? tokens.accent : theme.border}`,
                    display: 'flex',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: '38%', background: tokens.sidebar }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', padding: '5px' }}>
                    <div style={{ height: '6px', width: '70%', borderRadius: '3px', background: tokens.messageOther }} />
                    <div style={{ height: '6px', width: '55%', borderRadius: '3px', background: tokens.messageOwn, alignSelf: 'flex-end' }} />
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {name}
                  {isSelected && <FaCheck size={10} />}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ margin: '8px 4px', borderTop: `1px solid ${theme.border}` }} />

        <div style={sectionTitleStyle}>
          <FaPalette size={11} /> Tema de Cores
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
          {colorPreviews.map(({ colorId, name, tokens }) => {
            const isSelected = colorTheme === colorId;

            return (
              <button
                key={colorId}
                type="button"
                onClick={() => {
                  changeColorTheme(colorId);
                  onClose();
                }}
                data-selected={isSelected}
                className="sc-menu-item"
                style={{
                  borderRadius: '8px',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.82rem',
                  fontWeight: isSelected ? 700 : 500,
                }}
              >
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: tokens.gradient,
                    border: `2px solid ${isSelected ? tokens.accent : theme.borderStrong}`,
                    boxShadow: isSelected ? `0 0 0 2px ${theme.focusRing}` : 'none',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {isSelected && <FaCheck size={11} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}
