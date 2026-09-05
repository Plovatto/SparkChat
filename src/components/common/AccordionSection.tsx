import { useState, type ReactNode } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import { useTheme } from '@features/theme';

interface AccordionSectionProps {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AccordionSection({ title, icon, defaultOpen = false, children }: AccordionSectionProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen((previous) => !previous)}
        aria-expanded={isOpen}
        className="sc-menu-item"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          margin: '0 -8px',
          width: 'calc(100% + 16px)',
          borderRadius: '8px',
        }}
      >
        <div
          style={{
            fontSize: '0.78rem',
            color: isOpen ? theme.accentText : theme.textSecondary,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            transition: 'color 0.16s ease',
          }}
        >
          {icon} {title}
        </div>
        <FaChevronDown
          size={12}
          color={isOpen ? theme.accentText : theme.textSecondary}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease, color 0.16s ease' }}
        />
      </button>
      {isOpen && <div style={{ marginTop: '14px' }}>{children}</div>}
    </div>
  );
}
