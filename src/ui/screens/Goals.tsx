import { useMemo, useState } from 'react'
import { computeBudget, scheduledIncomeItems } from '../../domain/budget'
import { addDays } from '../../domain/dates'
import { goalPlan, goalProgress } from '../../domain/goals'
import { newId } from '../../domain/ids'
import { deleteGoal, restoreGoal, saveGoal } from '../../domain/operations'
import type { Goal, GoalFunding } from '../../domain/types'
import { LIMITS, type Issue } from '../../domain/validation'
import { useT } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, Badge, Card, EmptyState, Meter, PageHeader } from '../components/common'
import { MoneyField, Segmented, TextField } from '../components/fields'
import { parseMoneyText, moneyErrorMessage } from '../moneyText'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { AllocateDialog } from '../dialogs'
import { useFormat } from '../format'
import { fieldError, issueMessage, otherIssues } from '../labels'
import { href, navigate, type Route } from '../router'
import { PlannedExpenseCard, PlannedExpenseForm } from './PlannedExpenses'

export function Goals() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const budget = useMemo(() => computeBudget(data, today), [data, today])
  const incomeDates = useMemo(() => scheduledIncomeItems(data, today, addDays(today, 3 * 365)).filter((i) => i.state === 'pending').map((i) => i.date), [data, today])
  const [dialog, setDialog] = useState<{ goal: Goal; mode: 'add' | 'release' } | null>(null)
  const free = Math.max(0, budget.availableMinor)
  const goals = data.goals.filter((g) => g.kind !== 'expense')
  const planned = data.goals.filter((g) => g.kind === 'expense' && g.plan)

  return (
    <div className="stack">
      <div className="button-row">
        <a className="btn btn--primary" href={href('/plan/metas/nueva')}>
          <Icon name="plus" />
          {t('goals.new')}
        </a>
      </div>
      <Alert tone="info" icon="info" title={t('goals.virtualTitle')}>
        {t('goals.virtualNote')}
      </Alert>
      <Card>
        <p className="stat__label">{t('goals.freeLabel')}</p>
        <p className="stat__value" data-testid="free-to-allocate">
          {fmt.money(free)}
        </p>
        <p className="note">{t('goals.freeHint')}</p>
      </Card>

      <section className="stack-sm" aria-labelledby="planned-title">
        <div className="page-header__row">
          <h2 id="planned-title" className="section-title">
            {t('planned.title')}
          </h2>
          <a className="btn btn--secondary btn--small" href={href('/plan/metas/nueva?tipo=gasto')}>
            <Icon name="plus" size={16} />
            {t('planned.new')}
          </a>
        </div>
        {planned.length === 0 ? (
          <p className="note">{t('planned.empty')}</p>
        ) : (
          <ul className="goal-list">
            {planned.map((g) => (
              <li key={g.id}>
                <PlannedExpenseCard goal={g} onAllocate={(mode) => setDialog({ goal: g, mode })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="section-title">{t('planned.otherGoals')}</h2>
      {goals.length === 0 ? (
        <EmptyState icon="target" title={t('goals.empty')} action={<a className="btn btn--primary" href={href('/plan/metas/nueva')}>{t('goals.new')}</a>}>
          <p>{t('goals.emptyText')}</p>
        </EmptyState>
      ) : (
        <ul className="goal-list">
          {goals.map((g) => {
            const p = goalProgress(g)
            const plan = goalPlan(g, today, incomeDates)
            const valueText = t('goals.progressText', { saved: fmt.money(p.savedMinor), target: fmt.money(p.targetMinor), pct: fmt.percent(p.fraction) })
            return (
              <li key={g.id}>
                <Card as="article" className="goal" labelledBy={`goal-${g.id}`}>
                  <div className="goal__head">
                    <h3 className="card__title" id={`goal-${g.id}`}>
                      {g.name}
                    </h3>
                    <a className="btn btn--ghost btn--small" href={href(`/plan/metas/editar/${g.id}`)}>
                      <Icon name="edit" size={16} />
                      {t('common.edit')}
                      <span className="sr-only">: {g.name}</span>
                    </a>
                  </div>
                  <p className="item__badges">
                    {g.kind === 'emergency' && <Badge icon="lock">{t('goals.kindEmergency')}</Badge>}
                    <Badge tone={g.fundedFrom === 'budget' ? 'info' : 'neutral'}>{t(g.fundedFrom === 'budget' ? 'goals.fundedBudgetShort' : 'goals.fundedExternalShort')}</Badge>
                    {p.complete && (
                      <Badge tone="good" icon="check">
                        {t('goals.complete')}
                      </Badge>
                    )}
                  </p>
                  <Meter fraction={p.fraction} label={g.name} valueText={valueText} />
                  <p className="goal__progress">{valueText}</p>
                  {!p.complete && <p className="item__meta">{t('goals.remaining', { amount: fmt.money(p.remainingMinor) })}</p>}
                  <div className="goal__plan">
                    {plan.status === 'ok' && (
                      <>
                        <p>
                          {t('goals.byDate', { date: fmt.date(g.targetDate!) })} · {tn('goals.weeksLeft', plan.weeksLeft ?? 0)}
                        </p>
                        <ul className="bullets">
                          <li>{t('goals.perWeek', { amount: fmt.money(plan.perWeekMinor ?? 0) })}</li>
                          <li>{t('goals.perMonth', { amount: fmt.money(plan.perMonthMinor ?? 0) })}</li>
                          {plan.perIncomeMinor !== null && <li>{tn('goals.perIncome', plan.incomeCount, { amount: fmt.money(plan.perIncomeMinor) })}</li>}
                        </ul>
                        <p className="note">{t('goals.roundingNote')}</p>
                      </>
                    )}
                    {plan.status === 'noDate' && <p className="note">{t('goals.noDate')}</p>}
                    {plan.status === 'dueTodayOrPast' && (
                      <Alert tone="warning" title={t('goals.pastDue', { date: fmt.date(g.targetDate!) })}>
                        {t('goals.pastDueText', { amount: fmt.money(plan.remainingMinor) })}
                      </Alert>
                    )}
                  </div>
                  <div className="button-row">
                    {!p.complete && (
                      <button type="button" className="btn btn--primary btn--small" onClick={() => setDialog({ goal: g, mode: 'add' })}>
                        <Icon name="plus" size={16} />
                        {t('goals.add')}
                        <span className="sr-only">: {g.name}</span>
                      </button>
                    )}
                    {p.savedMinor > 0 && (
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => setDialog({ goal: g, mode: 'release' })}>
                        {t('goals.release')}
                        <span className="sr-only">: {g.name}</span>
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {dialog && <AllocateDialog key={`${dialog.goal.id}-${dialog.mode}`} goal={dialog.goal} mode={dialog.mode} onClose={() => setDialog(null)} />}
    </div>
  )
}

export function GoalForm({ route }: { route: Route }) {
  const data = useData()
  const editId = route.segments[2] === 'editar' ? route.segments[3] : undefined
  const existing = editId ? data.goals.find((g) => g.id === editId) : undefined
  if (existing?.kind === 'expense' || (!editId && route.query.get('tipo') === 'gasto')) return <PlannedExpenseForm existing={existing} />
  // Desde otra pantalla (p. ej. «Distribuir este ingreso») se vuelve a ella al guardar.
  const returnTo = route.query.get('returnTo')?.startsWith('/') ? route.query.get('returnTo')! : '/plan/metas'
  return <RegularGoalForm existing={existing} editId={editId} returnTo={returnTo} />
}

function RegularGoalForm({ existing, editId, returnTo }: { existing: Goal | undefined; editId: string | undefined; returnTo: string }) {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  const [id] = useState(() => existing?.id ?? newId())
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<Goal['kind']>(existing?.kind ?? 'goal')
  const [targetText, setTargetText] = useState(existing ? fmt.moneyInput(existing.targetMinor) : '')
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? '')
  const [fundedFrom, setFundedFrom] = useState<GoalFunding>(existing?.fundedFrom ?? 'budget')
  const [issues, setIssues] = useState<Issue[]>([])
  const [amountError, setAmountError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (editId && !existing) {
    return (
      <div className="stack">
        <PageHeader title={t('goalForm.notFound')} back={{ href: href(returnTo), label: returnTo === '/plan/metas' ? t('plan.goals') : t('common.back') }} />
      </div>
    )
  }

  const submit = async () => {
    const parsed = parseMoneyText(targetText, fmt)
    setAmountError(moneyErrorMessage(t, parsed))
    if (!parsed.ok || busy) return
    setBusy(true)
    const { result, saved } = await run((d, c) => saveGoal(d, { id, name, kind, targetMinor: parsed.minor, targetDate: targetDate || undefined, fundedFrom }, c))
    setBusy(false)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('goalForm.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    navigate(returnTo)
  }

  const remove = async () => {
    if (!existing) return
    const { result, saved } = await run((d, c) => deleteGoal(d, existing.id, c))
    if (!result.ok) return
    const removed = result.value
    toast({
      message: saved ? t('goalForm.deleted') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => restoreGoal(d, removed, c)) },
    })
    navigate(returnTo)
  }

  const unknown = otherIssues(issues, ['name', 'targetMinor', 'targetDate'])
  return (
    <div className="stack">
      <PageHeader title={existing ? t('goalForm.editTitle') : t('goalForm.newTitle')} back={{ href: href(returnTo), label: returnTo === '/plan/metas' ? t('plan.goals') : t('common.back') }} />
      <form
        className="form card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <TextField label={t('fields.name')} value={name} maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} placeholder={t('goalForm.namePlaceholder')} error={fieldError(t, fmt, issues, 'name')} required />
        <Segmented
          legend={t('goalForm.kind')}
          name="gkind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'goal', label: t('goalForm.kindGoal') },
            { value: 'emergency', label: t('goals.kindEmergency') },
          ]}
        />
        <MoneyField label={t('goalForm.target')} value={targetText} onChange={setTargetText} error={amountError ?? fieldError(t, fmt, issues, 'targetMinor')} fmt={fmt} />
        <TextField label={t('goalForm.targetDate')} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} hint={t('goalForm.targetDateHint')} error={fieldError(t, fmt, issues, 'targetDate')} />
        <Segmented
          legend={t('goalForm.funding')}
          name="funding"
          value={fundedFrom}
          onChange={setFundedFrom}
          options={[
            { value: 'budget', label: t('goals.fundedBudgetShort') },
            { value: 'external', label: t('goals.fundedExternalShort') },
          ]}
          hint={t(fundedFrom === 'budget' ? 'goalForm.fundingBudgetHint' : 'goalForm.fundingExternalHint')}
        />
        {existing && <p className="note">{t('goalForm.allocationsNote')}</p>}
        {unknown.length > 0 && (
          <Alert tone="critical" title={t('common.fixErrors')} role="alert">
            <ul>
              {unknown.map((i, idx) => (
                <li key={idx}>{issueMessage(t, fmt, i)}</li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="form__actions">
          <button type="submit" className="btn btn--primary btn--large" disabled={busy}>
            <Icon name="check" />
            {busy ? t('common.saving') : t('common.save')}
          </button>
          <a className="btn btn--secondary btn--large" href={href('/plan/metas')}>
            {t('common.cancel')}
          </a>
          {existing && (
            <button type="button" className="btn btn--danger-ghost" onClick={() => void remove()}>
              <Icon name="trash" />
              {t('common.delete')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
