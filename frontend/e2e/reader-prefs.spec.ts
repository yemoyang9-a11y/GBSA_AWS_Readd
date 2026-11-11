import { expect, test, type Page } from '@playwright/test';
import { BOOK_ID } from './support/fixtures';
import { installMockApi } from './support/mockApi';
import { noHorizontalScroll } from './support/layoutChecks';

async function openReader(page: Page) {
  await installMockApi(page, { entryRoute: 'reader' });
  await page.goto(`/books/${BOOK_ID}/read`);
  await expect(page.getByRole('article')).toContainText('15쪽.');
  await page.evaluate(() => document.fonts.ready);
}

async function openPrefs(page: Page) {
  await page.getByRole('button', { name: '보기 설정' }).click();
  await expect(page.getByRole('dialog', { name: '보기 설정' })).toBeVisible();
}

function contrast(fg: string, bg: string): number {
  const lum = (rgb: string) => {
    const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

test('FR-PRG-001: 글자를 최대로 키워도 가로 넘침이 없고 본문은 세로로 스크롤된다', async ({ page }) => {
  await openReader(page);
  await openPrefs(page);
  const larger = page.getByRole('button', { name: '글자 크게' });
  while (await larger.isEnabled()) await larger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '보기 설정' })).toHaveCount(0);

  const article = page.getByRole('article');
  await expect(article).toHaveCSS('font-size', '22px');
  await expect(article).toContainText('15쪽.');
  expect(await noHorizontalScroll(page)).toBe(true);
  const scroll = await article.evaluate((el) => {
    const box = el.parentElement!;
    return { scrollable: box.scrollHeight > box.clientHeight, overflowY: getComputedStyle(box).overflowY };
  });
  expect(scroll.overflowY).toBe('auto');
  expect(scroll.scrollable).toBe(true);
});

test('NFR-USE: 세 배경 모두에서 본문 글자와 배경의 대비가 4.5:1 이상이다', async ({ page }) => {
  await openReader(page);
  await openPrefs(page);
  for (const name of ['기본', '세피아', '어두운']) {
    await page.getByRole('radio', { name }).click();
    await expect(page.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
    const article = page.getByRole('article');
    const { color, background } = await article.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(contrast(color, background), `${name} 본문`).toBeGreaterThanOrEqual(4.5);
    const pageNo = page.getByRole('textbox', { name: '페이지로 이동' });
    const pageNoColor = await pageNo.evaluate((el) => getComputedStyle(el).color);
    const mainBackground = await article.evaluate((el) => getComputedStyle(el.closest('main')!).backgroundColor);
    expect(contrast(pageNoColor, mainBackground), `${name} 쪽 번호`).toBeGreaterThanOrEqual(4.5);
  }
});

test('NFR-USE: 세 배경 모두에서 쪽 번호 입력란에 초점을 주어도 글자와 배경의 대비가 4.5:1 이상이다', async ({ page }) => {
  await openReader(page);
  for (const name of ['기본', '세피아', '어두운']) {
    await openPrefs(page);
    await page.getByRole('radio', { name }).click();
    await expect(page.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '보기 설정' })).toHaveCount(0);

    const pageNo = page.getByRole('textbox', { name: '페이지로 이동' });
    await pageNo.focus();
    await expect(pageNo).toBeFocused();
    const { color, background } = await pageNo.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(background, `${name} 초점 배경은 불투명한 색이다`).not.toBe('rgba(0, 0, 0, 0)');
    expect(contrast(color, background), `${name} 초점 쪽 번호`).toBeGreaterThanOrEqual(4.5);
    await pageNo.blur();
  }
});

test('배경색은 본문 영역에만 들고 윗줄에는 번지지 않는다', async ({ page }) => {
  await openReader(page);
  const topbar = page.getByRole('button', { name: '뒤로 가기' }).locator('..');
  const before = await topbar.evaluate((el) => getComputedStyle(el).backgroundColor);
  await openPrefs(page);
  await page.getByRole('radio', { name: '어두운' }).click();
  await expect(page.getByRole('article')).toHaveCSS('background-color', 'rgb(28, 27, 25)');
  expect(await topbar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
});

test.describe('모바일', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', '모바일 프로젝트에서만');
  });

  test('NFR-USE: 보기 설정 버튼과 -·+·배경 견본이 44px 이상이다', async ({ page }) => {
    await openReader(page);
    const opener = (await page.getByRole('button', { name: '보기 설정' }).boundingBox())!;
    expect(opener.width).toBeGreaterThanOrEqual(44);
    expect(opener.height).toBeGreaterThanOrEqual(44);
    await openPrefs(page);
    const dialog = page.getByRole('dialog', { name: '보기 설정' });
    for (const name of ['글자 작게', '글자 크게', '줄 간격 좁게', '줄 간격 넓게']) {
      const box = (await dialog.getByRole('button', { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    for (const name of ['기본', '세피아', '어두운']) {
      const box = (await dialog.getByRole('radio', { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('NFR-USE: 시트가 열린 동안 손잡이가 겹쳐 눌리지 않는다', async ({ page }) => {
    await openReader(page);
    const handles = [page.getByRole('button', { name: '목차 열기' }), page.getByRole('button', { name: '싸비 열기' })];
    const centers = [];
    for (const handle of handles) {
      const box = (await handle.boundingBox())!;
      centers.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    await openPrefs(page);
    for (const { x, y } of centers) {
      const onHandle = await page.evaluate(
        ([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest('[aria-controls]')),
        [x, y]
      );
      expect(onHandle).toBe(false);
    }
    await page.mouse.click(centers[0].x, centers[0].y);
    await expect(page.getByTestId('toc-list')).toHaveCount(0);
  });
});
