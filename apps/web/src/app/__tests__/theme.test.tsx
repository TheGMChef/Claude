import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { readTheme, writeTheme } from '../theme';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('theme storage', () => {
  it('returns the stored choice', () => {
    expect(readTheme({ getItem: () => 'dark' })).toBe('dark');
    expect(readTheme({ getItem: () => 'light' })).toBe('light');
  });
  it('defaults to system with no storage, no value or junk', () => {
    expect(readTheme(undefined)).toBe('system');
    expect(readTheme({ getItem: () => null })).toBe('system');
    expect(readTheme({ getItem: () => 'purple' })).toBe('system');
  });
  it('writeTheme stores the choice', () => {
    const setItem = vi.fn();
    writeTheme('dark', { setItem });
    expect(setItem).toHaveBeenCalledWith('prepdesk.theme', 'dark');
  });
});

describe('Review Focus 5: storage that throws', () => {
  it('readTheme and writeTheme do not throw', () => {
    expect(readTheme(throwing)).toBe('system');
    expect(() => writeTheme('dark', throwing)).not.toThrow();
  });
  it('setChoice still applies data-theme for the session', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwing.getItem);
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwing.setItem);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.choice).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    act(() => result.current.setChoice('dark'));
    expect(result.current.choice).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => result.current.setChoice('system'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    spy.mockRestore();
    spy2.mockRestore();
  });
});
