/** Ajustes › Safe to spend (§7.7): mostrar en Inicio, granularidad, qué se descuenta y explicación. */
import { useMemo } from 'react'
import { computeBudget } from '../../../domain/budget'
import { updateSettings } from '../../../domain/operations'
import { committedFor, safeToSpend } from '../../../domain/periods'
import type { SafeToSpendSettings } from '../../../domain/types'
import { useT } from '../../../i18n'
import { useRun, useToday } from '../../../state/hooks'
import { useData } from '../../../state/store'
import { Toggle } from '../../components/base'
import { Card, Explain } from '../../components/common'
import { Segmented } from '../../components/fields'
import { useToast } from '../../components/toastContext'
import { useFormat } from '../../format'

export function SafeToSpendSection() {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const settings = data.settings.safeToSpend
  const budget = useMemo(() => computeBudget(data, today), [data, today])
  const preview = budget.period ? safeToSpend(budget.baseMinor, committedFor(settings, budget.reservedTotalMinor, budget.goalsReservedMinor), budget.period.daysLeft) : null
  const set = async (patch: Partial<SafeToSpendSettings>) => {
    const { saved } = await run((d, c) => updateSettings(d, { safeToSpend: { ...d.settings.safeToSpend, ...patch } }, c))
    if (!saved) toast({ message: t('save.error.generic'), tone: 'critical' })
  }
  const amount = preview ? (settings.granularity === 'day' ? preview.perDayMinor : settings.granularity === 'week' ? preview.perWeekMinor : preview.perPeriodMinor) : null
  return (
    <Card labelledBy="safe-title">
      <h2 id="safe-to-spend" className="card__title">
        <span id="safe-title">{t('safe.title')}</span>
      </h2>
      <p className="note">{t('safe.intro')}</p>
      <Toggle checked={settings.showOnHome} onChange={(v) => void set({ showOnHome: v })} label={t('safe.showOnHome')} />
      <Segmented
        legend={t('safe.granularity')}
        name="safe-granularity"
        value={settings.granularity}
        onChange={(g) => void set({ granularity: g })}
        options={[
          { value: 'day', label: t('home.safe.day') },
          { value: 'week', label: t('home.safe.week') },
          { value: 'period', label: t('home.safe.period') },
        ]}
      />
      <Toggle checked={settings.subtractScheduled} onChange={(v) => void set({ subtractScheduled: v })} label={t('safe.subtractScheduled')} hint={t('safe.subtractScheduledHint')} />
      <Toggle checked={settings.subtractGoalContributions} onChange={(v) => void set({ subtractGoalContributions: v })} label={t('safe.subtractGoals')} hint={t('safe.subtractGoalsHint')} />
      <p className="stat__label">{t('safe.preview')}</p>
      <p className="stat__value" data-testid="safe-preview">
        {amount === null ? t('safe.noPeriod') : fmt.money(amount)}
      </p>
      <Explain summary={t('common.howCalculated')}>
        <p>{t('safe.explain')}</p>
      </Explain>
    </Card>
  )
}
