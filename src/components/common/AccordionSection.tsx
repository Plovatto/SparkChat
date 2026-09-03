import { useState, type ReactNode } from 'react';
import { FaChevronDown } from 'react-icons/fa';

interface AccordionSectionTheme {
  text: string;
  textSecondary: string;
}

interface AccordionSectionProps {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  theme: AccordionSectionTheme;
  children: ReactNode;
}

export function AccordionSection({ title, icon, defaultOpen = false, theme, children }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen((previous) => !previous)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '4px 0',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            fontSize: '0.78rem',
            color: theme.textSecondary,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
          }}
        >
          {icon} {title}
        </div>
        <FaChevronDown
          size={12}
          color={theme.textSecondary}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
        />
      </button>
      {isOpen && <div style={{ marginTop: '14px' }}>{children}</div>}
    </div>
  );
}
