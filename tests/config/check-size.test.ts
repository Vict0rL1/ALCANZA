import { describe, expect, it } from 'vitest'
import { compareToBaseline, initialScripts } from '../../scripts/check-size.mjs'

const html = `<!doctype html><html><head>
<link rel="icon" href="/icon.svg" />
<script src="/theme.js"></script>
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/common-BBB.js">
<link rel="stylesheet" crossorigin href="/assets/index-CCC.css">
<script src="https://example.com/remote.js"></script>
</head><body><script type="module">/* en línea */</script></body></html>`

describe('I4 · presupuesto de tamaño del JS inicial', () => {
  it('cuenta solo los archivos JS locales que index.html carga al abrir (scripts y modulepreload)', () => {
    expect(initialScripts(html)).toEqual(['theme.js', 'assets/index-AAA.js', 'assets/common-BBB.js'])
  })

  it('pasa hasta un 10 % por encima de la referencia y falla al superarlo', () => {
    const baseline = { bytes: 1000 }
    expect(compareToBaseline({ bytes: 1000 }, baseline).ok).toBe(true)
    expect(compareToBaseline({ bytes: 1100 }, baseline).ok).toBe(true)
    const over = compareToBaseline({ bytes: 1101 }, baseline)
    expect(over.ok).toBe(false)
    expect(over.limit).toBe(1100)
    expect(over.percent).toBeCloseTo(10.1, 5)
  })

  it('reducir el tamaño nunca falla', () => {
    expect(compareToBaseline({ bytes: 10 }, { bytes: 1000 }).ok).toBe(true)
  })
})
