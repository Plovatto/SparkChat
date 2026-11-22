interface IllustratedPersonProps {
  variant: 'marina' | 'you';
}

export function IllustratedPerson({ variant }: IllustratedPersonProps) {
  return (
    <span className="lp-person" data-variant={variant} aria-hidden="true">
      <span className="lp-person__window" />
      <span className="lp-person__figure">
        <span className="lp-person__body" />
        <span className="lp-person__neck" />
        <span className="lp-person__head">
          <span className="lp-person__hair" />
          <span className="lp-person__face" />
        </span>
      </span>
    </span>
  );
}
