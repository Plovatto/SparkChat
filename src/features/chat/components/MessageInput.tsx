import { useRef, useState, type FormEvent } from 'react';
import { Button, Form } from 'react-bootstrap';
import { FaPaperPlane } from 'react-icons/fa';
import { DEFAULT_ROOM_THEME } from '@features/rooms/constants/default-theme';

interface MessageInputProps {
  onSend: (content: string) => void;
}

const theme = DEFAULT_ROOM_THEME;

export function MessageInput({ onSend }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    onSend(trimmed);
    setMessage('');
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
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
      <Form.Control
        ref={inputRef}
        type="text"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
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
      {message.trim() && (
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
  );
}
