import { useMemo, useRef, useState } from 'react'
import { categoriesForKind } from '../../domain/categories'
import { addDays, isValidLocalDate } from '../../domain/dates'
import { favoritePrefill, type FavoritePrefill } from '../../domain/favorites'
import { newId } from '../../domain/ids'
import { sumMinor } from '../../domain/money'
import { markOccurrence, saveTransaction, type OpContext } from '../../domain/operations'
import { periodsProposedFor, setTransactionPeriods } from '../../domain/periodBudgets'
import { inferRefundSplit, refundableByCategory, suggestSplitFromHistory } from '../../domain/splits'
import { openItemsUntil } from '../../domain/planItems'
import { matchCategoryRule } from '../../domain/rules'
import type { AppData, CategoryRule, SplitLine, Transaction, TxKind, TxStatus } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { LIMITS } from '../../domain/validation'
import { useT, type MessageKey } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, Card, EmptyState, PageHeader } from '../components/common'
import { CheckboxField, MoneyField, Segmented, SelectField, TextField, FieldShell } from '../components/fields'
import { parseMoneyText, moneyErrorMessage } from '../moneyText'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { BalanceInclusionControl } from '../dialogs'
import { FavoriteChips, FavoriteDialog } from '../favoritesUi'
import { useDeleteTransaction } from '../useDeleteTransaction'
import { SplitEditor } from '../splitEditor'
import { draftsFromLines, newSplitDraft, parseDrafts, type SplitDraft } from '../splitDrafts'
import { useFormat } from '../format'
import { accountName, categoryLabel, fieldError, issueMessage, otherIssues, planItemName, transactionTitle, withCurrent } from '../labels'
import { href, navigate, withQuery, type Route, navigateIfStillAt, useNavigateIfStillHere } from '../router'

type FormKind = Exclude<TxKind, 'adjustment'>

const FIELD_PATHS = ['amountMinor', 'date', 'accountId', 'toAccountId', 'categoryId', 'refundOfId', 'note', 'link', 'expectRemainder', 'splits']

export function MovementForm({ route }: { route: Route }) {
  const { t } = useT()
  const data = useData()
  const editId = route.segments[0] === 'movimientos' && route.segments[1] === 'editar' ? route.segments[2] : undefined
  const existing = editId ? data.transactions.find((tx) => tx.id === editId) : undefined
  const returnTo = route.query.get('returnTo') || '/movimientos'

  if (editId && !existing) {
    return (
      <div className="stack">
        <PageHeader title={t('movementForm.notFound')} back={{ href: href('/movimientos'), label: t('nav.movements') }} />
        <EmptyState icon="search" title={t('movementForm.notFoundText')} />
      </div>
    )
  }
  if (existing?.kind === 'adjustment') return <AdjustmentView tx={existing} returnTo={returnTo} />
  return <MovementEditor route={route} existing={existing} returnTo={returnTo} />
}

/** Un ajuste de conciliación no se edita como un gasto: se muestra y se puede enviar a la papelera. */
function AdjustmentView({ tx, returnTo }: { tx: Transaction; returnTo: string }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const deleteTx = useDeleteTransaction()
  const account = accountName(data.accounts, tx.accountId, t)
  return (
    <div className="stack">
      <PageHeader title={t('adjustment.title')} back={{ href: href(returnTo), label: t('common.back') }} />
      <Card>
        <p className="lead">{t(tx.adjustmentDirection === 'decrease' ? 'adjustment.decrease' : 'adjustment.increase', { amount: fmt.money(tx.amountMinor) })}</p>
        <p>
          {fmt.date(tx.date)} · {account}
        </p>
        {tx.note && <p>{t('reconcile.reasonShown', { reason: tx.note })}</p>}
        <p className="note">{t('adjustment.text', { account })}</p>
        <div className="form__actions">
          <a className="btn btn--secondary" href={href(withQuery('/conciliar', { cuenta: tx.accountId }))}>
            <Icon name="scale" />
            {t('adjustment.seeReconciliation')}
          </a>
          <button
            type="button"
            className="btn btn--danger-ghost"
            onClick={async () => {
              const from = window.location.hash
              if (await deleteTx(tx.id)) navigateIfStillAt(from, returnTo)
            }}
          >
            <Icon name="trash" />
            {t('common.delete')}
          </button>
        </div>
        <p className="note">{t('adjustment.deleteNote')}</p>
      </Card>
    </div>
  )
}

