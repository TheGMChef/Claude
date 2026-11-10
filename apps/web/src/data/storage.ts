import type { RepoDeps } from './deps';
import { setSetting } from './repo/settings';

export async function persistStatus(): Promise<'yes' | 'not-yet' | 'unknown'> {
  try {
    const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!s || typeof s.persisted !== 'function') return 'unknown';
    return (await s.persisted()) ? 'yes' : 'not-yet';
  } catch {
    return 'unknown';
  }
}

/** Asks the browser to keep our data. Never throws: a refusal or a missing API just returns false. */
export async function requestPersist(d: RepoDeps): Promise<boolean> {
  let granted = false;
  try {
    const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!s || typeof s.persist !== 'function') return false;
    granted = (await s.persist()) === true;
  } catch {
    granted = false;
  }
  try {
    await setSetting(d, 'persistRequestedAt', d.now());
  } catch {
    // the answer matters more than the note
  }
  return granted;
}

type Nav = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { standalone?: boolean };

/** iPhone or iPad (iPadOS reports a Mac) in Safari itself, not installed to the Home Screen. */
export function isIosSafariTab(nav: Nav = navigator as Nav): boolean {
  const ua = nav.userAgent;
  const ipad = /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipad;
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua)) return false;
  return /Safari\//.test(ua) && nav.standalone !== true;
}
