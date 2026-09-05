import { FaComments, FaGlobe, FaImage, FaPalette, FaUndo } from 'react-icons/fa';
import { AccordionSection } from '@components/common/AccordionSection';
import { Slider } from '@components/common/Slider';
import { DEFAULT_CHAT_APPEARANCE, toSixDigitHex, useTheme } from '@features/theme';

interface AppearanceEditorProps {
  roomId: string;
}

export function AppearanceEditor({ roomId }: AppearanceEditorProps) {
  const {
    theme,
    getRoomAppearance,
    setRoomAppearance,
    resetRoomAppearance,
    hasRoomAppearanceOverride,
    setRoomWallpaper,
    getRoomWallpaper,
    resetRoomWallpaper,
    hasRoomWallpaperOverride,
  } = useTheme();
  const appearance = getRoomAppearance(roomId);
  const wallpaperId = getRoomWallpaper(roomId)?.id ?? 'default';
  const hasPendingChanges = hasRoomAppearanceOverride(roomId) || hasRoomWallpaperOverride(roomId);

  const ownDefaultHex = toSixDigitHex(theme.messageOwn);
  const otherDefaultHex = toSixDigitHex(theme.messageOther);

  const update = (patch: Partial<typeof appearance>) => {
    setRoomAppearance(roomId, patch, false);
  };

  const applyToAllChats = () => {
    setRoomAppearance(roomId, appearance, true);
    resetRoomAppearance(roomId, false);
    setRoomWallpaper(roomId, wallpaperId, true);
    resetRoomWallpaper(roomId, false);
  };

  const handleReset = () => {
    resetRoomAppearance(roomId, false);
    resetRoomWallpaper(roomId, false);
  };

  const bubbleCardStyle = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  };

  const bubbleLabelStyle = { fontSize: '0.85rem', fontWeight: 600, color: theme.textPrimary };

  const sectionIconBadgeStyle = {
    width: '22px',
    height: '22px',
    borderRadius: '7px',
    background: theme.accentSoft,
    color: theme.accentText,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={sectionIconBadgeStyle}>
            <FaPalette size={12} />
          </div>
          <span
            style={{
              fontSize: '0.85rem',
              color: theme.textSecondary,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Aparência
          </span>
        </div>
        {hasPendingChanges && (
          <button onClick={applyToAllChats} className="sc-btn sc-btn--soft" style={{ gap: '6px', borderRadius: '8px', padding: '7px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
            <FaGlobe size={12} />
            Aplicar em todos os chats
          </button>
        )}
      </div>

      <div className="sc-card" style={{ padding: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <AccordionSection
            title="Papel de parede"
            icon={
              <span style={sectionIconBadgeStyle}>
                <FaImage size={11} />
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Slider
                label="Escurecimento"
                valueLabel={`${appearance.overlayOpacity}%`}
                value={appearance.overlayOpacity}
                min={0}
                max={100}
                onChange={(value) => update({ overlayOpacity: value })}
              />

              <Slider
                label="Desfoque"
                valueLabel={appearance.overlayBlur === 0 ? 'Nenhum' : `${appearance.overlayBlur}px`}
                value={appearance.overlayBlur}
                min={0}
                max={20}
                onChange={(value) => update({ overlayBlur: value })}
              />
            </div>
          </AccordionSection>

          <div style={{ borderTop: `1px solid ${theme.border}` }} />

          <AccordionSection
            title="Balões de mensagem"
            icon={
              <span style={sectionIconBadgeStyle}>
                <FaComments size={11} />
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={bubbleCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="color"
                      value={appearance.ownBubbleColor ?? ownDefaultHex}
                      onChange={(event) => update({ ownBubbleColor: event.target.value })}
                      className="sc-color-input"
                      title="Cor das mensagens enviadas"
                    />
                    <span style={bubbleLabelStyle}>Mensagens enviadas</span>
                  </div>
                  {appearance.ownBubbleColor && (
                    <button onClick={() => update({ ownBubbleColor: null, ownBubbleOpacity: DEFAULT_CHAT_APPEARANCE.ownBubbleOpacity })} className="sc-btn sc-btn--text">
                      Restaurar padrão
                    </button>
                  )}
                </div>
                <Slider
                  label="Transparência"
                  valueLabel={`${appearance.ownBubbleOpacity}%`}
                  value={appearance.ownBubbleOpacity}
                  min={10}
                  max={100}
                  onChange={(value) => update({ ownBubbleOpacity: value })}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Slider
                    label="Escurecimento do texto"
                    valueLabel={appearance.ownTextIntensity === null ? 'Automático' : `${appearance.ownTextIntensity}%`}
                    value={appearance.ownTextIntensity ?? 50}
                    min={0}
                    max={100}
                    onChange={(value) => update({ ownTextIntensity: value })}
                  />
                  {appearance.ownTextIntensity !== null && (
                    <button onClick={() => update({ ownTextIntensity: null })} className="sc-btn sc-btn--text" style={{ alignSelf: 'flex-start' }}>
                      Restaurar padrão
                    </button>
                  )}
                </div>
              </div>

              <div style={bubbleCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="color"
                      value={appearance.otherBubbleColor ?? otherDefaultHex}
                      onChange={(event) => update({ otherBubbleColor: event.target.value })}
                      className="sc-color-input"
                      title="Cor das mensagens recebidas"
                    />
                    <span style={bubbleLabelStyle}>Mensagens recebidas</span>
                  </div>
                  {appearance.otherBubbleColor && (
                    <button onClick={() => update({ otherBubbleColor: null, otherBubbleOpacity: DEFAULT_CHAT_APPEARANCE.otherBubbleOpacity })} className="sc-btn sc-btn--text">
                      Restaurar padrão
                    </button>
                  )}
                </div>
                <Slider
                  label="Transparência"
                  valueLabel={`${appearance.otherBubbleOpacity}%`}
                  value={appearance.otherBubbleOpacity}
                  min={10}
                  max={100}
                  onChange={(value) => update({ otherBubbleOpacity: value })}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Slider
                    label="Escurecimento do texto"
                    valueLabel={appearance.otherTextIntensity === null ? 'Automático' : `${appearance.otherTextIntensity}%`}
                    value={appearance.otherTextIntensity ?? 50}
                    min={0}
                    max={100}
                    onChange={(value) => update({ otherTextIntensity: value })}
                  />
                  {appearance.otherTextIntensity !== null && (
                    <button onClick={() => update({ otherTextIntensity: null })} className="sc-btn sc-btn--text" style={{ alignSelf: 'flex-start' }}>
                      Restaurar padrão
                    </button>
                  )}
                </div>
              </div>

              <Slider
                label="Desfoque dos balões (ambos os lados)"
                valueLabel={appearance.bubbleBlur === 0 ? 'Nenhum' : `${appearance.bubbleBlur}px`}
                value={appearance.bubbleBlur}
                min={0}
                max={20}
                onChange={(value) => update({ bubbleBlur: value })}
              />
            </div>
          </AccordionSection>
        </div>

        <button onClick={handleReset} className="sc-btn sc-btn--ghost-border" style={{ width: '100%', marginTop: '20px', padding: '10px 16px', fontSize: '0.85rem' }}>
          <FaUndo size={13} />
          Restaurar aparência padrão deste chat
        </button>
      </div>
    </div>
  );
}
