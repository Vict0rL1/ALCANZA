/** Etiqueta localizada de un periodo de presupuesto (§6.1) a partir de los formateadores de la persona. */
import type { Period } from '../domain/periods'
import type { Translator } from '../i18n'
import type { Formatter } from './format'

export function periodLabel(t: Translator['t'], fmt: Formatter, period: Period): string {
  switch (period.type) {
    case 'month':
      return fmt.monthYear(period.start)
    case 'quarter':
      return t('home.period.quarter', { n: Math.floor((period.anchorMonth - 1) / 3) + 1, year: period.anchorYear })
    case 'semester':
      return t('home.period.semester', { n: period.anchorMonth <= 6 ? 1 : 2, year: period.anchorYear })
    case 'year':
      return String(period.anchorYear)
    default:
      return t('home.period.range', { from: fmt.date(period.start, { compact: true }), to: fmt.date(period.end, { compact: true }) })
  }
}
