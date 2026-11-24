import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '3000';
const baseURL = `http://127.0.0.1:${port}`;
const externalChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const externalChromiumLaunchOptions = externalChromium
  ? {
      executablePath: externalChromium,
      args: process.env.PLAYWRIGHT_CHROMIUM_ARGS?.split(/\s+/).filter(Boolean),
    }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...(externalChromiumLaunchOptions ? { launchOptions: externalChromiumLaunchOptions } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 0.0.0.0 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
