import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
    { name: 'iphone-pro-max', use: { ...devices['iPhone 15 Pro Max'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    env: {
      VITE_USE_MOCK: 'false',
      VITE_API_URL: 'http://api.e2e.test',
      VITE_DEMO_DEVICE_ID: 'e2e-device',
    },
  },
});
