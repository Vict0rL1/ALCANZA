import { useMemo, useRef, useState } from 'react'
import { categoriesForKind } from '../../domain/categories'
import { isValidLocalDate } from '../../domain/dates'
import { newId } from '../../domain/ids'
import { sumMinor } from '../../domain/money'
import { saveTransaction } from '../../domain/operations'
import type { TxKind, TxStatus } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { LIMITS } from '../../domain/validation'
import { useT, type MessageKey } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, EmptyState, PageHeader } from '../components/common'
import { MoneyField, Segmented, SelectField, TextField, FieldShell } from '../components/fields'
import { parseMoneyText, moneyErrorMessage } from '../moneyText'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { BalanceInclusionControl } from '../dialogs'
import { useDeleteTransaction } from '../useDeleteTransaction'
import { useFormat } from '../format'
import { categoryLabel, fieldError, issueMessage, otherIssues, transactionTitle, withCurrent } from '../labels'
import { href, navigate, type Route } from '../router'

const FIELD_PATHS = ['amountMinor', 'date', 'accountId', 'toAccountId', 'categoryId', 'refundOfId', 'note']

export function MovementForm({ route }: { route: Route }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const deleteTx = useDeleteTransaction()

  const editId = route.segments[0] === 'movimientos' && route.segments[1] === 'editar' ? route.segments[2] : undefined
  const existing = editId ? data.transactions.find((tx) => tx.id === editId) : undefined
  const q = route.query
  const returnTo = q.get('returnTo') || '/movimientos'

  const defaultAccount = data.accounts.find((a) => a.includeInBudget) ?? data.accounts[0]!
  const initialKind = (existing?.kind ?? (q.get('kind') as TxKind | null) ?? 'expense') as TxKind
  const prefillAmount = q.get('amount')
  const [id] = useState(() => existing?.id ?? newId())
  const [kind, setKind] = useState<TxKind>(initialKind)
  const [status, setStatus] = useState<TxStatus>(existing?.status ?? 'realized')
  const [amountText, setAmountText] = useState(() =>
    existing ? fmt.moneyInput(existing.amountMinor) : prefillAmount && /^\d+$/.test(prefillAmount) ? fmt.moneyInput(Number(prefillAmount)) : '',
  )
  const [date, setDate] = useState(existing?.date ?? (q.get('date') && isValidLocalDate(q.get('date')) ? q.get('date')! : today))
  const [accountId, setAccountId] = useState(existing?.accountId ?? defaultAccount.id)
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? data.accounts.find((a) => a.id !== accountId)?.id ?? '')
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? q.get('category') ?? (initialKind === 'income' ? 'salary' : 'other_expense'))
  const [refundOfId, setRefundOfId] = useState(existing?.refundOfId ?? '')
  const [note, setNote] = useState(existing?.note ?? q.get('note') ?? '')
  const [alreadyInBalance, setAlreadyInBalance] = useState(() => {
    if (!existing || existing.status !== 'realized') return false
    const acc = data.accounts.find((a) => a.id === existing.accountId)
    return !!acc && existing.date === acc.anchor.date && (existing.realizedAt ?? existing.createdAt) <= acc.anchor.setAt
  })
  const [issues, setIssues] = useState<Issue[]>([])
  const [amountError, setAmountError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  const changeKind = (k: TxKind) => {
    setKind(k)
    const valid = categoriesForKind(k, data.categories)
    if (k !== 'transfer' && !valid.includes(categoryId)) setCategoryId(k === 'income' ? 'salary' : 'other_expense')
    if (k === 'transfer' && toAccountId === accountId) setToAccountId(data.accounts.find((a) => a.id !== accountId)?.id ?? '')
  }

  const refundCandidates = useMemo(() => {
    return data.transactions
      .filter((tx) => tx.kind === 'expense' && tx.status === 'realized' && tx.id !== id)
      .map((tx) => {
        const refunded = sumMinor(data.transactions.filter((r) => r.kind === 'refund' && r.refundOfId === tx.id && r.id !== id).map((r) => r.amountMinor))
        return { tx, remaining: tx.amountMinor - refunded }
      })
      .filter((c) => c.remaining > 0 || c.tx.id === refundOfId)
      .sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1))
      .slice(0, 50)
  }, [data.transactions, id, refundOfId])

  if (editId && !existing) {
    return (
      <div className="stack">
        <PageHeader title={t('movementForm.notFound')} back={{ href: href('/movimientos'), label: t('nav.movements') }} />
        <EmptyState icon="search" title={t('movementForm.notFoundText')} />
      </div>
    )
  }

  const submit = async () => {
    const parsed = parseMoneyText(amountText, fmt)
    setAmountError(moneyErrorMessage(t, parsed))
    // Evita un segundo envío por doble clic antes de que React vuelva a pintar.
    if (!parsed.ok || submitting.current) return
    submitting.current = true
    setBusy(true)
    const { result, saved } = await run((d, c) =>
      saveTransaction(
        d,
        {
          id,
          kind,
          status,
          amountMinor: parsed.minor,
          date,
          accountId,
          ...(kind === 'transfer' ? { toAccountId } : { categoryId }),
          ...(kind === 'refund' && refundOfId ? { refundOfId } : {}),
          note,
          ...(existing?.scheduleId ? { scheduleId: existing.scheduleId, occurrenceDate: existing.occurrenceDate } : {}),
          alreadyInBalance,
        },
        c,
      ),
    )
    setBusy(false)
    if (!result.ok) {
      submitting.current = false
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t(existing ? 'movementForm.updated' : 'movementForm.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    navigate(returnTo)
  }

  const accountOptions = data.accounts.map((a) => ({ value: a.id, label: a.name }))
  const schedule = existing?.scheduleId ? data.schedules.find((s) => s.id === existing.scheduleId) : undefined
  const unknownIssues = otherIssues(issues, FIELD_PATHS)

  return (
    <div className="stack">
      <PageHeader title={existing ? t('movementForm.editTitle') : t('movementForm.newTitle')} back={{ href: href(returnTo), label: t('common.back') }} />

      <form
        className="form card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Segmented
          legend={t('fields.kind')}
          name="kind"
          value={kind}
          onChange={changeKind}
          options={(['expense', 'income', 'transfer', 'refund'] as const).map((k) => ({ value: k, label: t(`txKind.${k}` as MessageKey) }))}
          hint={t(`movementForm.kindHint.${kind}` as MessageKey)}
        />

        <MoneyField
          label={t('fields.amount')}
          value={amountText}
          onChange={setAmountText}
          error={amountError ?? fieldError(t, fmt, issues, 'amountMinor')}
          fmt={fmt}
          big
          autoFocus={!existing}
          name="amount"
        />

        <Segmented
          legend={t('fields.status')}
          name="status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'realized', label: t('status.realized') },
            { value: 'planned', label: t('status.planned') },
          ]}
          hint={t(status === 'planned' ? 'movementForm.plannedHint' : 'movementForm.realizedHint')}
        />

        <TextField
          label={t('fields.date')}
          type="date"
          value={date}
          max={status === 'realized' ? today : undefined}
          onChange={(e) => setDate(e.target.value)}
          error={fieldError(t, fmt, issues, 'date')}
          required
        />

        <SelectField
          label={kind === 'transfer' ? t('fields.fromAccount') : t('fields.account')}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accountOptions}
          error={fieldError(t, fmt, issues, 'accountId')}
        />

        {kind === 'transfer' &&
          (data.accounts.length < 2 ? (
            <Alert tone="info" title={t('movementForm.needTwoAccounts')}>
              <a href={href('/ajustes?seccion=cuentas')}>{t('movementForm.addAccountLink')}</a>
            </Alert>
          ) : (
            <SelectField
              label={t('fields.toAccount')}
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              options={accountOptions}
              error={fieldError(t, fmt, issues, 'toAccountId')}
              hint={t('movementForm.transferHint')}
            />
          ))}

        {kind !== 'transfer' && (
          <SelectField
            label={t('fields.category')}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={withCurrent(categoriesForKind(kind, data.categories), existing?.categoryId).map((c) => ({ value: c, label: categoryLabel(t, c) }))}
            error={fieldError(t, fmt, issues, 'categoryId')}
            hint={kind === 'refund' ? t('movementForm.refundCategoryHint') : undefined}
          />
        )}

        {kind === 'refund' && (
          <SelectField
            label={t('movementForm.refundOf')}
            value={refundOfId}
            onChange={(e) => {
              setRefundOfId(e.target.value)
              const original = data.transactions.find((tx) => tx.id === e.target.value)
              if (original?.categoryId) setCategoryId(original.categoryId)
            }}
            options={[
              { value: '', label: t('movementForm.refundOfNone') },
              ...refundCandidates.map((c) => ({
                value: c.tx.id,
                label: t('movementForm.refundOption', {
                  title: transactionTitle(c.tx, data.accounts, t),
                  date: fmt.date(c.tx.date, { compact: true, today }),
                  remaining: fmt.money(c.remaining),
                }),
              })),
            ]}
            error={fieldError(t, fmt, issues, 'refundOfId')}
            hint={t('movementForm.refundOfHint')}
          />
        )}

        <FieldShell label={t('fields.noteOptional')} error={fieldError(t, fmt, issues, 'note')} hint={t('movementForm.noteHint', { max: LIMITS.noteMax })}>
          {({ inputId, describedBy, invalid }) => (
            <textarea
              id={inputId}
              className="input textarea"
              value={note}
              maxLength={LIMITS.noteMax}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </FieldShell>

        {status === 'realized' && <BalanceInclusionControl accountId={accountId} date={date} checked={alreadyInBalance} onChange={setAlreadyInBalance} />}

        {schedule && existing?.occurrenceDate && (
          <Alert tone="info" icon="calendar" title={t('movementForm.linkedTitle', { name: schedule.name, date: fmt.date(existing.occurrenceDate) })}>
            {t('movementForm.linkedText')}
          </Alert>
        )}

        {kind === 'expense' && data.accounts.find((a) => a.id === accountId)?.kind === 'credit' && (
          <p className="note">{t('movementForm.cardPurchaseHint')}</p>
        )}
        {kind === 'transfer' && data.accounts.find((a) => a.id === toAccountId)?.kind === 'credit' && (
          <Alert tone="info" icon="info" title={t('movementForm.cardPaymentHint')} />
        )}
        {kind === 'expense' && (
          <Alert tone="neutral" icon="info" title={t('movementForm.cardTitle')}>
            {t('movementForm.cardText')}
          </Alert>
        )}

        {unknownIssues.length > 0 && (
          <Alert tone="critical" title={t('common.fixErrors')} role="alert">
            <ul>
              {unknownIssues.map((i, idx) => (
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
          <a className="btn btn--secondary btn--large" href={href(returnTo)}>
            {t('common.cancel')}
          </a>
          {existing && (
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={async () => {
                if (await deleteTx(existing.id)) navigate(returnTo)
              }}
            >
              <Icon name="trash" />
              {t('common.delete')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
