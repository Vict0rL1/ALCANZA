import { useMemo, useState } from 'react'
import { backupStatus, SNOOZE_OPTIONS } from '../../domain/backupReminder'
import { computeBudget, upcomingItems } from '../../domain/budget'
import { verificationSummary } from '../../domain/reconcile'
import { useExportBackup, useSnoozeBackup } from '../backupActions'
import { FavoriteChips } from '../favoritesUi'
import { cardPaymentReminders } from '../../domain/cards'
import { endOfMonth, localDateInTimeZone, startOfMonth } from '../../domain/dates'
import { limitStatuses, periodSummary } from '../../domain/insights'
import { goalProgress } from '../../domain/goals'
import { reminders, type PlanItem } from '../../domain/planItems'
import { setOccurrenceSkipped, updateSettings } from '../../domain/operations'
import { weeklyReview, weekStartOf } from '../../domain/weeklyReview'
import { inboxView } from '../../domain/inbox'
import { useT } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { CompositionBar } from '../components/charts'
import { Alert, Badge, CalcRow, Card, EmptyState, Explain, Meter, PageHeader, StatTile } from '../components/common'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { HorizonPicker, MarkPaidDialog, UpdateBalanceDialog } from '../dialogs'
import { relativeDayKey, useFormat } from '../format'
import { categoryLabel, planItemName } from '../labels'
import { href } from '../router'

