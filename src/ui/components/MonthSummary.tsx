/**
 * Resumen mensual: ingresos, gasto neto y gasto por categoría.
 * Barras horizontales de una sola serie (un solo color), ordenadas y con el
 * valor escrito junto a cada barra: la lista es a la vez gráfico y tabla.
 */
import { useMemo, useState } from 'react'
import { addMonthsClamped, endOfMonth, startOfMonth } from '../../domain/dates'
import { periodSummary } from '../../domain/insights'
import { useT } from '../../i18n'
import { useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { useFormat } from '../format'
import { categoryLabel } from '../labels'
import { StatTile } from './common'
import { LimitsSection } from './LimitsSection'
import { Icon } from './Icon'

const TOP = 5

export function MonthSummary() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [showAll, setShowAll] = useState(false)
  const summary = useMemo(() => periodSummary(data, month, endOfMonth(month)), [data, month])
  const max = Math.max(1, ...summary.categories.map((c) => c.netMinor))
  const monthLabel = fmt.monthYear(month)
  const isCurrent = month === startOfMonth(today)

  return (
    <section className="card month-summary" aria-labelledby="summary-title">
      <div className="month-nav">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => {
            setMonth(addMonthsClamped(month, -1, 1))
            setShowAll(false)
          }}
          aria-label={t('summary.prev')}
        >
          <Icon name="chevronLeft" />
        </button>
        <h2 id="summary-title" className="month-nav__title" aria-live="polite">
          {t('summary.title', { month: monthLabel })}
        </h2>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => {
            setMonth(addMonthsClamped(month, 1, 1))
            setShowAll(false)
          }}
          aria-label={t('summary.next')}
          disabled={isCurrent}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="stats">
        <StatTile label={t('summary.income')} value={fmt.money(summary.incomeMinor)} />
        <StatTile label={t('summary.spending')} value={fmt.money(summary.netSpendingMinor)} />
      </div>
      {summary.categories.length === 0 ? (
        <p className="note">{t('summary.empty')}</p>
      ) : (
        <>
          <h3 className="section-title">{t('summary.byCategory')}</h3>
          <ul className="bars" aria-label={t('summary.aria', { month: monthLabel })}>
            {(showAll ? summary.categories : summary.categories.slice(0, TOP)).map((c) => {
              const pct = Math.max(0, c.netMinor) / max
              return (
                <li key={c.categoryId} className="bars__row">
                  <span className="bars__label">
                    {categoryLabel(t, c.categoryId)}
                    <span className="bars__count"> · {tn('summary.count', c.count)}</span>
                  </span>
                  <span className="bars__track" aria-hidden="true">
                    <span className="bars__fill" style={{ width: `${pct * 100}%` }} />
                  </span>
                  <span className="bars__value">{fmt.money(c.netMinor)}</span>
                </li>
              )
            })}
          </ul>
          {summary.categories.length > TOP && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? t('summary.showLess') : t('summary.showAll', { count: summary.categories.length })}
            </button>
          )}
        </>
      )}
      <LimitsSection summary={summary} />
      <p className="note">{t('summary.note')}</p>
    </section>
  )
}
