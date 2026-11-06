import { expect, type Locator, type Page } from '@playwright/test';

export async function classesOf(locator: Locator): Promise<string[]> {
  return ((await locator.getAttribute('class')) ?? '').split(/\s+/).filter(Boolean);
}

export async function expectClasses(locator: Locator, classes: string[]) {
  expect(await classesOf(locator)).toEqual(expect.arrayContaining(classes));
}

export async function expectNoClass(locator: Locator, pattern: RegExp) {
  expect((await classesOf(locator)).filter((c) => pattern.test(c))).toEqual([]);
}

export async function overrideJson(page: Page, path: string, body: unknown) {
  await page.route(`http://api.e2e.test${path}`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
          body: JSON.stringify(body),
        })
      : route.fallback()
  );
}
