import type { CSSProperties } from 'react';

export const MEDIA_VIEWER_BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.78)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  zIndex: 10040,
};

export const MEDIA_VIEWER_CHROME_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '999px',
  border: '2px solid rgba(255, 255, 255, 0.25)',
  color: '#ffffff',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
};

export const MEDIA_VIEWER_DIVIDER_STYLE: CSSProperties = {
  width: '1px',
  height: '22px',
  background: 'rgba(255, 255, 255, 0.25)',
  margin: '0 2px',
  flexShrink: 0,
};

export const MEDIA_VIEWER_CONTENT_SHADOW = '0 20px 60px rgba(0, 0, 0, 0.4)';
export const MEDIA_VIEWER_VIDEO_BACKGROUND = '#000000';
