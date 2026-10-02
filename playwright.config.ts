import { defineConfig, devices } from '@playwright/test'

// Si tu entorno ya trae Chromium instalado en otra ruta, puedes indicarla con
// PLAYWRIGHT_CHROMIUM_EXECUTABLE. En un equipo normal basta con
// `npx playwright install chromium`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    timezoneId: 'America/Toronto',
    locale: 'es-MX',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'celular',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
    {
      name: 'celular-pequeno',
      use: {
        viewport: { width: 320, height: 640 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        launchOptions: { executablePath },
      },
    },
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
