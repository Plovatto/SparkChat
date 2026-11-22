import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChangedSinceMount } from './useChangedSinceMount';

describe('useChangedSinceMount', () => {
  it('stays false for the mounted value and turns true once the value changes', () => {
    const { result, rerender } = renderHook(({ value }) => useChangedSinceMount(value), { initialProps: { value: false } });
    expect(result.current).toBe(false);
    rerender({ value: true });
    expect(result.current).toBe(true);
    rerender({ value: false });
    expect(result.current).toBe(false);
  });
});
