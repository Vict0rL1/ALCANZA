import { useMemo, useState } from 'react'
import { backupStatus, SNOOZE_OPTIONS } from '../../domain/backupReminder'
import { computeBudget, upcomingItems } from '../../domain/budget'
import { verificationSummary } from '../../domain/reconcile'
import { useExportBackup, useSnoozeBackup } from '../backupActions'
import { FavoriteChips } from '../favoritesUi'
import { cardPaymentReminders } from '../../domain/cards'
import { localDateInTimeZone } from '../../domain/dates'
import { planProgress } from '../../domain/plans'
import { goalProgress } from '../../domain/goals'
import { reminders, type PlanItem } from '../../domain/planItems'
import { setOccurrenceSkipped, updateSettings } from '../../domain/operations'
import { safeToSpend } from '../../domain/periods'
import { periodLabel } from '../periodLabel'
import { BottomSheet, CoachMark, FAB, ListRow } from '../components/base'
import { Segmented } from '../components/fields'
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
import { planItemName, planTitle } from '../labels'
import { href, withQuery } from '../router'
import { usePreferences, type HomeSection, type QuickAction } from '../preferences'
import type { IconName } from '../components/Icon'

export function Home() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const [prefs, setPrefs] = usePreferences()
  const essential = prefs.view === 'essential'
  const budget = useMemo(() => computeBudget(data, today), [data, today])
  const upcoming = useMemo(() => upcomingItems(data, today, 14).slice(0, 6), [data, today])
  const reminderItems = useMemo(() => reminders(data, today), [data, today])
  const cardReminders = useMemo(() => cardPaymentReminders(data, today), [data, today])
  const overLimits = useMemo(
    () => data.plans.filter((p) => p.status === 'active').map((p) => ({ plan: p, progress: planProgress(data, p, today) })).filter((x) => x.progress.state === 'over'),
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

  const horizonText = budget.period
    ? t(budget.period.daysLeft > 0 ? 'home.period.untilEnd' : 'home.period.ended', { label: periodLabel(t, fmt, budget.period), days: tn('home.periodDays', budget.period.daysLeft) })
    : budget.horizon
      ? budget.horizon.source === 'income'
        ? t('home.untilIncome', { date: fmt.date(budget.horizon.endDate, { weekday: true }) })
        : t('home.untilHorizon', { date: fmt.date(budget.horizon.endDate, { weekday: true }) })
      : t('home.noHorizonTitle')
  // Safe to spend (§6.3) sobre el periodo de calendario: base del periodo − comprometido hasta su fin.
  const safe = budget.period ? safeToSpend(budget.baseMinor, budget.reservedTotalMinor + budget.goalsReservedMinor, budget.period.daysLeft) : null
  const granularity = data.settings.safeToSpend?.granularity ?? 'day'
  const setGranularity = (g: 'day' | 'week' | 'period') => void run((d, c) => updateSettings(d, { safeToSpend: { ...d.settings.safeToSpend, granularity: g } }, c))
  const tourSeen = (data.settings.toursSeen ?? []).includes('home')
  const [tourStep, setTourStep] = useState(0)
  const [fabOpen, setFabOpen] = useState(false)
  const isEmpty = data.transactions.length === 0 && !data.isDemo
  const endTour = () => void run((d, c) => updateSettings(d, { toursSeen: [...(d.settings.toursSeen ?? []).filter((x) => x !== 'home'), 'home'] }, c))

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
            <a className="btn btn--small btn--secondary" href={href('/plan/planes')}>
              {t('home.alert.seePlans')}
            </a>
          }
        >
          {t('home.alert.limitOverText', {
            list: overLimits.map((x) => `${planTitle(t, x.plan)} (${t('plans.exceededBy', { amount: fmt.money(-x.progress.remainingMinor) })})`).join(' · '),
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

  const QUICK: Record<QuickAction, { href: string; icon: IconName; label: string }> = {
    afford: { href: '/alcanza', icon: 'cart', label: t('home.canIAfford') },
    income: { href: withQuery('/movimientos/nuevo', { kind: 'income', returnTo: '/' }), icon: 'arrowUp', label: t('quickAction.income') },
    transfer: { href: withQuery('/movimientos/nuevo', { kind: 'transfer', returnTo: '/' }), icon: 'transfer', label: t('quickAction.transfer') },
    whatChanged: { href: '/cambios', icon: 'clock', label: t('changes.title') },
    search: { href: '/buscar', icon: 'search', label: t('quickAction.search') },
    calendar: { href: '/plan/calendario', icon: 'calendar', label: t('quickAction.calendar') },
    reconcile: { href: '/conciliar', icon: 'scale', label: t('home.verify.action') },
    scenarios: { href: '/alcanza/escenarios', icon: 'trend', label: t('scenario.title') },
  }

  // Vista esencial: acceso a todo lo demás desde una sola tarjeta (nada queda inaccesible).
  const toolsCard = (
    <Card labelledBy="tools-title">
      <h2 id="tools-title" className="card__title">
        <Icon name="sliders" />
        {t('home.tools.title')}
      </h2>
      <ul className="tool-links">
        <li>
          <a href={href('/pendientes')}>{pendingCount > 0 ? tn('inbox.homeCount', pendingCount) : t('inbox.homeNone')}</a>
        </li>
        <li>
          <a href={href('/plan/calendario')}>{t('home.seeCalendar')}</a>
        </li>
        <li>
          <a href={href('/plan/metas')}>{t('home.seeGoals')}</a>
        </li>
        <li>
          <a href={href('/conciliar')}>{t('home.verify.action')}</a>
        </li>
        <li>
          <a href={href('/revision')}>{t('weekly.open')}</a>
        </li>
        <li>
          <a href={href('/alcanza/escenarios')}>{t('scenario.title')}</a>
        </li>
      </ul>
      <button type="button" className="btn btn--secondary" onClick={() => setPrefs((p) => ({ ...p, view: 'full' }))}>
        {t('home.tools.showFull')}
      </button>
    </Card>
  )

  const sectionNodes: Record<HomeSection, React.ReactNode> = {
    inbox: (
    <>
      {/* Acceso compacto a la bandeja de pendientes (sin llenar la pantalla de avisos) */}
      <a className="inbox-link" href={href('/pendientes')} data-testid="inbox-link">
        <Icon name={pendingCount > 0 ? 'alert' : 'checkCircle'} size={18} />
        <span>{pendingCount > 0 ? tn('inbox.homeCount', pendingCount) : t('inbox.homeNone')}</span>
        <Icon name="chevronRight" size={16} />
      </a>
    </>
  ),
    reminders: (
    <>
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
    </>
  ),
    upcoming: (
    <>
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
    </>
  ),
    weekly: (
    <>
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
    </>
  ),
    freshness: (
    <>
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
    </>
  ),
    goals: (
    <>
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
    </>
  ),
  }

  return (
    <div className="stack">
      <PageHeader title={t('home.title')}>
        <button type="button" className="btn btn--ghost" aria-pressed={prefs.privacy} onClick={() => setPrefs((p) => ({ ...p, privacy: !p.privacy }))} data-testid="privacy-toggle">
          <Icon name="lock" />
          {prefs.privacy ? t('privacy.show') : t('privacy.hide')}
        </button>
      </PageHeader>
      {prefs.privacy && (
        <p className="note note--icon" role="status">
          <Icon name="lock" size={16} /> {t('privacy.banner')}
        </p>
      )}

      {!tourSeen && !data.isDemo && tourStep < 3 && (
        <CoachMark
          step={tourStep + 1}
          total={3}
          title={t(`tour.home.${tourStep + 1}.title` as Parameters<typeof t>[0])}
          onNext={() => (tourStep === 2 ? endTour() : setTourStep(tourStep + 1))}
          onDismiss={endTour}
          nextLabel={tourStep === 2 ? t('tour.done') : t('tour.next')}
          dismissLabel={t('tour.skip')}
        >
          {t(`tour.home.${tourStep + 1}.text` as Parameters<typeof t>[0])}
        </CoachMark>
      )}
      <div className="home-grid">
        <div className="stack">
          {isEmpty && (
            <Card labelledBy="empty-title">
              <h2 id="empty-title" className="card__title">
                {t('home.empty.title')}
              </h2>
              <p>{t('home.empty.text')}</p>
              <p>
                <code className="assistant__example">{t('assistant.exampleText')}</code>
              </p>
              <div className="button-row">
                <a className="btn btn--primary" href={href(withQuery('/asistente', { texto: t('assistant.exampleText'), returnTo: '/' }))} data-testid="try-assistant">
                  <Icon name="sparkles" />
                  {t('home.empty.try')}
                </a>
                <a className="btn btn--secondary" href={href('/movimientos/nuevo')}>
                  <Icon name="plus" />
                  {t('home.addMovement')}
                </a>
              </div>
            </Card>
          )}
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
              {budget.horizon && !budget.period && (
                <>
                  {' · '}
                  {tn('home.periodDays', budget.horizon.days)}
                </>
              )}
            </p>
            {budget.status === 'ok' && budget.availableMinor < 0 && (
              <Alert tone="critical" title={t('home.negativeTitle', { amount: fmt.money(-budget.availableMinor) })}>
                {t('home.negativeText')}{' '}
                <a href={href('/alcanza/faltante')}>{t('shortfall.open')}</a>
              </Alert>
            )}
            {budget.status === 'needsHorizon' && <HorizonPicker />}

            {budget.status === 'ok' && safe && (
              <div className="safe" data-testid="safe-to-spend">
                <Segmented
                  legend={t('home.safe.granularity')}
                  name="safe-granularity"
                  value={granularity}
                  onChange={setGranularity}
                  options={[
                    { value: 'day', label: t('home.safe.day') },
                    { value: 'week', label: t('home.safe.week') },
                    { value: 'period', label: t('home.safe.period') },
                  ]}
                />
                <StatTile
                  label={granularity === 'day' ? t('home.daily') : granularity === 'week' ? t('home.weekly') : t('home.safe.period')}
                  value={fmt.money(granularity === 'day' ? safe.perDayMinor : granularity === 'week' ? safe.perWeekMinor : safe.perPeriodMinor)}
                  hint={t(granularity === 'day' ? 'home.safe.perDayHint' : granularity === 'week' ? 'home.safe.perWeekHint' : 'home.safe.perPeriodHint')}
                />
                <p className="note">{t('home.safe.committed', { amount: fmt.money(safe.committedMinor) })}</p>
              </div>
            )}
            {budget.status === 'ok' && !safe && budget.dailyMinor !== null && budget.weeklyMinor !== null && (
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
                {budget.periodBalance && (
                  <>
                    {budget.periodBalance.carryOver ? (
                      <CalcRow label={t('explain.period.carryOver')} value={fmt.money(budget.periodBalance.carryOverMinor)} />
                    ) : (
                      <p className="calc__detail">{t('explain.period.noCarry')}</p>
                    )}
                    <CalcRow op={budget.periodBalance.carryOver ? '+' : undefined} label={t('explain.period.income')} value={fmt.money(budget.periodBalance.incomeMinor)} />
                    <CalcRow op="−" label={t('explain.period.expenses')} value={fmt.money(budget.periodBalance.expensesMinor)} />
                    <CalcRow op="=" label={t('explain.period.base')} value={fmt.money(budget.baseMinor)} strong />
                  </>
                )}
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
                    {b.account.kind === 'credit' ? ` · ${t('explain.cardDebt')}` : ''}{' '}
                    <a href={href(`/conciliar?cuenta=${b.account.id}`)}>{t('explain.verify')}</a>
                  </p>
                ))}
                <CalcRow op="−" label={tn('explain.reserved', budget.reservedItems.length)} value={fmt.money(budget.reservedTotalMinor)} />
                {budget.reservedItems.map((i) => (
                  <p className="calc__detail" key={i.key}>
                    {planItemName(i, t)} · {fmt.date(i.date, { compact: true, today })}
                    {i.state === 'overdue' ? ` · ${t('state.overdue')}` : ''} · {fmt.money(-i.budgetEffectMinor)}
                    {i.isEstimate ? ` · ${t('explain.estimate')}` : ''}
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
                      {t(budget.horizon.source === 'period' ? 'explain.period.days' : budget.horizon.source === 'income' ? 'explain.incomeDayExcluded' : 'explain.fallbackHorizon', {
                        from: budget.period ? fmt.date(budget.period.start, { compact: true }) : '',
                        to: budget.period ? fmt.date(budget.period.end, { compact: true }) : '',
                        days: budget.period ? tn('home.periodDays', budget.period.daysLeft) : '',
                        date: fmt.date(budget.horizon.endDate),
                      })}
                    </p>
                  </>
                )}
                <p className="calc__detail">{t('explain.futureIncomeNotCounted')}</p>
                {budget.horizon?.source === 'income' && budget.horizon.income && (
                  <p className="calc__detail">
                    <Badge icon="calendar">{t('changes.kind.assumption')}</Badge> {t('explain.horizonAssumption', { name: planItemName(budget.horizon.income, t), date: fmt.date(budget.horizon.endDate) })}
                  </p>
                )}
                <h3 className="calc__subtitle">{t('explain.pendingTitle')}</h3>
                <ul className="bullets" data-testid="explain-pending">
                  {budget.overdueIncomes.map((i) => (
                    <li key={i.key}>{t('explain.pending.overdueIncome', { name: planItemName(i, t), date: fmt.date(i.date), amount: fmt.money(i.amountMinor) })}</li>
                  ))}
                  {budget.incomeDueToday.map((i) => (
                    <li key={i.key}>{t('explain.pending.incomeToday', { name: planItemName(i, t), amount: fmt.money(i.amountMinor) })}</li>
                  ))}
                  {budget.overdueBills.length > 0 && <li>{tn('explain.pending.overdueBills', budget.overdueBills.length)}</li>}
                  {budget.isBalanceStale && budget.balanceAgeDays !== null && <li>{tn('explain.pending.stale', budget.balanceAgeDays)}</li>}
                  {budget.overdueIncomes.length + budget.incomeDueToday.length + budget.overdueBills.length === 0 && !budget.isBalanceStale && <li>{t('explain.pending.none')}</li>}
                </ul>
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

            <p className="link-row">
              <a href={href('/cambios')} data-testid="what-changed-link">
                <Icon name="clock" size={16} /> {t('changes.link')}
              </a>
              <a href={href('/estadisticas')} data-testid="stats-link">
                <Icon name="chart" size={16} /> {t('stats.title')}
              </a>
            </p>

            <div className="button-row button-row--main">
              <a className="btn btn--primary btn--large" href={href('/movimientos/nuevo')}>
                <Icon name="plus" />
                {t('home.addMovement')}
              </a>
              {!essential &&
                prefs.quickActions.map((a) => (
                  <a key={a} className="btn btn--secondary btn--large" href={href(QUICK[a].href)}>
                    <Icon name={QUICK[a].icon} />
                    {QUICK[a].label}
                  </a>
                ))}
            </div>
            {!essential && <FavoriteChips returnTo="/" limit={4} />}
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
          {essential ? toolsCard : null}
        </div>

        {!essential && (
          <div className="stack" data-testid="home-sections">
            {prefs.sections
              .filter((x) => x.visible && !(x.id === 'weekly' && !week) && !(x.id === 'reminders' && otherReminders.length === 0 && cardReminders.length === 0))
              .map((x) => (
                <div key={x.id} className="home-section" data-section={x.id}>
                  {sectionNodes[x.id]}
                </div>
              ))}
          </div>
        )}
      </div>

      {payItem && <MarkPaidDialog key={payItem.key} item={payItem} onClose={() => setPayItem(null)} />}
      {balanceOpen && <UpdateBalanceDialog onClose={() => setBalanceOpen(false)} />}
      <FAB label={t('home.addMovement')} onClick={() => setFabOpen(true)} />
      <BottomSheet open={fabOpen} onClose={() => setFabOpen(false)} title={t('fab.title')}>
        <div data-testid="fab-sheet">
          <ListRow icon="arrowDown" color="red" title={t('fab.expense')} href={href(withQuery('/movimientos/nuevo', { kind: 'expense', returnTo: '/' }))} chevron />
          <ListRow icon="arrowUp" color="emerald" title={t('fab.income')} href={href(withQuery('/movimientos/nuevo', { kind: 'income', returnTo: '/' }))} chevron />
          <ListRow icon="transfer" color="blue" title={t('fab.transfer')} href={href(withQuery('/movimientos/nuevo', { kind: 'transfer', returnTo: '/' }))} chevron />
          <ListRow icon="sparkles" color="violet" title={t('fab.assistant')} subtitle={t('assistant.placeholder')} href={href(withQuery('/asistente', { returnTo: '/' }))} chevron />
          {data.favorites.length > 0 && (
            <>
              <p className="cat-group__title">{t('fab.common')}</p>
              <FavoriteChips returnTo="/" limit={6} />
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
