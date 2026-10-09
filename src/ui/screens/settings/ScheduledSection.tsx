/** Ajustes › Programados (§7.7): lista con próxima fecha, frecuencia e importe; pausar; próximos 30 días. */
import { useMemo } from 'react'
import { addDays } from '../../../domain/dates'
import { nextOccurrenceOnOrAfter } from '../../../domain/recurrence'
import { setSchedulePaused } from '../../../domain/scheduledJobs'
import { openItemsUntil } from '../../../domain/planItems'
import { useT } from '../../../i18n'
import { useRun, useToday } from '../../../state/hooks'
import { useData } from '../../../state/store'
import { Toggle } from '../../components/base'
import { Badge, Card, EmptyState } from '../../components/common'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import { useFormat } from '../../format'
import { frequencyLabel } from '../../labels'
import { href } from '../../router'

export function ScheduledSection() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const next30 = useMemo(() => openItemsUntil(data, today, addDays(today, 30)).filter((i) => i.source === 'schedule').length, [data, today])

  const togglePause = async (id: string, paused: boolean) => {
    const { saved } = await run((d, c) => setSchedulePaused(d, id, paused, c))
    toast({ message: saved ? t(paused ? 'scheduled.pausedToast' : 'scheduled.resumedToast') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  return (
    <Card labelledBy="scheduled-title">
      <h2 id="programados" className="card__title">
        <span id="scheduled-title">{t('scheduled.title')}</span>
      </h2>
      <p className="note">{t('scheduled.intro')}</p>
      {data.schedules.length === 0 ? (
        <EmptyState compact icon="calendar" title={t('calendar.noSchedules')} />
      ) : (
        <ul className="item-list" data-testid="scheduled-list">
          {data.schedules.map((s) => {
            const next = s.paused ? null : nextOccurrenceOnOrAfter(s, today)
            return (
              <li key={s.id} className="item item--stacked">
                <div className="item__row">
                  <span className="item__main">
                    <a className="item__title" href={href(`/plan/programado/editar/${s.id}`)}>
                      {s.name}
                    </a>
                    <span className="item__meta">
                      {frequencyLabel(t, s.frequency)} · {s.paused ? t('plans.paused') : next ? t('calendar.nextOn', { date: fmt.date(next, { compact: true, today }) }) : t('calendar.noNext')}
                    </span>
                    {s.autoConfirm && (
                      <span className="item__badges">
                        <Badge icon="check">{t('calendar.autoBadge')}</Badge>
                      </span>
                    )}
                  </span>
                  <span className="item__amount">
                    {s.amountIsEstimate ? '≈ ' : ''}
                    {fmt.money(s.amountMinor)}
                  </span>
                </div>
                <Toggle checked={!!s.paused} onChange={(v) => void togglePause(s.id, v)} label={t('scheduled.pause', { name: s.name })} />
              </li>
            )
          })}
        </ul>
      )}
      <div className="button-row">
        <a className="btn btn--secondary" href={href('/plan/programado/nuevo')}>
          <Icon name="plus" size={16} />
          {t('scheduled.new')}
        </a>
        <a className="btn btn--ghost" href={href('/plan/calendario')}>
          <Icon name="calendar" size={16} />
          {tn('scheduled.next30', next30)}
        </a>
      </div>
    </Card>
  )
}
