import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDeps } from '../../test/fixtures';
import { getSetting } from '../repo/settings';
import { isIosSafariTab, persistStatus, requestPersist } from '../storage';

afterEach(() => vi.unstubAllGlobals());

const stubStorage = (storage: unknown) => vi.stubGlobal('navigator', { ...navigator, storage });

describe('persistStatus', () => {
  it('maps persisted() true, false, missing API and a throw', async () => {
    stubStorage({ persisted: async () => true });
    expect(await persistStatus()).toBe('yes');
    stubStorage({ persisted: async () => false });
    expect(await persistStatus()).toBe('not-yet');
    stubStorage(undefined);
    expect(await persistStatus()).toBe('unknown');
    stubStorage({ persisted: async () => Promise.reject(new Error('no')) });
    expect(await persistStatus()).toBe('unknown');
  });
});

describe('requestPersist', () => {
  it('returns the answer and records persistRequestedAt', async () => {
    const d = testDeps();
    stubStorage({ persist: async () => true });
    expect(await requestPersist(d)).toBe(true);
    expect(await getSetting(d, 'persistRequestedAt')).toBeGreaterThan(0);
  });

  it('tolerates a refusal, a rejection and a missing API without throwing', async () => {
    const d = testDeps();
    stubStorage({ persist: async () => false });
    expect(await requestPersist(d)).toBe(false);
    stubStorage({ persist: async () => Promise.reject(new Error('blocked')) });
    expect(await requestPersist(d)).toBe(false);
    stubStorage(undefined);
    expect(await requestPersist(d)).toBe(false);
  });
});

describe('isIosSafariTab', () => {
  const IPAD =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const CHROME_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
  const DESKTOP =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  it('is true for iPadOS Safari (reports a Mac, has touch) and iPhone Safari in a tab', () => {
    expect(isIosSafariTab({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
    expect(isIosSafariTab({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe(true);
  });

  it('is false for an installed Home Screen app, desktop Safari, desktop Chrome and Chrome on iOS', () => {
    expect(isIosSafariTab({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBe(false);
    expect(isIosSafariTab({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false);
    expect(isIosSafariTab({ userAgent: DESKTOP, maxTouchPoints: 0 })).toBe(false);
    expect(isIosSafariTab({ userAgent: CHROME_IOS, maxTouchPoints: 5 })).toBe(false);
  });
});
