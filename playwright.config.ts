import { defineConfig, devices } from '@playwright/test'

// Si tu entorno ya trae Chromium instalado en otra ruta, puedes indicarla con
// PLAYWRIGHT_CHROMIUM_EXECUTABLE. En un equipo normal basta con
// `npx playwright install chromium`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

// Firefox y WebKit (motor de Safari) son opcionales porque requieren descargar esos
// navegadores: `npx playwright install firefox webkit` y luego
// `PLAYWRIGHT_ALL_BROWSERS=1 npm run test:e2e`. WebKit automatizado en Linux/Windows NO
// equivale a Safari en un iPhone real (otro sistema, teclado, PWA y almacenamiento).
const extraBrowsers = process.env.PLAYWRIGHT_ALL_BROWSERS === '1'

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
    ...(extraBrowsers
      ? [
          // Firefox no emula «isMobile»: se prueba con el tamaño de un celular.
          { name: 'firefox-celular', use: { browserName: 'firefox' as const, viewport: { width: 390, height: 844 } } },
          { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } },
          { name: 'firefox-escritorio', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
