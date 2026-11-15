import Logo from '@/assets/Logo.svg';

interface BrandMarkProps {
  size?: 'sm' | 'lg';
}

export function BrandMark({ size = 'sm' }: BrandMarkProps) {
  return (
    <span className="lp-brand-mark" data-size={size} aria-hidden="true">
      <img src={Logo} alt="" width={44} height={40} />
    </span>
  );
}
