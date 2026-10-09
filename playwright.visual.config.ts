import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * Capturas de pantalla de cada pantalla principal (proyecto «visual», fuera de `npm run test:e2e`).
 *   npm run shots -- --label=before   → docs/screenshots/before/<proyecto>-<tema>-<pantalla>.png
 * Mismos tres tamaños que las pruebas, a escala 1 para que las imágenes pesen poco.
 */
export default defineConfig({
  ...base,
  testDir: './tests/visual',
  outputDir: './test-results-visual',
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
  use: { ...base.use, trace: 'off' },
  projects: (base.projects ?? [])
    .filter((p) => ['celular', 'celular-pequeno', 'escritorio'].includes(p.name ?? ''))
    .map((p) => ({ ...p, use: { ...p.use, deviceScaleFactor: 1 } })),
})
