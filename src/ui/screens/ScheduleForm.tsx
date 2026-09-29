import { useState } from 'react'
import { categoriesForKind } from '../../domain/categories'
import { parseLocalDate } from '../../domain/dates'
import { newId } from '../../domain/ids'
import { deleteSchedule, restoreSchedule, saveSchedule } from '../../domain/operations'
import type { Frequency, ScheduleKind } from '../../domain/types'
import { FREQUENCIES, LIMITS, type Issue } from '../../domain/validation'
import { useT } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, EmptyState, PageHeader } from '../components/common'
import { CheckboxField, MoneyField, Segmented, SelectField, TextField } from '../components/fields'
import { parseMoneyText, moneyErrorMessage } from '../moneyText'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { categoryLabel, fieldError, frequencyLabel, issueMessage, otherIssues, withCurrent } from '../labels'
import { href, navigate, type Route } from '../router'

const REMINDER_OPTIONS = [0, 1, 2, 3, 7, 14]

export function ScheduleForm({ route }: { route: Route }) {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const editId = route.segments[2] === 'editar' ? route.segments[3] : undefined
  const existing = editId ? data.schedules.find((s) => s.id === editId) : undefined
  const queryKind = route.query.get('kind') === 'income' ? 'income' : 'expense'

  const [id] = useState(() => existing?.id ?? newId())
  const [kind, setKind] = useState<ScheduleKind>(existing?.kind ?? queryKind)
  const [name, setName] = useState(existing?.name ?? '')
  const [amountText, setAmountText] = useState(existing ? fmt.moneyInput(existing.amountMinor) : '')
  const [isEstimate, setIsEstimate] = useState(existing?.amountIsEstimate ?? false)
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly')
  const [startDate, setStartDate] = useState(existing?.startDate ?? today)
  const [endDate, setEndDate] = useState(existing?.endDate ?? '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? (data.accounts.find((a) => a.includeInBudget) ?? data.accounts[0]!).id)
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? (queryKind === 'income' ? 'salary' : 'other_expense'))
  const [reminder, setReminder] = useState(existing?.reminderDaysBefore ?? (queryKind === 'income' ? 0 : 2))
  const [note, setNote] = useState(existing?.note ?? '')
  const [issues, setIssues] = useState<Issue[]>([])
  const [amountError, setAmountError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (editId && !existing) {
    return (
      <div className="stack">
        <PageHeader title={t('scheduleForm.notFound')} back={{ href: href('/plan/calendario'), label: t('plan.calendar') }} />
        <EmptyState icon="search" title={t('scheduleForm.notFoundText')} />
      </div>
    )
  }

  const changeKind = (k: ScheduleKind) => {
    setKind(k)
    if (!categoriesForKind(k, data.categories).includes(categoryId)) setCategoryId(k === 'income' ? 'salary' : 'other_expense')
  }

  const submit = async () => {
    const parsed = parseMoneyText(amountText, fmt)
    setAmountError(moneyErrorMessage(t, parsed))
    if (!parsed.ok || busy) return
    setBusy(true)
    const { result, saved } = await run((d, c) =>
      saveSchedule(
        d,
        {
          id,
          name,
          kind,
          amountMinor: parsed.minor,
          amountIsEstimate: isEstimate,
          accountId,
          categoryId,
          frequency,
          startDate,
          endDate: endDate || undefined,
          reminderDaysBefore: reminder,
          note,
        },
        c,
      ),
    )
    setBusy(false)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('scheduleForm.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    navigate('/plan/calendario')
  }

  const remove = async () => {
    if (!existing) return
    const { result, saved } = await run((d, c) => deleteSchedule(d, existing.id, c))
    if (!result.ok) return
    const removed = result.value
    toast({
      message: saved ? t('scheduleForm.deleted') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => restoreSchedule(d, removed, c)) },
    })
    navigate('/plan/calendario')
  }

  const day = startDate ? parseLocalDate(startDate).day : 0
  const unknown = otherIssues(issues, ['name', 'amountMinor', 'startDate', 'endDate', 'accountId', 'categoryId'])

  return (
    <div className="stack">
      <PageHeader title={existing ? t('scheduleForm.editTitle') : t('scheduleForm.newTitle')} back={{ href: href('/plan/calendario'), label: t('plan.calendar') }} />
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
          name="skind"
          value={kind}
          onChange={changeKind}
          options={[
            { value: 'expense', label: t('scheduleForm.kindExpense') },
            { value: 'income', label: t('scheduleForm.kindIncome') },
          ]}
        />
        <TextField label={t('fields.name')} value={name} maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} placeholder={t(kind === 'income' ? 'scheduleForm.namePlaceholderIncome' : 'scheduleForm.namePlaceholderExpense')} error={fieldError(t, fmt, issues, 'name')} required />
        <MoneyField label={t('fields.amount')} value={amountText} onChange={setAmountText} error={amountError ?? fieldError(t, fmt, issues, 'amountMinor')} fmt={fmt} />
        <CheckboxField checked={isEstimate} onChange={setIsEstimate} label={t('scheduleForm.estimate')} hint={t('scheduleForm.estimateHint')} />
        <SelectField
          label={t('fields.frequency')}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          options={FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(t, f) }))}
        />
        <TextField
          label={t('scheduleForm.nextDate')}
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          hint={frequency === 'monthly' && day >= 29 ? t('scheduleForm.monthEndHint', { day }) : startDate < today ? t('scheduleForm.pastDateHint') : t('scheduleForm.nextDateHint')}
          error={fieldError(t, fmt, issues, 'startDate')}
          required
        />
        {frequency !== 'once' && (
          <TextField label={t('scheduleForm.endDate')} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} hint={t('scheduleForm.endDateHint')} error={fieldError(t, fmt, issues, 'endDate')} />
        )}
        <SelectField label={t('fields.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)} options={data.accounts.map((a) => ({ value: a.id, label: a.name }))} error={fieldError(t, fmt, issues, 'accountId')} />
        <SelectField label={t('fields.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={withCurrent(categoriesForKind(kind, data.categories), existing?.categoryId).map((c) => ({ value: c, label: categoryLabel(t, c) }))} />
        <SelectField
          label={t('scheduleForm.reminder')}
          value={String(reminder)}
          onChange={(e) => setReminder(Number(e.target.value))}
          options={REMINDER_OPTIONS.map((n) => ({ value: String(n), label: n === 0 ? t('scheduleForm.reminderSameDay') : tn('scheduleForm.reminderDays', n) }))}
          hint={t('scheduleForm.reminderHint')}
        />
        <TextField label={t('fields.noteOptional')} value={note} maxLength={LIMITS.noteMax} onChange={(e) => setNote(e.target.value)} />
        {existing && <p className="note">{t('scheduleForm.editNote')}</p>}
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
          <a className="btn btn--secondary btn--large" href={href('/plan/calendario')}>
            {t('common.cancel')}
          </a>
          {existing && (
            <button type="button" className="btn btn--danger-ghost" onClick={() => void remove()}>
              <Icon name="trash" />
              {t('common.delete')}
            </button>
          )}
        </div>
        {existing && <p className="note">{t('scheduleForm.deleteNote')}</p>}
      </form>
    </div>
  )
}

