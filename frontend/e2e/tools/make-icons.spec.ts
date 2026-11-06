import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';

const FACE = fileURLToPath(new URL('../../src/assets/images/ssabi-face.png', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const PAPER = '#fdfdfa';

test.skip(!process.env.MAKE_ICONS, 'MAKE_ICONS=1 일 때만 아이콘을 만든다');

for (const { size, file } of [
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 512, file: 'icon-512.png' },
]) {
  test(`아이콘 ${file}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '한 번만 만든다');
    const face = readFileSync(FACE).toString('base64');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${PAPER}">` +
        `<img src="data:image/png;base64,${face}" style="height:${Math.round(size * 0.68)}px"></body>`
    );
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await page.screenshot({ path: `${PUBLIC}${file}`, scale: 'css', omitBackground: false });
  });
}