function MovementEditor({ route, existing, returnTo }: { route: Route; existing: Transaction | undefined; returnTo: string }) {
  const leave = useNavigateIfStillHere()
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const deleteTx = useDeleteTransaction()
  const q = route.query

  // Favorito: rellena el formulario (fecha de hoy) pero nunca guarda nada por sí solo.
  const favorite = !existing && q.get('favorito') ? data.favorites.find((f) => f.id === q.get('favorito')) : undefined
  const [prefill] = useState<FavoritePrefill | undefined>(() => (favorite ? favoritePrefill(data, favorite) : undefined))

  const defaultAccount = data.accounts.find((a) => a.includeInBudget) ?? data.accounts[0]!
  const initialKind = ((existing?.kind as FormKind | undefined) ?? prefill?.kind ?? (q.get('kind') as FormKind | null) ?? 'expense') as FormKind
  const prefillAmount = q.get('amount')
  const [id] = useState(() => existing?.id ?? newId())
  const [kind, setKind] = useState<FormKind>(initialKind)
  const [status, setStatus] = useState<TxStatus>(existing?.status ?? (q.get('status') === 'planned' ? 'planned' : 'realized'))
  // Presupuestos por periodo (solo los no archivados se pueden cambiar aquí).
  const openPeriods = data.periodBudgets.filter((b) => !b.archived)
  // Elecciones explícitas (o ya guardadas). Lo que no está aquí lo propone la regla del periodo.
  const [periodChoice, setPeriodChoice] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      existing ? openPeriods.map((b) => [b.id, b.txIds.includes(existing.id)]) : openPeriods.filter((b) => b.id === q.get('periodo')).map((b) => [b.id, true]),
    ),
  )
  const [amountText, setAmountText] = useState(() => {
    if (existing) return fmt.moneyInput(existing.amountMinor)
    if (prefill?.amountMinor !== undefined) return fmt.moneyInput(prefill.amountMinor)
    return prefillAmount && /^\d+$/.test(prefillAmount) ? fmt.moneyInput(Number(prefillAmount)) : ''
  })
  const [date, setDate] = useState(existing?.date ?? (q.get('date') && isValidLocalDate(q.get('date')) ? q.get('date')! : today))
  const [accountId, setAccountId] = useState(existing?.accountId ?? (prefill ? (prefill.accountId ?? '') : (q.get('account') ?? defaultAccount.id)))
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? data.accounts.find((a) => a.id !== accountId)?.id ?? '')
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? (prefill ? (prefill.categoryId ?? '') : (q.get('category') ?? (initialKind === 'income' ? 'salary' : 'other_expense'))),
  )
  const [refundOfId, setRefundOfId] = useState(existing?.refundOfId ?? '')
  const [note, setNote] = useState(existing?.note ?? prefill?.note ?? q.get('note') ?? '')
  const [alreadyInBalance, setAlreadyInBalance] = useState(() => {
    if (!existing || existing.status !== 'realized') return false
    const acc = data.accounts.find((a) => a.id === existing.accountId)
    return !!acc && existing.date === acc.anchor.date && (existing.realizedAt ?? existing.createdAt) <= acc.anchor.setAt
  })
  const [issues, setIssues] = useState<Issue[]>([])
  const [amountError, setAmountError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [favoriteOpen, setFavoriteOpen] = useState(false)
  const submitting = useRef(false)
  // Regla de categoría: solo propone mientras la persona no elija la categoría a mano.
  const [categoryTouched, setCategoryTouched] = useState(() => !!existing || !!q.get('category') || !!prefill)
  const [ruleApplied, setRuleApplied] = useState<CategoryRule | undefined>(undefined)
  // Vínculo con un pago o ingreso previsto (solo movimientos nuevos): evita contarlo dos veces.
  const [linkKey, setLinkKey] = useState('')
  const [expectRemainder, setExpectRemainder] = useState(false)
  // Compra dividida (gastos) o reparto de la devolución de una compra dividida.
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[] | null>(() => (existing?.splits?.length ? draftsFromLines(existing.splits, fmt) : null))
  const [splitError, setSplitError] = useState<string | null>(null)

  const linkCandidates = useMemo(() => {
    if (existing || (kind !== 'income' && kind !== 'expense')) return []
    return openItemsUntil(data, today, addDays(today, 14)).filter((i) => i.source === 'schedule' && i.direction === kind && i.date >= addDays(today, -45))
  }, [data, today, kind, existing])
  const linked = linkCandidates.find((i) => i.key === linkKey)

  const changeNote = (value: string) => {
    setNote(value)
    // Una regla de categoría nunca sobrescribe una división manual.
    if (categoryTouched || kind === 'transfer' || splitDrafts) return
    const rule = matchCategoryRule(value, kind, data.categoryRules, data.categories)
    if (rule) {
      setCategoryId(rule.categoryId)
      setRuleApplied(rule)
    } else if (ruleApplied) {
      setCategoryId(kind === 'income' ? 'salary' : 'other_expense')
      setRuleApplied(undefined)
    }
  }

  const changeKind = (k: FormKind) => {
    setKind(k)
    if (k !== kind) setSplitDrafts(null)
    setRuleApplied(undefined)
    setLinkKey('')
    const valid = categoriesForKind(k, data.categories)
    if (k !== 'transfer' && !valid.includes(categoryId)) setCategoryId(k === 'income' ? 'salary' : 'other_expense')
    if (k === 'transfer' && toAccountId === accountId) setToAccountId(data.accounts.find((a) => a.id !== accountId)?.id ?? '')
  }

  // Solo hace falta para devoluciones. Lo ya devuelto se suma en UNA pasada (antes era O(n²):
  // con 10.000 movimientos guardar tardaba más de un segundo; ver docs/PERFORMANCE.md).
  const refundCandidates = useMemo(() => {
    if (kind !== 'refund') return []
    const refunded = new Map<string, number>()
    for (const r of data.transactions) {
      if (r.kind === 'refund' && r.refundOfId && r.id !== id) refunded.set(r.refundOfId, sumMinor([refunded.get(r.refundOfId) ?? 0, r.amountMinor]))
    }
    return data.transactions
      .filter((tx) => tx.kind === 'expense' && tx.status === 'realized' && tx.id !== id)
      .map((tx) => ({ tx, remaining: tx.amountMinor - (refunded.get(tx.id) ?? 0) }))
      .filter((c) => c.remaining > 0 || c.tx.id === refundOfId)
      .sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1))
      .slice(0, 50)
  }, [data.transactions, id, refundOfId, kind])

  const proposedPeriods = existing ? [] : periodsProposedFor(data, { kind, date, categoryId })
  const periodChecked = (budgetId: string) => (budgetId in periodChoice ? periodChoice[budgetId]! : proposedPeriods.includes(budgetId))
  const periodIds = openPeriods.filter((b) => periodChecked(b.id)).map((b) => b.id)

  const parsedAmount = parseMoneyText(amountText, fmt)
  const refundOriginal = kind === 'refund' && refundOfId ? data.transactions.find((x) => x.id === refundOfId) : undefined
  const refundSplitMode = !!refundOriginal?.splits?.length
  const refundPending = useMemo(() => (refundOriginal && refundSplitMode ? refundableByCategory(data, refundOriginal, id) : undefined), [data, refundOriginal, refundSplitMode, id])
  const inferredRefund = refundOriginal && refundSplitMode && parsedAmount.ok ? inferRefundSplit(data, refundOriginal, parsedAmount.minor, id) : null
  const expenseCategories = categoriesForKind('expense', data.categories)
  // Propuesta: repartir como la última compra dividida con la misma descripción.
  const historySplit = kind === 'expense' && !splitDrafts ? suggestSplitFromHistory(data, note, parsedAmount.ok ? parsedAmount.minor : null, id) : null

  const submit = async () => {
    const parsed = parseMoneyText(amountText, fmt)
    setAmountError(moneyErrorMessage(t, parsed))
    // Evita un segundo envío por doble clic antes de que React vuelva a pintar.
    if (!parsed.ok || submitting.current) return
    // División: las líneas deben ser válidas y sumar exactamente el total (también lo valida el dominio).
    let splits: SplitLine[] | undefined
    const splitActive = (kind === 'expense' || refundSplitMode) && splitDrafts
    if (splitActive) {
      const lines = parseDrafts(splitDrafts, fmt)
      if (!lines) return void setSplitError(t('split.invalidLine'))
      const diff = parsed.minor - lines.reduce((sum, l) => sum + l.amountMinor, 0)
      if (diff !== 0) return void setSplitError(t('issue.splitMismatch', { differenceMinor: fmt.money(diff) }))
      splits = lines
    } else if (refundSplitMode) {
      return void setSplitError(t('split.refundNeedsSplit'))
    }
    setSplitError(null)
    submitting.current = true
    setBusy(true)
    const useLink = !!linked && status === 'realized'
    const periods = kind === 'expense' || kind === 'refund' ? periodIds : []

    const { result, saved } = await run((d, c) => {
      const r = save(d, c, parsed.minor, splits)
      if (!r.ok || (useLink && r.unchanged && r.value.id !== id) || openPeriods.length === 0) return r
      // Asociación con presupuestos por periodo en la misma operación (todo o nada).
      const p = setTransactionPeriods(r.data, r.value.id, periods, c)
      if (!p.ok) return p
      return p.unchanged ? r : { ok: true as const, data: p.data, value: r.value }
    })
    setBusy(false)
    if (!result.ok) {
      submitting.current = false
      setIssues(result.issues)
      return
    }
    // Si otra pestaña ya cerró esa ocurrencia, no se crea nada: se avisa en vez de duplicar.
    if (useLink && result.unchanged && result.value.id !== id) {
      submitting.current = false
      setIssues([{ path: 'link', code: 'occurrenceAlreadySettled', params: { date: fmt.date(linked.date) } }])
      return
    }
    const savedTx = result.value
    const canDistribute = saved && !existing && savedTx.kind === 'income' && savedTx.status === 'realized'
    toast({
      message: saved ? t(existing ? 'movementForm.updated' : 'movementForm.saved') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      // Tras registrar un ingreso recibido se ofrece repartirlo (nunca se hace solo).
      ...(canDistribute ? { action: { label: t('distribution.offer'), onClick: () => navigate(`/movimientos/distribuir/${savedTx.id}`) } } : {}),
    })
    leave(returnTo)
  }

  /** Guarda el movimiento (o liquida la ocurrencia vinculada). */
  function save(d: AppData, c: OpContext, amountMinor: number, splits?: SplitLine[]) {
    if (linked && status === 'realized') {
      return markOccurrence(
        d,
        {
          scheduleId: linked.sourceId,
          occurrenceDate: linked.date,
          amountMinor,
          date,
          accountId,
          alreadyInBalance,
          txId: id,
          expectRemainder: expectRemainder && amountMinor < linked.amountMinor,
          categoryId,
          note,
        },
        c,
      )
    }
    return saveTransaction(
      d,
      {
        id,
        kind,
        status,
        amountMinor,
        date,
        accountId,
        ...(kind === 'transfer' ? { toAccountId } : { categoryId: splits?.[0]?.categoryId ?? categoryId }),
        ...(splits ? { splits } : {}),
        ...(kind === 'refund' && refundOfId ? { refundOfId } : {}),
        note,
        ...(existing?.scheduleId ? { scheduleId: existing.scheduleId, occurrenceDate: existing.occurrenceDate, partialSettlement: existing.partialSettlement } : {}),
        alreadyInBalance,
      },
      c,
    )
  }

  const choose = { value: '', label: t('favorites.choose') }
  const accountOptions = data.accounts.map((a) => ({ value: a.id, label: a.name }))
  const schedule = existing?.scheduleId ? data.schedules.find((s) => s.id === existing.scheduleId) : undefined
  const unknownIssues = otherIssues(issues, FIELD_PATHS)

  return (
    <div className="stack">
      <PageHeader title={existing ? t('movementForm.editTitle') : t('movementForm.newTitle')} back={{ href: href(returnTo), label: t('common.back') }} />

      {!existing && !favorite && <FavoriteChips returnTo={returnTo} />}
      {favorite && prefill && (
        <Alert tone="info" icon="star" title={t('favorites.usingTitle', { name: favorite.name })}>
          <p>{t('favorites.usingText')}</p>
          {prefill.missingAccount && <p>{t('favorites.missingAccount')}</p>}
          {prefill.missingCategory && <p>{t('favorites.missingCategory')}</p>}
        </Alert>
      )}

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
          options={accountId ? accountOptions : [choose, ...accountOptions]}
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

        {kind === 'expense' && !splitDrafts && (
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => {
              setSplitDrafts([newSplitDraft(categoryId || 'other_expense', amountText), newSplitDraft(expenseCategories.find((c) => c !== categoryId) ?? 'other_expense')])
              setRuleApplied(undefined)
            }}
          >
            <Icon name="list" size={16} />
            {t('split.start')}
          </button>
        )}
        {historySplit && (
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => {
              setSplitDrafts(historySplit.lines.map((l) => newSplitDraft(l.categoryId, fmt.moneyInput(l.amountMinor))))
              setRuleApplied(undefined)
            }}
          >
            <Icon name="undo" size={16} />
            {t('split.fromHistory', { note: historySplit.from.note ?? '', date: fmt.date(historySplit.from.date, { compact: true, today }) })}
          </button>
        )}
        {kind === 'expense' && splitDrafts && (
          <>
            <SplitEditor
              legend={t('split.legend')}
              drafts={splitDrafts}
              onChange={(d) => {
                setSplitDrafts(d)
                setSplitError(null)
              }}
              totalMinor={parsedAmount.ok ? parsedAmount.minor : null}
              categories={withCurrent(expenseCategories, undefined).concat(existing?.splits?.map((l) => l.categoryId).filter((c) => !expenseCategories.includes(c)) ?? [])}
              error={splitError ?? fieldError(t, fmt, issues, 'splits')}
            />
            <p className="note">{t('split.hint')}</p>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                setCategoryId(splitDrafts[0]?.categoryId ?? categoryId)
                setSplitDrafts(null)
                setSplitError(null)
              }}
            >
              <Icon name="x" size={16} />
              {t('split.remove')}
            </button>
          </>
        )}

        {kind !== 'transfer' && !(kind === 'expense' && splitDrafts) && (
          <SelectField
            label={t('fields.category')}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setCategoryTouched(true)
              setRuleApplied(undefined)
            }}
            options={[
              ...(categoryId ? [] : [choose]),
              ...withCurrent(categoriesForKind(kind, data.categories), existing?.categoryId).map((c) => ({ value: c, label: categoryLabel(t, c) })),
            ]}
            error={fieldError(t, fmt, issues, 'categoryId')}
            hint={ruleApplied ? t('movementForm.ruleHint', { pattern: ruleApplied.pattern }) : kind === 'refund' ? t('movementForm.refundCategoryHint') : undefined}
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
              setSplitDrafts(original?.splits?.length ? original.splits.map((l) => newSplitDraft(l.categoryId)) : null)
              setSplitError(null)
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

        {refundSplitMode && refundOriginal && (
          <>
            <Alert tone="info" icon="info" title={t('split.refundTitle')}>
              {inferredRefund ? t('split.refundInferable') : t('split.refundAsk')}
            </Alert>
            {inferredRefund && (
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => setSplitDrafts(inferredRefund.map((l) => newSplitDraft(l.categoryId, fmt.moneyInput(l.amountMinor))))}
              >
                {t('split.refundAuto')}
              </button>
            )}
            <SplitEditor
              legend={t('split.refundLegend')}
              drafts={splitDrafts ?? []}
              onChange={(d) => {
                setSplitDrafts(d)
                setSplitError(null)
              }}
              totalMinor={parsedAmount.ok ? parsedAmount.minor : null}
              categories={[...new Set(refundOriginal.splits!.map((l) => l.categoryId))]}
              maxByCategory={refundPending}
              withNotes={false}
              error={splitError ?? fieldError(t, fmt, issues, 'splits')}
            />
          </>
        )}

        {linkCandidates.length > 0 && status === 'realized' && (
          <SelectField
            label={t(kind === 'income' ? 'movementForm.linkIncome' : 'movementForm.linkExpense')}
            value={linkKey}
            onChange={(e) => {
              setLinkKey(e.target.value)
              setExpectRemainder(false)
              const item = linkCandidates.find((i) => i.key === e.target.value)
              if (item && !amountText.trim()) setAmountText(fmt.moneyInput(item.amountMinor))
            }}
            options={[
              { value: '', label: t('movementForm.linkNone') },
              ...linkCandidates.map((i) => ({
                value: i.key,
                label: t('movementForm.linkOption', { name: planItemName(i, t), date: fmt.date(i.date, { compact: true, today }), amount: fmt.money(i.amountMinor) }),
              })),
            ]}
            hint={t('movementForm.linkHint')}
            error={fieldError(t, fmt, issues, 'link')}
          />
        )}
        {linked && parsedAmount.ok && parsedAmount.minor < linked.amountMinor && (
          <CheckboxField
            checked={expectRemainder}
            onChange={setExpectRemainder}
            label={t('movementForm.expectRemainder', { amount: fmt.money(linked.amountMinor - parsedAmount.minor) })}
            hint={t('markPaid.partialHint')}
          />
        )}

        {(kind === 'expense' || kind === 'refund') && openPeriods.length > 0 && (
          <fieldset className="stack-sm">
            <legend className="field__label">{t('period.formLegend')}</legend>
            {openPeriods.map((b) => (
              <CheckboxField
                key={b.id}
                checked={periodChecked(b.id)}
                onChange={(v) => setPeriodChoice((choice) => ({ ...choice, [b.id]: v }))}
                label={`${b.name} (${fmt.date(b.startDate, { compact: true, today })} – ${fmt.date(b.endDate, { compact: true, today })})`}
                hint={!(b.id in periodChoice) && proposedPeriods.includes(b.id) ? t('period.proposedByRule') : undefined}
              />
            ))}
            <p className="field__hint">{t('period.formHint')}</p>
          </fieldset>
        )}

        <FieldShell label={t('fields.noteOptional')} error={fieldError(t, fmt, issues, 'note')} hint={t('movementForm.noteHint', { max: LIMITS.noteMax })}>
          {({ inputId, describedBy, invalid }) => (
            <textarea
              id={inputId}
              className="input textarea"
              value={note}
              maxLength={LIMITS.noteMax}
              rows={2}
              onChange={(e) => changeNote(e.target.value)}
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
          {(kind === 'expense' || kind === 'income') && (
            <button type="button" className="btn btn--ghost" onClick={() => setFavoriteOpen(true)}>
              <Icon name="star" />
              {t('favorites.saveAs')}
            </button>
          )}
          {existing && (
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={async () => {
                const from = window.location.hash
                if (await deleteTx(existing.id)) navigateIfStillAt(from, returnTo)
              }}
            >
              <Icon name="trash" />
              {t('common.delete')}
            </button>
          )}
        </div>
        {existing && <p className="note">{t('trash.deleteNote')}</p>}
        {existing?.kind === 'income' && existing.status === 'realized' && (
          <a className="btn btn--secondary" href={href(`/movimientos/distribuir/${existing.id}`)}>
            <Icon name="target" />
            {t('distribution.offer')}
          </a>
        )}
      </form>

      {favoriteOpen && (kind === 'expense' || kind === 'income') && (
        <FavoriteDialog
          favorite={null}
          initial={{
            name: (note.trim() || categoryLabel(t, categoryId)).slice(0, 40),
            kind,
            accountId,
            categoryId,
            amountMinor: parsedAmount.ok ? parsedAmount.minor : undefined,
            note: note.trim() || undefined,
          }}
          onClose={() => setFavoriteOpen(false)}
        />
      )}
    </div>
  )
}
