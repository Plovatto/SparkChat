import type { IconType } from 'react-icons';
import {
  FaBolt,
  FaCommentDots,
  FaEyeSlash,
  FaFileAlt,
  FaIcons,
  FaImage,
  FaLanguage,
  FaMicrophone,
  FaPaperclip,
  FaPhoneAlt,
  FaReply,
  FaRobot,
  FaSyncAlt,
  FaUserCircle,
  FaUsers,
  FaMobileAlt,
  FaDesktop,
  FaVideo,
} from 'react-icons/fa';

export const APP_URL = '/app/';
export const APP_INSTALL_URL = '/app/?install=1';

export type FeatureId = 'reactions' | 'gifs' | 'translation' | 'groups' | 'install' | 'photos';

export interface Feature {
  id: FeatureId;
  icon: IconType;
}

export const FEATURES: Feature[] = [
  { id: 'reactions', icon: FaIcons },
  { id: 'gifs', icon: FaImage },
  { id: 'translation', icon: FaLanguage },
  { id: 'groups', icon: FaUsers },
  { id: 'install', icon: FaMobileAlt },
  { id: 'photos', icon: FaUserCircle },
];

export type MoreFeatureId = 'realtime' | 'media' | 'replies' | 'deleteForMe' | 'assistant' | 'sync';

export const MORE_FEATURES: { id: MoreFeatureId; icon: IconType }[] = [
  { id: 'realtime', icon: FaBolt },
  { id: 'media', icon: FaPaperclip },
  { id: 'replies', icon: FaReply },
  { id: 'deleteForMe', icon: FaEyeSlash },
  { id: 'assistant', icon: FaRobot },
  { id: 'sync', icon: FaSyncAlt },
];

export type CallModeId = 'voice' | 'video' | 'share' | 'transfer';

export const CALL_MODES: { id: CallModeId; icon: IconType }[] = [
  { id: 'voice', icon: FaPhoneAlt },
  { id: 'video', icon: FaVideo },
  { id: 'share', icon: FaDesktop },
  { id: 'transfer', icon: FaMobileAlt },
];

export const CALL_FACT_IDS = ['signed', 'direct', 'ring'] as const;

export const SECURITY_STEP_IDS = ['keys', 'encrypt', 'relay', 'read'] as const;

export type CoveredId = 'messages' | 'files' | 'gifs' | 'reactions' | 'photos' | 'groups' | 'calls';

export const COVERED_ITEMS: { id: CoveredId; icon: IconType; cipher: string }[] = [
  { id: 'messages', cipher: '9f2c 41ae 7b0d e3', icon: FaCommentDots },
  { id: 'files', cipher: 'c7e1 0a9b 52fd 8c', icon: FaFileAlt },
  { id: 'gifs', cipher: '3b8f d26a e9c1 07', icon: FaImage },
  { id: 'reactions', cipher: 'e05a 7fc2 1d94 b6', icon: FaIcons },
  { id: 'photos', cipher: '71dc 9e3b a8f0 25', icon: FaUserCircle },
  { id: 'groups', cipher: 'a46e 03b7 f1c9 5d', icon: FaUsers },
  { id: 'calls', cipher: 'd93f 6c1a 80be 4e', icon: FaMicrophone },
];

export const FAQ_IDS = ['free', 'privacy', 'watch', 'devices', 'install', 'groups'] as const;

export const LINKS = {
  repository: 'https://github.com/Plovatto/SparkChat',
  apiRepository: 'https://github.com/Plovatto/API-SparkChat',
  apiDocs: 'https://sparkchat-api.plovatto.dev/docs/',
  portfolio: 'https://plovatto.dev/',
  license: 'https://github.com/Plovatto/SparkChat/blob/main/LICENSE',
};
