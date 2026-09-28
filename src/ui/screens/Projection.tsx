import { useMemo, useState } from 'react'
import { computeBudget } from '../../domain/budget'
import { estimateDailySpend, projectBalance } from '../../domain/projection'
import { useT } from '../../i18n'
import { useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { ProjectionChart } from '../components/charts'
import { Alert, Card, Explain } from '../components/common'
import { MoneyField, Segmented } from '../components/fields'
import { parseMoneyText, moneyErrorMessage } from '../moneyText'
import { useFormat } from '../format'
import { planItemName } from '../labels'

type SpendMode = 'none' | 'average' | 'custom'

export function Projection() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const estimate = useMemo(() => estimateDailySpend(data, today), [data, today])
  const [mode, setMode] = useState<SpendMode>(estimate.sufficient ? 'average' : 'none')
  const [customText, setCustomText] = useState('')
  const custom = customText.trim() ? parseMoneyText(customText, fmt, { allowZero: true }) : null
  const customMinor = custom && custom.ok ? custom.minor : 0
  const dailySpendMinor = mode === 'average' ? estimate.dailyMinor : mode === 'custom' ? customMinor : 0

  const projection = projectBalance(data, today, { dailySpendMinor })
  const budget = useMemo(() => computeBudget(data, today), [data, today])
  const eventDays = projection.days.filter((d) => d.events.length > 0 || d.endMinor < 0)

  return (
    <div className="stack">
      <Card>
        <p className="lead">{t('projection.intro')}</p>
        {projection.firstNegativeDate ? (
          <Alert tone="critical" title={t('projection.shortfallTitle', { date: fmt.date(projection.firstNegativeDate, { weekday: true }) })} role="status">
            {t('projection.shortfallText', { amount: fmt.money(projection.lowest.minor), date: fmt.date(projection.lowest.date) })}
          </Alert>
        ) : (
          <Alert tone="good" title={t('projection.noShortfallTitle')}>
            {t('projection.noShortfallText', { amount: fmt.money(projection.lowest.minor), date: fmt.date(projection.lowest.date) })}
          </Alert>
        )}
        {projection.firstBelowGoalsDate && !projection.firstNegativeDate && (
          <Alert tone="warning" title={t('projection.belowGoalsTitle', { date: fmt.date(projection.firstBelowGoalsDate) })}>
            {t('projection.belowGoalsText', { amount: fmt.money(projection.goalsReservedMinor) })}
          </Alert>
        )}
        <ProjectionChart projection={projection} fmt={fmt} today={today} />
        <p className="note">{t('projection.chartNote')}</p>
      </Card>

      <Card labelledBy="assumptions-title">
        <h2 id="assumptions-title" className="card__title">
          {t('projection.assumptionsTitle')}
        </h2>
        <Segmented
          legend={t('projection.spendLegend')}
          name="spend"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'none', label: t('projection.spendNone') },
            ...(estimate.sufficient ? [{ value: 'average' as const, label: t('projection.spendAverage', { amount: fmt.money(estimate.dailyMinor) }) }] : []),
            { value: 'custom', label: t('projection.spendCustom') },
          ]}
          hint={estimate.sufficient ? tn('projection.spendAverageHint', estimate.daysObserved) : t('projection.spendInsufficient')}
        />
        {mode === 'custom' && (
          <MoneyField label={t('projection.customLabel')} value={customText} onChange={setCustomText} error={custom && !custom.ok ? moneyErrorMessage(t, custom) : null} fmt={fmt} />
        )}
        <ul className="bullets">
          <li>{t('projection.assumeStart', { amount: fmt.money(projection.startMinor) })}</li>
          <li>{t('projection.assumePlanned')}</li>
          {dailySpendMinor > 0 && <li>{t('projection.assumeDaily', { amount: fmt.money(dailySpendMinor) })}</li>}
          {projection.overdueOutflowsToday.length > 0 && <li>{tn('projection.assumeOverdue', projection.overdueOutflowsToday.length)}</li>}
          {projection.lateIncomesExcluded.length > 0 && (
            <li>
              {t('projection.assumeLateIncome', {
                names: projection.lateIncomesExcluded.map((i) => planItemName(i, t)).join(', '),
              })}
            </li>
          )}
          {projection.estimatedItems.length > 0 && <li>{t('projection.assumeEstimates')}</li>}
          <li>{t('projection.assumeGoals')}</li>
          <li>{t('projection.assumeNoCards')}</li>
        </ul>
        {!projection.hasIncomeInRange && <Alert tone="warning" title={t('projection.noIncomeTitle')}>{t('projection.noIncomeText')}</Alert>}
        {budget.isBalanceStale && budget.balanceAgeDays !== null && (
          <Alert tone="warning" icon="clock" title={tn('home.alert.staleTitle', budget.balanceAgeDays)}>
            {t('projection.staleText')}
          </Alert>
        )}
      </Card>

      <Card labelledBy="table-title">
        <h2 id="table-title" className="card__title">
          {t('projection.tableTitle')}
        </h2>
        <Explain summary={t('projection.tableToggle')}>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">{t('projection.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('fields.date')}</th>
                  <th scope="col">{t('projection.colEvents')}</th>
                  <th scope="col" className="num">
                    {t('projection.colBalance')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{fmt.date(today, { compact: true, today })}</td>
                  <td>{t('projection.realStart')}</td>
                  <td className="num">{fmt.money(projection.startMinor)}</td>
                </tr>
                {eventDays.map((d) => (
                  <tr key={d.date} className={d.endMinor < 0 ? 'is-negative' : undefined}>
                    <td>{fmt.date(d.date, { compact: true, today, weekday: true })}</td>
                    <td>
                      {d.events.length === 0
                        ? '—'
                        : d.events.map((e) => `${planItemName(e, t)} ${fmt.money(e.budgetEffectMinor, { sign: true })}`).join(' · ')}
                    </td>
                    <td className="num">
                      {d.endMinor < 0 && <span className="neg-flag">⚠ {t('projection.negative')} </span>}
                      {fmt.money(d.endMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">{t('projection.tableNote')}</p>
        </Explain>
      </Card>
    </div>
  )
}
