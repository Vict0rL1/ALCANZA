/** Porcentajes escritos por la persona ↔ puntos básicos (1 % = 100). */

/** «12», «12.5» o «12,5» → puntos básicos (1250). Como mucho 2 decimales; (0, 100]. */
export function parsePercent(text: string): number | null {
  const m = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%?\s*$/.exec(text)
  if (!m) return null
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return bps > 0 && bps <= 10000 ? bps : null
}

export const percentText = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2).replace(/0$/, ''))

