import { useState } from 'react';
import { FaShieldAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useContactTrust } from '../hooks/useContactTrust';
import { SafetyNumberDialog } from './SafetyNumberDialog';

interface ContactSecurityLinkProps {
  contactId: string;
  contactName: string;
}

export function ContactSecurityLink({ contactId, contactName }: ContactSecurityLinkProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trust = useContactTrust(contactId);

  if (!trust || (trust.status === 'invalid' && !trust.pin)) {
    return null;
  }

  return (
    <>
      <button type="button" className="sc-btn sc-btn--text" onClick={() => setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
        <FaShieldAlt size={12} aria-hidden="true" />
        {t('chat.keyTrust.openDialog')}
      </button>
      <SafetyNumberDialog isOpen={open} onClose={() => setOpen(false)} contactId={contactId} contactName={contactName} trust={trust} />
    </>
  );
}
