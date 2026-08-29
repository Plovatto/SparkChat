import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Button, Form } from 'react-bootstrap';
import { FaImage, FaPaperPlane } from 'react-icons/fa';
import { useTheme } from '@features/theme';

export interface MessageInputHandle {
  focus: () => void;
}

export interface MessageInputSubmitPayload {
  text: string;
  imageFile: File | null;
}

interface MessageInputProps {
  onSend: (payload: MessageInputSubmitPayload) => void;
  onTyping: () => void;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  { onSend, onTyping },
  ref,
) {
  const { theme, baseTheme } = useTheme();
  const [message, setMessage] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    return () => {
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.previewUrl);
      }
    };
  }, [pendingImage]);

  const clearPendingImage = () => {
    setPendingImage(null);
  };

  const handleImagePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed && !pendingImage) {
      return;
    }

    onSend({ text: trimmed, imageFile: pendingImage?.file ?? null });
    setMessage('');
    clearPendingImage();
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
    <>
      {pendingImage && (
        <div
          style={{
            background: theme.surfaceLight,
            padding: '12px 18px',
            borderLeft: `4px solid ${theme.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>
              Anexo pendente
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                color: theme.text,
                maxWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              <img
                src={pendingImage.previewUrl}
                alt="anexo"
                style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
              />
            </div>
          </div>
          <Button
            variant="link"
            onClick={clearPendingImage}
            style={{ color: theme.textSecondary, padding: '4px 8px', minWidth: 'auto', textDecoration: 'none' }}
          >
            ✕
          </Button>
        </div>
      )}
      <Form
        onSubmit={handleSubmit}
        style={{
          background: theme.surface,
          padding: '14px 18px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <input type="file" ref={fileInputRef} onChange={handleImagePick} accept="image/*" style={{ display: 'none' }} />
        {!message.trim() && (
          <Button
            variant="link"
            onClick={() => fileInputRef.current?.click()}
            title="Enviar imagem"
            style={{
              color: theme.primary,
              padding: '10px',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: baseTheme === 'light' ? '#e1e1e1ff' : theme.surfaceLight,
              textDecoration: 'none',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.opacity = '1';
            }}
          >
            <FaImage size={18} />
          </Button>
        )}
        <Form.Control
          ref={inputRef}
          type="text"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            onTyping();
          }}
          placeholder="Digite sua mensagem..."
          autoFocus
          style={{
            borderRadius: '22px',
            padding: '12px 18px',
            border: `2px solid ${theme.border}`,
            fontSize: '0.95rem',
            background: theme.inputBg,
            color: theme.text,
          }}
          onFocus={(event) => {
            event.currentTarget.style.borderColor = theme.primary;
            event.currentTarget.style.boxShadow = `0 0 10px ${theme.primary}40`;
          }}
          onBlur={(event) => {
            event.currentTarget.style.borderColor = theme.border;
            event.currentTarget.style.boxShadow = 'none';
          }}
        />
        {(message.trim() || pendingImage) && (
          <Button
            type="submit"
            className="send-button-appear"
            style={{
              background: theme.headerGradient,
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              flexShrink: 0,
              boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'scale(1.1) rotate(15deg)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'scale(1) rotate(0deg)';
            }}
          >
            <FaPaperPlane />
          </Button>
        )}
      </Form>
    </>
  );
});
