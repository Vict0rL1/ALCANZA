/**
 * Genera las capturas de `tests/visual/screens.spec.ts` en docs/screenshots/<etiqueta>/.
 *   npm run shots -- --label=before
 *   npm run shots -- --label=after --project=celular
 * Cualquier otro argumento se pasa tal cual a Playwright.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const label = args.find((a) => a.startsWith('--label='))?.slice('--label='.length) ?? 'after'
const rest = args.filter((a) => !a.startsWith('--label='))
if (!/^[a-z0-9-]+$/.test(label)) {
  console.error(`Etiqueta no válida: «${label}» (solo minúsculas, dígitos y guiones).`)
  process.exit(2)
}
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const result = spawnSync(process.execPath, [cli, 'test', '-c', 'playwright.visual.config.ts', ...rest], {
  stdio: 'inherit',
  env: { ...process.env, SHOTS_LABEL: label },
})
process.exit(result.status ?? 1)