export function Home() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const budget = useMemo(() => computeBudget(data, today), [data, today])
  const upcoming = useMemo(() => upcomingItems(data, today, 14).slice(0, 6), [data, today])
  const reminderItems = useMemo(() => reminders(data, today), [data, today])
  const cardReminders = useMemo(() => cardPaymentReminders(data, today), [data, today])
  const overLimits = useMemo(
    () => limitStatuses(periodSummary(data, startOfMonth(today), endOfMonth(today)), data.categoryLimits).filter((l) => l.over),
    [data, today],
  )
  const [payItem, setPayItem] = useState<PlanItem | null>(null)
  const [balanceOpen, setBalanceOpen] = useState(false)
  const backup = useMemo(() => backupStatus(data, today), [data, today])
  const verification = useMemo(() => verificationSummary(data, today), [data, today])
  const exportBackup = useExportBackup()
  const snooze = useSnoozeBackup()

  const rel = (date: string) => {
    const r = relativeDayKey(date, today)
    return r.key === 'inDays' || r.key === 'daysAgo' ? tn(`relative.${r.key}`, r.days) : t(`relative.${r.key}`)
  }

  const skip = async (item: PlanItem) => {
    const { saved } = await run((d, c) => setOccurrenceSkipped(d, item.sourceId, item.date, true, c))
    toast({
      message: saved ? t('calendar.skipped', { name: planItemName(item, t) }) : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => setOccurrenceSkipped(d, item.sourceId, item.date, false, c)) },
    })
  }

  const horizonText = budget.horizon
    ? budget.horizon.source === 'income'
      ? t('home.untilIncome', { date: fmt.date(budget.horizon.endDate, { weekday: true }) })
      : t('home.untilHorizon', { date: fmt.date(budget.horizon.endDate, { weekday: true }) })
    : t('home.noHorizonTitle')

  const goalsForHome = data.goals.filter((g) => !g.plan?.paidAt).slice(0, 3)
  const showWeekly = data.settings.weeklyReview !== false
  const week = useMemo(() => (showWeekly ? weeklyReview(data, weekStartOf(today), today) : null), [data, today, showWeekly])
  const hideWeekly = async () => {
    const { saved } = await run((d, c) => updateSettings(d, { weeklyReview: false }, c))
    toast({
      message: saved ? t('weekly.hidden') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => updateSettings(d, { weeklyReview: true }, c)) },
    })
  }
  const otherReminders = reminderItems.filter((i) => i.state !== 'overdue')
  const pendingCount = useMemo(() => inboxView(data, today).active.length, [data, today])

  // Avisos que no cambian la cifra principal: se agrupan debajo de ella para no saturar
  // la pantalla (el primero visible; el resto, plegado). Orden: pagos vencidos, copia de
  // seguridad (sin servidor, es la única protección contra perder datos), saldo antiguo,
  // límites y metas.
  const notices = [
    budget.overdueBills.length > 0 && {
      key: 'overdueBills',
      node: (
        <Alert
          tone="warning"
          title={tn('home.alert.overdueBills', budget.overdueBills.length)}
          actions={
            <a className="btn btn--small btn--secondary" href={href('/plan/calendario')}>
              {t('home.alert.reviewCalendar')}
            </a>
          }
        >
          {t('home.alert.overdueBillsText')}
        </Alert>
      ),
    },
    (backup.due) && {
      key: 'backup',
      node: (
        <Alert
          tone="info"
          icon="shield"
          title={t('home.backup.title')}
          actions={
            <>
              <button type="button" className="btn btn--small btn--primary" onClick={() => void exportBackup()}>
                <Icon name="download" size={16} />
                {t('home.backup.export')}
              </button>
              <button type="button" className="btn btn--small btn--secondary" onClick={() => void snooze(SNOOZE_OPTIONS[1])}>
                {t('home.backup.snooze', { days: SNOOZE_OPTIONS[1] })}
              </button>
            </>
          }
        >
          {backup.neverExported ? t('home.backup.textNever') : t('home.backup.textOld', { date: fmt.date(localDateInTimeZone(new Date(backup.lastExportAt!), data.settings.timeZone)) })}
        </Alert>
      ),
    },
    (budget.isBalanceStale && budget.balanceAgeDays !== null) && {
      key: 'stale',
      node: (
        <Alert
          tone="warning"
          icon="clock"
          title={tn('home.alert.staleTitle', budget.balanceAgeDays)}
          actions={
            <button type="button" className="btn btn--small btn--primary" onClick={() => setBalanceOpen(true)}>
              {t('home.updateBalance')}
            </button>
          }
        >
          {t('home.alert.staleText')}
        </Alert>
      ),
    },
    (overLimits.length > 0) && {
      key: 'limits',
      node: (
        <Alert
          tone="warning"
          title={tn('home.alert.limitOverTitle', overLimits.length)}
          actions={
            <a className="btn btn--small btn--secondary" href={href('/movimientos')}>
              {t('home.alert.seeSummary')}
            </a>
          }
        >
          {t('home.alert.limitOverText', {
            list: overLimits.map((l) => `${categoryLabel(t, l.categoryId)} (${t('limits.over', { amount: fmt.money(-l.remainingMinor) })})`).join(' · '),
          })}
        </Alert>
      ),
    },
    (budget.goalsExceedMoney) && {
      key: 'goals',
      node: (
        <Alert tone="warning" title={t('home.alert.goalsExceedTitle')}>
          {t('home.alert.goalsExceedText')}
        </Alert>
      ),
    },
  ].filter((n): n is { key: string; node: React.JSX.Element } => !!n)

  return (
    <div className="stack">
      <PageHeader title={t('home.title')} />

      <div className="home-grid">
        <div className="stack">
          {/* Cifra principal */}
          <Card className="hero" labelledBy="hero-label">
            <p className="hero__label" id="hero-label">
              {budget.status === 'ok' ? t('home.availableLabel') : t('home.balanceLabel')}
            </p>
            <p className="hero__value" data-testid="available">
              {fmt.money(budget.status === 'ok' ? budget.availableMinor : budget.spendableMinor)}
            </p>
            <p className="hero__sub">
              {horizonText}
              {budget.horizon && (
                <>
                  {' · '}
                  {tn('home.periodDays', budget.horizon.days)}
                </>
              )}
            </p>
            {budget.status === 'ok' && budget.availableMinor < 0 && (
              <Alert tone="critical" title={t('home.negativeTitle', { amount: fmt.money(-budget.availableMinor) })}>
                {t('home.negativeText')}
              </Alert>
            )}
            {budget.status === 'needsHorizon' && <HorizonPicker />}

            {budget.status === 'ok' && budget.dailyMinor !== null && budget.weeklyMinor !== null && (
              <div className="stats">
                <StatTile label={t('home.daily')} value={fmt.money(budget.dailyMinor)} hint={t('home.dailyHint')} />
                <StatTile
                  label={budget.weeklyDays === 7 ? t('home.weekly') : tn('home.weeklyShort', budget.weeklyDays ?? 0)}
                  value={fmt.money(budget.weeklyMinor)}
                  hint={t('home.weeklyHint')}
                />
              </div>
            )}

            <CompositionBar
              spendableMinor={budget.spendableMinor}
              reservedMinor={budget.reservedTotalMinor}
              goalsMinor={budget.goalsReservedMinor}
              availableMinor={budget.availableMinor}
              fmt={fmt}
            />

            <Explain>
              <div className="calc">
                <CalcRow label={t('explain.balance')} value={fmt.money(budget.spendableMinor)} />
                {budget.accountBalances.map((b) => (
                  <p className="calc__detail" key={b.account.id}>
                    {t('explain.accountLine', {
                      name: b.account.name,
                      anchor: fmt.money(b.anchorMinor),
                      when: fmt.timestamp(b.account.anchor.setAt),
                      applied: fmt.money(b.appliedTotalMinor, { sign: true }),
                      count: b.applied.length,
                      balance: fmt.money(b.balanceMinor),
                    })}
                  </p>
                ))}
                <CalcRow op="−" label={tn('explain.reserved', budget.reservedItems.length)} value={fmt.money(budget.reservedTotalMinor)} />
                {budget.reservedItems.map((i) => (
                  <p className="calc__detail" key={i.key}>
                    {planItemName(i, t)} · {fmt.date(i.date, { compact: true, today })}
                    {i.state === 'overdue' ? ` · ${t('state.overdue')}` : ''} · {fmt.money(-i.budgetEffectMinor)}
                    {budget.coveredByGoals.get(i.key) ? ` · ${t('explain.coveredByGoal', { amount: fmt.money(budget.coveredByGoals.get(i.key)!) })}` : ''}
                  </p>
                ))}
                <CalcRow op="−" label={t('explain.goals')} value={fmt.money(budget.goalsReservedMinor)} />
                {budget.goalReservations.map((g) => (
                  <p className="calc__detail" key={g.goal.id}>
                    {g.goal.name} · {fmt.money(g.amountMinor)}
                    {g.consumedMinor > 0 ? ` · ${t(g.goal.kind === 'expense' && g.goal.plan?.link ? 'explain.goalPaid' : 'explain.goalConsumed', { amount: fmt.money(g.consumedMinor) })}` : ''}
                  </p>
                ))}
                <CalcRow op="=" label={t('explain.available')} value={fmt.money(budget.availableMinor)} strong />
                {budget.horizon && budget.dailyMinor !== null && (
                  <>
                    <p className="calc__detail">
                      {t('explain.daily', {
                        available: fmt.money(Math.max(0, budget.availableMinor)),
                        days: budget.horizon.days,
                        daily: fmt.money(budget.dailyMinor),
                      })}
                    </p>
                    <p className="calc__detail">
                      {t(budget.horizon.source === 'income' ? 'explain.incomeDayExcluded' : 'explain.fallbackHorizon', {
                        date: fmt.date(budget.horizon.endDate),
                      })}
                    </p>
                  </>
                )}
                <p className="calc__detail">{t('explain.futureIncomeNotCounted')}</p>
                <ul className="bullets calc__glossary" aria-label={t('explain.glossary.title')}>
                  <li>{t('explain.glossary.balance')}</li>
                  <li>{t('explain.glossary.reserved')}</li>
                  <li>{t('explain.glossary.goals')}</li>
                  <li>{t('explain.glossary.card')}</li>
                </ul>
                <p className="calc__detail">
                  <a href={href('/ajustes?seccion=formulas')}>{t('explain.moreInfo')}</a>
                </p>
              </div>
            </Explain>

            <div className="button-row button-row--main">
              <a className="btn btn--primary btn--large" href={href('/movimientos/nuevo')}>
                <Icon name="plus" />
                {t('home.addMovement')}
              </a>
              <a className="btn btn--secondary btn--large" href={href('/alcanza')}>
                <Icon name="cart" />
                {t('home.canIAfford')}
              </a>
            </div>
            <FavoriteChips returnTo="/" limit={4} />
          </Card>
          {/* Ingresos sin confirmar: explican por qué no se suman a la cifra principal */}
          {budget.overdueIncomes.map((item) => (
            <Alert
              key={item.key}
              tone="warning"
              title={t('home.alert.lateIncomeTitle', { name: planItemName(item, t), date: fmt.date(item.date) })}
              actions={
                <>
                  <button type="button" className="btn btn--small btn--primary" onClick={() => setPayItem(item)}>
                    {t('home.alert.markReceived')}
                  </button>
                  {item.source === 'schedule' && (
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => void skip(item)}>
                      {t('home.alert.didNotArrive')}
                    </button>
                  )}
                  <a className="btn btn--small btn--ghost" href={href(`/plan/programado/editar/${item.sourceId}`)}>
                    {t('home.alert.changeDate')}
                  </a>
                </>
              }
            >
              {t('home.alert.lateIncomeText')}
            </Alert>
          ))}
          {budget.incomeDueToday.map((item) => (
            <Alert
              key={item.key}
              tone="info"
              title={t('home.alert.incomeTodayTitle', { name: planItemName(item, t) })}
              actions={
                <button type="button" className="btn btn--small btn--primary" onClick={() => setPayItem(item)}>
                  {t('home.alert.markReceived')}
                </button>
              }
            >
              {t('home.alert.incomeTodayText')}
            </Alert>
          ))}
          {notices[0]?.node}
          {notices.length > 1 && (
            <details className="explain" data-testid="more-notices">
              <summary>
                <Icon name="alert" size={16} />
                {tn('home.moreNotices', notices.length - 1)}
              </summary>
              <div className="explain__body stack-sm">
                {notices.slice(1).map((n) => (
                  <div key={n.key}>{n.node}</div>
                ))}
              </div>
            </details>
          )}
          {/* Acceso compacto a la bandeja de pendientes (sin llenar la pantalla de avisos) */}
          <a className="inbox-link" href={href('/pendientes')} data-testid="inbox-link">
            <Icon name={pendingCount > 0 ? 'alert' : 'checkCircle'} size={18} />
            <span>{pendingCount > 0 ? tn('inbox.homeCount', pendingCount) : t('inbox.homeNone')}</span>
            <Icon name="chevronRight" size={16} />
          </a>
          {/* Recordatorios dentro de la app */}
          {(otherReminders.length > 0 || cardReminders.length > 0) && (
            <Card labelledBy="reminders-title">
              <h2 id="reminders-title" className="card__title">
                <Icon name="clock" />
                {t('home.remindersTitle')}
              </h2>
              <ul className="item-list">
                {cardReminders.map(({ account, summary }) => (
                  <li key={`card-${account.id}`} className="item">
                    <div className="item__main">
                      <p className="item__title">{t('card.reminderTitle')}</p>
                      <p className="item__meta">
                        {t('card.reminderItem', {
                          name: account.name,
                          date: fmt.date(summary.nextDueDate!, { compact: true, today }),
                          debt: fmt.money(summary.debtMinor),
                          min: fmt.money(summary.minPaymentMinor),
                        })}
                      </p>
                    </div>
                  </li>
                ))}
                {otherReminders.map((i) => (
                  <li key={i.key} className="item">
                    <div className="item__main">
                      <p className="item__title">{planItemName(i, t)}</p>
                      <p className="item__meta">
                        {rel(i.date)} · {fmt.date(i.date, { compact: true, today })}
                      </p>
                    </div>
                    <p className="item__amount">{fmt.money(i.amountMinor)}</p>
                  </li>
                ))}
              </ul>
              <p className="note">{t('home.remindersNote')}</p>
            </Card>
          )}

          {/* Próximos pagos */}
          <Card labelledBy="upcoming-title">
            <h2 id="upcoming-title" className="card__title">
              <Icon name="calendar" />
              {t('home.upcomingTitle')}
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={t('home.upcomingEmpty')}
                action={
                  <a className="btn btn--secondary" href={href('/plan/programado/nuevo')}>
                    {t('calendar.new')}
                  </a>
                }
              />
            ) : (
              <ul className="item-list">
                {upcoming.map((i) => (
                  <li key={i.key} className="item">
                    <div className="item__main">
                      <p className="item__title">{planItemName(i, t)}</p>
                      <p className="item__meta">
                        {fmt.date(i.date, { compact: true, today, weekday: true })} · {rel(i.date)}
                        {i.state === 'overdue' && (
                          <>
                            {' '}
                            <Badge tone="warning" icon="alert">
                              {t('state.overdue')}
                            </Badge>
                          </>
                        )}
                        {i.isEstimate && (
                          <>
                            {' '}
                            <Badge>{t('state.estimate')}</Badge>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="item__side">
                      <p className="item__amount">
                        {i.budgetEffectMinor > 0 ? '+' : i.budgetEffectMinor < 0 ? '−' : ''}
                        {fmt.money(i.amountMinor)}
                      </p>
                      <button type="button" className="btn btn--small btn--secondary" onClick={() => setPayItem(i)}>
                        {i.direction === 'income' ? t('calendar.markReceived') : t('calendar.markPaid')}
                        <span className="sr-only">: {planItemName(i, t)}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <a className="link-more" href={href('/plan/calendario')}>
              {t('home.seeCalendar')}
              <Icon name="chevronRight" size={16} />
            </a>
          </Card>
        </div>

        <div className="stack">
          {/* Revisión semanal (se puede ocultar en Ajustes) */}
          {week && (
            <Card labelledBy="week-title">
              <h2 id="week-title" className="card__title">
                <Icon name="calendar" />
                {t('weekly.homeTitle')}
              </h2>
              <p data-testid="week-home">
                {t('weekly.homeSpent', { amount: fmt.money(week.current.spendingMinor), income: fmt.money(week.current.incomeMinor) })}
              </p>
              <p className="note">
                {week.current.coverage !== 'complete' || week.previous.coverage !== 'complete'
                  ? t('weekly.homeNoCompare')
                  : t('weekly.homeCompare', { amount: fmt.money(week.previous.spendingMinor) })}
              </p>
              <div className="button-row">
                <a className="btn btn--secondary btn--small" href={href('/revision')}>
                  {t('weekly.open')}
                </a>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => void hideWeekly()}>
                  {t('weekly.hide')}
                </button>
              </div>
            </Card>
          )}

          {/* Actualización de datos */}
          <Card className="freshness" labelledBy="freshness-title">
            <h2 id="freshness-title" className="card__title">
              <Icon name="clock" />
              {t('home.freshnessTitle')}
            </h2>
            {budget.balanceSetAt && (
              <p>
                {t('home.freshnessText', { when: fmt.timestamp(budget.balanceSetAt) })}{' '}
                {budget.balanceAgeDays !== null && <span className="muted">({tn('home.freshnessAge', budget.balanceAgeDays)})</span>}
              </p>
            )}
            <ul className="bullets" data-testid="verification">
              <li>
                {verification.lastMovementDate
                  ? t('home.verify.lastMovement', { date: fmt.date(verification.lastMovementDate, { compact: true, today }) })
                  : t('home.verify.noMovements')}
              </li>
              {verification.oldestVerifiedDate ? (
                <li>
                  {t('home.verify.verified', {
                    date: fmt.date(verification.oldestVerifiedDate, { compact: true, today }),
                    age: tn('home.freshnessAge', verification.daysSinceVerified ?? 0),
                  })}
                </li>
              ) : (
                <li>{tn('home.verify.unverified', verification.unverifiedAccounts.length)}</li>
              )}
              {verification.needsAttention.length > 0 && (
                <li>
                  <Badge tone="warning" icon="alert">
                    {tn('home.verify.attention', verification.needsAttention.length)}
                  </Badge>
                </li>
              )}
            </ul>
            <p className="note">{t('home.freshnessNote')}</p>
            <div className="button-row">
              <a className="btn btn--primary" href={href('/conciliar')}>
                <Icon name="scale" />
                {t('home.verify.action')}
              </a>
              <button type="button" className="btn btn--secondary" onClick={() => setBalanceOpen(true)}>
                {t('home.updateBalance')}
              </button>
            </div>
          </Card>

          {/* Metas */}
          <Card labelledBy="goals-title">
            <h2 id="goals-title" className="card__title">
              <Icon name="target" />
              {t('home.goalsTitle')}
            </h2>
            {goalsForHome.length === 0 ? (
              <EmptyState
                icon="target"
                title={t('goals.empty')}
                action={
                  <a className="btn btn--secondary" href={href('/plan/metas/nueva')}>
                    {t('goals.new')}
                  </a>
                }
              />
            ) : (
              <ul className="goal-mini-list">
                {goalsForHome.map((g) => {
                  const p = goalProgress(g)
                  const valueText = t('goals.progressText', { saved: fmt.money(p.savedMinor), target: fmt.money(p.targetMinor), pct: fmt.percent(p.fraction) })
                  return (
                    <li key={g.id}>
                      <div className="goal-mini__row">
                        <span className="goal-mini__name">{g.name}</span>
                        <span className="goal-mini__pct">{fmt.percent(p.fraction)}</span>
                      </div>
                      <Meter fraction={p.fraction} label={g.name} valueText={valueText} />
                      <p className="item__meta">{valueText}</p>
                    </li>
                  )
                })}
              </ul>
            )}
            <a className="link-more" href={href('/plan/metas')}>
              {t('home.seeGoals')}
              <Icon name="chevronRight" size={16} />
            </a>
          </Card>
        </div>
      </div>

      {payItem && <MarkPaidDialog key={payItem.key} item={payItem} onClose={() => setPayItem(null)} />}
      {balanceOpen && <UpdateBalanceDialog onClose={() => setBalanceOpen(false)} />}
    </div>
  )
}
