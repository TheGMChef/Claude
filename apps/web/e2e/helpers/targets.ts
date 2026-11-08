import type { Page } from '@playwright/test';

export interface TargetReport {
  /** Visible interactive elements that were measured. */
  checked: number;
  /** Elements whose box is under 44×44 and whose 44×44 hit area also fails hit-testing. */
  small: { el: string; w: number; h: number; missed: string[] }[];
}

const SELECTOR = 'button, a[href], input, select, textarea, [role="tab"]';

/**
 * Measures every visible interactive element. A box of at least 44×44 passes outright. A smaller
 * box passes only if real hit-testing proves a 44×44 tap area: at the four corners of a 44×44
 * square centred on it (inset 1px), `elementsFromPoint` must return the element or a descendant.
 * That covers pseudo-element expanders (e.g. the chip remove `::after`) that layout APIs can't see.
 */
export function measureTargets(page: Page): Promise<TargetReport> {
  return page.evaluate((sel) => {
    const MIN = 43.5;
    const HALF = 22 - 1;
    const all = [...document.querySelectorAll<HTMLElement>(sel)];
    let checked = 0;
    const small: TargetReport['small'] = [];
    for (const el of all) {
      // A checkbox/radio is sized by its label; judge the label instead.
      const box =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
          ? (el.closest('label') ?? el)
          : el;
      let r = box.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered (e.g. a closed menu)
      checked++;
      if (r.width >= MIN && r.height >= MIN) continue;

      box.scrollIntoView({ block: 'center', inline: 'center' });
      r = box.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const missed: string[] = [];
      for (const [dx, dy] of [
        [-HALF, -HALF],
        [HALF, -HALF],
        [-HALF, HALF],
        [HALF, HALF],
      ] as const) {
        const hits = document.elementsFromPoint(cx + dx, cy + dy);
        if (!hits.some((n) => n === box || box.contains(n))) missed.push(`${dx},${dy}`);
      }
      if (missed.length) {
        small.push({ el: el.outerHTML.slice(0, 100), w: r.width, h: r.height, missed });
      }
    }
    window.scrollTo(0, 0);
    return { checked, small };
  }, SELECTOR);
}
