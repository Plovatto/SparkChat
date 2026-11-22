import { useRef } from 'react';

export function useChangedSinceMount<T>(value: T): boolean {
  const mountedRef = useRef(value);
  return !Object.is(mountedRef.current, value);
}
