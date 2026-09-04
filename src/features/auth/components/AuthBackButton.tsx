import { Button } from 'react-bootstrap';
import { FaArrowLeft } from 'react-icons/fa';

interface AuthBackButtonProps {
  onClick: () => void;
}

export function AuthBackButton({ onClick }: AuthBackButtonProps) {
  return (
    <Button
      onClick={onClick}
      className="smooth-transition"
      style={{
        background: 'rgba(255,255,255,0.2)',
        border: 'none',
        borderRadius: '12px',
        padding: '12px 12px',
        color: 'white',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'rgba(255,255,255,0.3)';
        event.currentTarget.style.transform = 'translateX(-3px)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'rgba(255,255,255,0.2)';
        event.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <FaArrowLeft size={18} />
    </Button>
  );
}
