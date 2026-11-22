import { useState, type AnimationEvent, type CSSProperties, type ReactNode } from 'react';

interface CollapseProps {
  isExiting: boolean;
  animateEnter?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Collapse({ isExiting, animateEnter = true, className, style, children }: CollapseProps) {
  const [isSettled, setIsSettled] = useState(!animateEnter);
  if (isExiting && isSettled && animateEnter) {
    setIsSettled(false);
  }

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isExiting) {
      setIsSettled(true);
    }
  };

  const classes = ['sc-collapse', animateEnter ? 'sc-collapse--enter' : '', isExiting ? 'is-exiting' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={style} data-settled={(isSettled && !isExiting) || undefined} onAnimationEnd={handleAnimationEnd}>
      <div className="sc-collapse__inner">{children}</div>
    </div>
  );
}
