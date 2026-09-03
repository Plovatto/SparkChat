import { FaComments, FaGlobe, FaImage, FaPalette, FaUndo } from 'react-icons/fa';
import { AccordionSection } from '@components/common/AccordionSection';
import { Slider } from '@components/common/Slider';
import { DEFAULT_CHAT_APPEARANCE, toSixDigitHex, useTheme } from '@features/theme';

interface AppearanceEditorProps {
  roomId: string;
}

export function AppearanceEditor({ roomId }: AppearanceEditorProps) {
  const { theme, getRoomAppearance, setRoomAppearance, resetRoomAppearance, setRoomWallpaper } = useTheme();
  const appearance = getRoomAppearance(roomId);

  const ownDefaultHex = toSixDigitHex(theme.messageOwn);
  const otherDefaultHex = toSixDigitHex(theme.messageOther);

  const update = (patch: Partial<typeof appearance>) => {
    setRoomAppearance(roomId, patch, false);
  };

  const applyToAllChats = () => {
    setRoomAppearance(roomId, appearance, true);
    resetRoomAppearance(roomId, false);
  };

  const handleReset = () => {
    resetRoomAppearance(roomId, false);
    setRoomWallpaper(roomId, 'default');
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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
        <div
          style={{
            fontSize: '0.85rem',
            color: theme.textSecondary,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FaPalette /> Aparência
        </div>
        <button
          onClick={applyToAllChats}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: `${theme.primary}18`,
            border: 'none',
            color: theme.primary,
            borderRadius: '8px',
            padding: '7px 12px',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          <FaGlobe size={12} />
          Aplicar em todos os chats
        </button>
      </div>

      <div style={{ background: theme.background, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <AccordionSection title="Papel de parede" icon={<FaImage size={12} />} theme={theme}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Slider
              label="Escurecimento"
              valueLabel={`${appearance.overlayOpacity}%`}
              value={appearance.overlayOpacity}
              min={0}
              max={100}
              onChange={(value) => update({ overlayOpacity: value })}
              accentColor={theme.primary}
              textColor={theme.text}
              textSecondaryColor={theme.textSecondary}
            />

            <Slider
              label="Desfoque"
              valueLabel={appearance.overlayBlur === 0 ? 'Nenhum' : `${appearance.overlayBlur}px`}
              value={appearance.overlayBlur}
              min={0}
              max={20}
              onChange={(value) => update({ overlayBlur: value })}
              accentColor={theme.primary}
              textColor={theme.text}
              textSecondaryColor={theme.textSecondary}
            />
          </div>
        </AccordionSection>

        <div style={{ borderTop: `1px solid ${theme.border}` }} />

        <AccordionSection title="Balões de mensagem" icon={<FaComments size={12} />} theme={theme}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={bubbleCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    value={appearance.ownBubbleColor ?? ownDefaultHex}
                    onChange={(event) => update({ ownBubbleColor: event.target.value })}
                    style={{ width: '36px', height: '28px', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: 0 }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.text }}>Mensagens enviadas</span>
                </div>
                {appearance.ownBubbleColor && (
                  <button
                    onClick={() => update({ ownBubbleColor: null, ownBubbleOpacity: DEFAULT_CHAT_APPEARANCE.ownBubbleOpacity })}
                    style={{ background: 'none', border: 'none', color: theme.primary, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  >
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
                accentColor={theme.primary}
                textColor={theme.text}
                textSecondaryColor={theme.textSecondary}
              />
            </div>

            <div style={bubbleCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    value={appearance.otherBubbleColor ?? otherDefaultHex}
                    onChange={(event) => update({ otherBubbleColor: event.target.value })}
                    style={{ width: '36px', height: '28px', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: 0 }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.text }}>Mensagens recebidas</span>
                </div>
                {appearance.otherBubbleColor && (
                  <button
                    onClick={() => update({ otherBubbleColor: null, otherBubbleOpacity: DEFAULT_CHAT_APPEARANCE.otherBubbleOpacity })}
                    style={{ background: 'none', border: 'none', color: theme.primary, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  >
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
                accentColor={theme.primary}
                textColor={theme.text}
                textSecondaryColor={theme.textSecondary}
              />
            </div>

            <Slider
              label="Desfoque dos balões (ambos os lados)"
              valueLabel={appearance.bubbleBlur === 0 ? 'Nenhum' : `${appearance.bubbleBlur}px`}
              value={appearance.bubbleBlur}
              min={0}
              max={20}
              onChange={(value) => update({ bubbleBlur: value })}
              accentColor={theme.primary}
              textColor={theme.text}
              textSecondaryColor={theme.textSecondary}
            />
          </div>
        </AccordionSection>
      </div>

      <button
        onClick={handleReset}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          marginTop: '20px',
          padding: '10px 16px',
          borderRadius: '10px',
          border: `1.5px solid ${theme.border}`,
          background: 'transparent',
          color: theme.textSecondary,
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <FaUndo size={13} />
        Restaurar aparência padrão deste chat
      </button>
      </div>
    </div>
  );
}
