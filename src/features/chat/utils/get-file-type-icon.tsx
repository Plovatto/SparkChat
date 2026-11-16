import type { IconType } from 'react-icons';
import {
  FaFileAlt,
  FaFileArchive,
  FaFileCsv,
  FaFileExcel,
  FaFilePdf,
  FaFilePowerpoint,
  FaFileWord,
  FaVideo,
} from 'react-icons/fa';
import { translate } from '@lib/i18n/app-i18n';

export interface FileTypeIcon {
  icon: IconType;
  color: string;
  label: string;
}

const WORD_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const POWERPOINT_MIME_TYPES = new Set([
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const ARCHIVE_MIME_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);

export function getFileTypeIcon(mimeType: string): FileTypeIcon {
  if (mimeType === 'application/pdf') {
    return { icon: FaFilePdf, color: '#e53e3e', label: translate('chat.fileTypes.pdf') };
  }
  if (mimeType.startsWith('video/')) {
    return { icon: FaVideo, color: '#805ad5', label: translate('chat.fileTypes.video') };
  }
  if (WORD_MIME_TYPES.has(mimeType)) {
    return { icon: FaFileWord, color: '#2b6cb0', label: translate('chat.fileTypes.word') };
  }
  if (EXCEL_MIME_TYPES.has(mimeType)) {
    return { icon: FaFileExcel, color: '#38a169', label: translate('chat.fileTypes.excel') };
  }
  if (POWERPOINT_MIME_TYPES.has(mimeType)) {
    return { icon: FaFilePowerpoint, color: '#dd6b20', label: translate('chat.fileTypes.powerpoint') };
  }
  if (ARCHIVE_MIME_TYPES.has(mimeType)) {
    return { icon: FaFileArchive, color: '#d69e2e', label: translate('chat.fileTypes.archive') };
  }
  if (mimeType === 'text/csv') {
    return { icon: FaFileCsv, color: '#38a169', label: translate('chat.fileTypes.csv') };
  }
  return { icon: FaFileAlt, color: '#718096', label: translate('chat.fileTypes.file') };
}
