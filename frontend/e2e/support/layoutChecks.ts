import type { Page } from '@playwright/test';

export async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

export async function overflowingTexts(page: Page, scope?: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `(${el.getAttribute('aria-label')})` : ''} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
    const root = scope ? document.querySelector(scope) : document.body;
    if (!root) return [];
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      const hasText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0
      );
      if (!hasText) continue;
      const style = getComputedStyle(el);
      if (style.display === 'inline' || style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        out.push(`offscreen ${describe(el)}`);
        continue;
      }
      const clamped =
        (style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '') ||
        style.textOverflow === 'ellipsis' ||
        ['auto', 'scroll'].includes(style.overflowY) ||
        ['auto', 'scroll'].includes(style.overflowX);
      if (clamped) continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`overflow-x ${describe(el)}`);
      else if (style.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 1)
        out.push(`clipped-y ${describe(el)}`);
    }
    return out;
  }, scope);
}

export async function smallTapTargets(page: Page, exclude?: string): Promise<string[]> {
  return page.evaluate((exclude) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a, input, [role="tab"]'))) {
      if (exclude && el.closest(exclude)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (rect.width < 44 || rect.height < 44) {
        const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 24);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
    }
    return out;
  }, exclude);
}

export async function fontReport(
  page: Page
): Promise<{ family: string; serifLoaded: boolean; pretendardLoaded: boolean; hangulWidth: number }> {
  return page.getByRole('article').evaluate(async (article) => {
    await document.fonts.ready;
    const style = getComputedStyle(article);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    return {
      family: style.fontFamily,
      serifLoaded: document.fonts.check(`${style.fontSize} ${style.fontFamily.split(',')[0]}`),
      pretendardLoaded: document.fonts.check('16px "Pretendard"'),
      hangulWidth: ctx.measureText('가나다').width,
    };
  });
}
