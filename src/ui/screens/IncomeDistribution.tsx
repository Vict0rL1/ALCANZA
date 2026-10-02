/**
 * Asistente «Distribuir este ingreso». Las reglas viven en `domain/incomeDistribution.ts`:
 * aquí se propone, se edita, se previsualiza y solo se aplica con confirmación explícita.
 */
import { useMemo, useState } from 'react'
import { newId } from '../../domain/ids'
import {
  activeDistributions,
  applyDistribution,
  distributionContext,
  distributionIncomeState,
  previewDistribution,
  proposeDistribution,
  undoDistribution,
  type DistributionLineInput,
  type DistributionPriority,
} from '../../domain/incomeDistribution'
import type { Issue } from '../../domain/validation'
import { useT } from '../../i18n'
import { makeContext, useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, Badge, CalcRow, Card, EmptyState, Explain, PageHeader } from '../components/common'
import { MoneyField, Segmented } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { issueMessage, planItemName, transactionTitle } from '../labels'
import { parseMoneyText } from '../moneyText'
import { href, withQuery, type Route } from '../router'

const lineKey = (l: Pick<DistributionLineInput, 'kind' | 'scheduleId' | 'occurrenceDate' | 'goalId'>) =>
  l.kind === 'payment' ? `p:${l.scheduleId}:${l.occurrenceDate}` : `g:${l.goalId}`

