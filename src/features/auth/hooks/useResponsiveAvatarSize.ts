import { useEffect, useState } from 'react';

export interface ResponsiveAvatarSize {
  avatarSize: number;
  iconSize: number;
}

export function useResponsiveAvatarSize(): ResponsiveAvatarSize {
  const [isSmallScreen, setIsSmallScreen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 480,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 480px)');
    const update = () => setIsSmallScreen(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isSmallScreen ? { avatarSize: 58, iconSize: 30 } : { avatarSize: 75, iconSize: 40 };
}
