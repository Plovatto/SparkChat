import type { IconType } from 'react-icons';
import { FaCamera, FaClock, FaCommentDots, FaCompass, FaEnvelope, FaGrinSquint, FaMagic, FaPalette, FaStickyNote } from 'react-icons/fa';

export const ASSISTANT_CAPABILITY_IDS = ['themes', 'fullLook', 'photoTheme', 'notes', 'reminders', 'status', 'scheduled', 'help', 'chat'] as const;

export type AssistantCapabilityId = (typeof ASSISTANT_CAPABILITY_IDS)[number];

export const ASSISTANT_CAPABILITY_ICONS: Record<AssistantCapabilityId, IconType> = {
  themes: FaPalette,
  fullLook: FaMagic,
  photoTheme: FaCamera,
  notes: FaStickyNote,
  reminders: FaClock,
  status: FaCommentDots,
  scheduled: FaEnvelope,
  help: FaCompass,
  chat: FaGrinSquint,
};