export function IncomeDistributionScreen({ route }: { route: Route }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const txId = route.segments[2]!
  const income = data.transactions.find((x) => x.id === txId)
  const context = useMemo(() => (income ? distributionContext(data, txId, today) : null), [data, txId, today, income])
  const [priority, setPriority] = useState<DistributionPriority>('paymentsFirst')
  const [distributionId, setDistributionId] = useState(newId)
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    if (!context) return {}
    return Object.fromEntries(proposeDistribution(context, 'paymentsFirst').map((l) => [lineKey(l), fmt.moneyInput(l.amountMinor)]))
  })
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)

  const back = withQuery(`/movimientos/editar/${txId}`, { returnTo: '/movimientos' })
  if (!income || income.kind !== 'income') {
    return (
      <div className="stack">
        <PageHeader title={t('distribution.title')} back={{ href: href('/movimientos'), label: t('nav.movements') }} />
        <EmptyState icon="search" title={t('distribution.notFound')} />
      </div>
    )
  }
  const history = data.incomeDistributions.filter((d) => d.incomeTxId === txId)
  const changed = activeDistributions(data, txId).some((d) => distributionIncomeState(data, d).status !== 'ok')

  const choosePriority = (p: DistributionPriority) => {
    setPriority(p)
    if (context) setAmounts(Object.fromEntries(proposeDistribution(context, p).map((l) => [lineKey(l), fmt.moneyInput(l.amountMinor)])))
    setIssues([])
  }

  // Líneas con importe válido > 0 (los campos vacíos cuentan 0).
  const parsedLines: DistributionLineInput[] = []
  let invalid = false
  if (context) {
    const candidates: DistributionLineInput[] = [
      ...context.payments.map((p) => ({ kind: 'payment' as const, amountMinor: 0, scheduleId: p.scheduleId, occurrenceDate: p.occurrenceDate })),
      ...context.goals.map((g) => ({ kind: 'goal' as const, amountMinor: 0, goalId: g.goal.id })),
    ]
    for (const c of candidates) {
      const text = amounts[lineKey(c)] ?? ''
      if (!text.trim()) continue
      const p = parseMoneyText(text, fmt, { allowZero: true })
      if (!p.ok) invalid = true
      else if (p.minor > 0) parsedLines.push({ ...c, amountMinor: p.minor })
    }
  }
  const assigned = parsedLines.reduce((s, l) => s + l.amountMinor, 0)
  const input = { distributionId, incomeTxId: txId, lines: parsedLines }
  const preview = context && parsedLines.length > 0 && !invalid ? previewDistribution(data, input, makeContext(data.settings.timeZone)) : null

  const apply = async () => {
    if (busy || parsedLines.length === 0 || invalid) return
    setBusy(true)
    const { result, saved } = await run((d, c) => applyDistribution(d, input, c))
    setBusy(false)
    if (!result.ok) return void setIssues(result.issues)
    setIssues([])
    toast({ message: saved ? t('distribution.applied', { amount: fmt.money(assigned) }) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    setDistributionId(newId())
    setAmounts({})
  }

  const undo = async (id: string) => {
    const { result, saved } = await run((d, c) => undoDistribution(d, id, c))
    if (!result.ok) return void toast({ message: issueMessage(t, fmt, result.issues[0]!), tone: 'critical' })
    toast({ message: saved ? t('distribution.undone') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  const goalName = (id: string) => data.goals.find((g) => g.id === id)?.name ?? t('distribution.deletedGoal')

  return (
    <div className="stack">
      <PageHeader title={t('distribution.title')} back={{ href: href(back), label: t('common.back') }} />
      <p className="lead">
        {transactionTitle(income, data.accounts, t)} · {fmt.date(income.date)} · <strong>{fmt.money(income.amountMinor)}</strong>
      </p>
      <Alert tone="info" icon="lock" title={t('distribution.virtualTitle')}>
        {t('distribution.virtualText')}
      </Alert>
      {income.status !== 'realized' && <Alert tone="warning" title={t('issue.incomeNotRealized')} role="alert" />}
      {changed && (
        <Alert tone="warning" title={t('distribution.changedTitle')} role="alert">
          {t('distribution.changedText')}
        </Alert>
      )}

      {context && income.status === 'realized' && (
        <>
          <Card labelledBy="dist-facts">
            <h2 id="dist-facts" className="card__title">
              {t('distribution.factsTitle')}
            </h2>
            <div className="calc">
              <CalcRow label={t('distribution.income')} value={fmt.money(context.incomeMinor)} />
              <CalcRow op="−" label={t('distribution.already')} value={fmt.money(context.alreadyMinor)} />
              <CalcRow op="=" label={t('distribution.remaining')} value={fmt.money(context.remainingMinor)} strong />
            </div>
            <p data-testid="dist-free">{t('distribution.free', { amount: fmt.money(context.freeMinor) })}</p>
            {context.freeMinor < context.remainingMinor && <p className="note">{t('distribution.partlySpent', { amount: fmt.money(context.freeMinor) })}</p>}
          </Card>

          {context.remainingMinor > 0 && (
            <form
              className="form card"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void apply()
              }}
            >
              <Segmented
                legend={t('distribution.priority')}
                name="priority"
                value={priority}
                onChange={choosePriority}
                options={[
                  { value: 'paymentsFirst', label: t('distribution.priority.paymentsFirst') },
                  { value: 'goalsFirst', label: t('distribution.priority.goalsFirst') },
                  { value: 'manual', label: t('distribution.priority.manual') },
                ]}
                hint={t('distribution.priorityHint')}
              />

              <fieldset className="stack-sm">
                <legend className="field__label">{t('distribution.payments')}</legend>
                {context.payments.length === 0 && <p className="note">{t('distribution.noPayments')}</p>}
                {context.payments.map((p) => {
                  const key = lineKey({ kind: 'payment', scheduleId: p.scheduleId, occurrenceDate: p.occurrenceDate })
                  return (
                    <div key={key} className="stack-sm">
                      <MoneyField
                        label={t('distribution.paymentLabel', { name: planItemName(p.item, t), date: fmt.date(p.occurrenceDate, { compact: true, today }) })}
                        value={amounts[key] ?? ''}
                        onChange={(v) => setAmounts((a) => ({ ...a, [key]: v }))}
                        fmt={fmt}
                        hint={t('distribution.paymentNeed', { need: fmt.money(p.needMinor), covered: fmt.money(p.coveredMinor) })}
                      />
                      {p.alreadyReserved && (
                        <p className="note note--icon">
                          <Icon name="info" size={16} /> {t('distribution.alreadyReserved')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </fieldset>

              <fieldset className="stack-sm">
                <legend className="field__label">{t('distribution.goals')}</legend>
                {context.goals.length === 0 && <p className="note">{t('distribution.noGoals')}</p>}
                {context.goals.map((g) => {
                  const key = lineKey({ kind: 'goal', goalId: g.goal.id })
                  return (
                    <MoneyField
                      key={key}
                      label={t('distribution.goalLabel', { name: g.goal.name })}
                      value={amounts[key] ?? ''}
                      onChange={(v) => setAmounts((a) => ({ ...a, [key]: v }))}
                      fmt={fmt}
                      hint={
                        g.perIncomeMinor !== null
                          ? t('distribution.goalNeedQuota', { need: fmt.money(g.needMinor), quota: fmt.money(g.perIncomeMinor) })
                          : t('distribution.goalNeed', { need: fmt.money(g.needMinor) })
                      }
                    />
                  )
                })}
              </fieldset>

              <div className="calc" aria-live="polite" data-testid="dist-summary">
                <CalcRow label={t('distribution.remaining')} value={fmt.money(context.remainingMinor)} />
                <CalcRow op="−" label={t('distribution.assigned')} value={fmt.money(assigned)} />
                <CalcRow op="=" label={t('distribution.leftFree')} value={fmt.money(context.remainingMinor - assigned)} strong />
              </div>
              {assigned > context.remainingMinor && <Alert tone="critical" title={t('issue.distributionExceeds')} role="alert" />}
              {invalid && <Alert tone="critical" title={t('distribution.invalidAmount')} role="alert" />}

              {preview && preview.ok && (
                <div className="stack-sm" data-testid="dist-preview">
                  <p className="field__label">{t('distribution.previewTitle')}</p>
                  <ul className="bullets">
                    <li>{t('distribution.previewAvailable', { before: fmt.money(preview.preview.before.availableMinor), after: fmt.money(preview.preview.after.availableMinor) })}</li>
                    <li>{t('distribution.previewReserved', { before: fmt.money(preview.preview.before.reservedMinor), after: fmt.money(preview.preview.after.reservedMinor) })}</li>
                    <li>{t('distribution.previewBalance', { amount: fmt.money(preview.preview.after.spendableMinor) })}</li>
                  </ul>
                </div>
              )}
              {preview && !preview.ok && (
                <Alert tone="critical" title={t('common.fixErrors')} role="alert">
                  <ul>
                    {preview.issues.map((i, idx) => (
                      <li key={idx}>{issueMessage(t, fmt, i)}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {issues.length > 0 && (
                <Alert tone="critical" title={t('common.fixErrors')} role="alert">
                  <ul>
                    {issues.map((i, idx) => (
                      <li key={idx}>{issueMessage(t, fmt, i)}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <Explain summary={t('distribution.rulesTitle')}>
                <ul className="bullets">
                  <li>{t('distribution.rule.noNewMoney')}</li>
                  <li>{t('distribution.rule.payments')}</li>
                  <li>{t('distribution.rule.goals')}</li>
                  <li>{t('distribution.rule.limit')}</li>
                  <li>{t('distribution.rule.partial')}</li>
                </ul>
              </Explain>
              <div className="form__actions">
                <button type="submit" className="btn btn--primary btn--large" disabled={busy || parsedLines.length === 0 || invalid || !preview?.ok}>
                  <Icon name="check" />
                  {t('distribution.apply')}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {history.length > 0 && (
        <Card labelledBy="dist-history">
          <h2 id="dist-history" className="card__title">
            {t('distribution.history')}
          </h2>
          <ul className="item-list">
            {[...history].reverse().map((d) => (
              <li key={d.id} className="item item--stacked">
                <span className="item__title">
                  {fmt.timestamp(d.createdAt)} · {fmt.money(d.lines.reduce((s, l) => s + l.amountMinor, 0))}
                </span>
                <ul className="bullets">
                  {d.lines.map((l) => (
                    <li key={l.allocationId}>
                      {t(l.kind === 'payment' ? 'distribution.linePayment' : 'distribution.lineGoal', { name: goalName(l.goalId), amount: fmt.money(l.amountMinor) })}
                    </li>
                  ))}
                </ul>
                {d.undoneAt ? (
                  <Badge icon="undo">{t('distribution.undoneAt', { when: fmt.timestamp(d.undoneAt) })}</Badge>
                ) : (
                  <button type="button" className="btn btn--secondary btn--small" onClick={() => void undo(d.id)}>
                    <Icon name="undo" size={16} />
                    {t('distribution.undo')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
