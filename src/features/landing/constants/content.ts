import type { IconType } from 'react-icons';
import { FaBell, FaBolt, FaLock, FaPalette, FaPaperclip, FaRobot } from 'react-icons/fa';

export const APP_URL = '/app/';

export type FeatureId = 'realtime' | 'encryption' | 'media' | 'assistant' | 'themes' | 'notifications';

export interface Feature {
  id: FeatureId;
  icon: IconType;
}

export const FEATURES: Feature[] = [
  { id: 'realtime', icon: FaBolt },
  { id: 'encryption', icon: FaLock },
  { id: 'media', icon: FaPaperclip },
  { id: 'assistant', icon: FaRobot },
  { id: 'themes', icon: FaPalette },
  { id: 'notifications', icon: FaBell },
];

export const SECURITY_STEP_IDS = ['keys', 'encrypt', 'relay', 'read'] as const;

export const SCREENSHOT_NAMES = ['chat-assistente', 'chat-desktop', 'chat-arquivo'] as const;

export type ScreenshotName = (typeof SCREENSHOT_NAMES)[number];

export const FAQ_IDS = ['free', 'install', 'encryption', 'recovery', 'assistant', 'theme', 'translation'] as const;

export const LINKS = {
  repository: 'https://github.com/Plovatto/SparkChat',
  apiRepository: 'https://github.com/Plovatto/API-SparkChat',
  apiDocs: 'https://sparkchat-api.plovatto.dev/docs/',
  portfolio: 'https://plovatto.dev/',
  license: 'https://github.com/Plovatto/SparkChat/blob/main/LICENSE',
};
