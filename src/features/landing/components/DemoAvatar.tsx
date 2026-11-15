import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';

interface DemoAvatarProps {
  name: string;
  size?: number;
  online?: boolean;
}

export function DemoAvatar({ name, size = 36, online = false }: DemoAvatarProps) {
  const avatar = AVATARS.find((item) => item.name === name) ?? AVATARS[0];
  if (!avatar) {
    return null;
  }
  const Icon = avatar.icon;

  return (
    <span className="lp-demo-avatar" style={{ width: size, height: size, background: avatar.bgGradient }}>
      <Icon size={Math.round(size * 0.48)} color={AVATAR_ICON_COLOR} />
      {online && <span className="lp-demo-avatar__status" />}
    </span>
  );
}
