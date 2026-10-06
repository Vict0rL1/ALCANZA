/** Límites mensuales por categoría dentro del resumen del mes. */
import { useState } from 'react'
import { categoriesForKind } from '../../domain/categories'
import { limitStatuses, type PeriodSummary } from '../../domain/insights'
import { removeCategoryLimit, setCategoryLimit } from '../../domain/operations'
import type { Issue } from '../../domain/validation'
import { useT } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { useFormat } from '../format'
import { categoryLabel, fieldError } from '../labels'
import { moneyErrorMessage, parseMoneyText } from '../moneyText'
import { Badge, Meter } from './common'
import { Dialog } from './Dialog'
import { MoneyField, SelectField } from './fields'
import { Icon } from './Icon'
import { useToast } from './toastContext'

export function LimitsSection({ summary }: { summary: PeriodSummary }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const statuses = limitStatuses(summary, data.categoryLimits)

  const remove = async (categoryId: string) => {
    const previous = data.categoryLimits.find((l) => l.categoryId === categoryId)
    const { saved } = await run((d, c) => removeCategoryLimit(d, categoryId, c))
    toast({
      message: saved ? t('limits.removed') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: previous ? { label: t('common.undo'), onClick: () => void run((d, c) => setCategoryLimit(d, previous, c)) } : undefined,
    })
  }

  return (
    <div className="stack-sm limits">
      <h3 className="section-title">{t('limits.title')}</h3>
      {statuses.length === 0 ? (
        <p className="note">{t('limits.empty')}</p>
      ) : (
        <ul className="goal-mini-list">
          {statuses.map((s) => {
            const name = categoryLabel(t, s.categoryId)
            const text = t('limits.progress', { spent: fmt.money(s.spentMinor), limit: fmt.money(s.limitMinor) })
            return (
              <li key={s.categoryId}>
                <div className="goal-mini__row">
                  <span className="goal-mini__name">{name}</span>
                  {s.over ? (
                    <Badge tone="critical" icon="alert">
                      {t('limits.over', { amount: fmt.money(-s.remainingMinor) })}
                    </Badge>
                  ) : s.near ? (
                    <Badge tone="warning" icon="alert">
                      {t('limits.near')}
                    </Badge>
                  ) : null}
                </div>
                <Meter fraction={s.fraction} label={name} valueText={text} />
                <p className="item__meta">
                  {text}
                  {!s.over && <> · {t('limits.left', { amount: fmt.money(s.remainingMinor) })}</>}
                </p>
                <div className="item__actions">
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(s.categoryId)}>
                    <Icon name="edit" size={16} />
                    {t('common.edit')}
                    <span className="sr-only">: {name}</span>
                  </button>
                  <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => void remove(s.categoryId)}>
                    {t('limits.remove')}
                    <span className="sr-only">: {name}</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setEditing('new')}>
        <Icon name="plus" size={16} />
        {t('limits.add')}
      </button>
      <p className="note">{t('limits.note')}</p>
      {editing && <LimitDialog categoryId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function LimitDialog({ categoryId, onClose }: { categoryId: string | null; onClose: () => void }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const existing = categoryId ? data.categoryLimits.find((l) => l.categoryId === categoryId) : undefined
  const available = categoriesForKind('expense', data.categories).filter((c) => c === categoryId || !data.categoryLimits.some((l) => l.categoryId === c))
  const [category, setCategory] = useState(categoryId ?? available[0] ?? '')
  const [amountText, setAmountText] = useState(existing ? fmt.moneyInput(existing.monthlyLimitMinor) : '')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])

  const submit = async () => {
    const parsed = parseMoneyText(amountText, fmt)
    setAmountError(moneyErrorMessage(t, parsed))
    if (!parsed.ok) return
    const { result, saved } = await run((d, c) => setCategoryLimit(d, { categoryId: category, monthlyLimitMinor: parsed.minor }, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('limits.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={categoryId ? t('limits.editTitle') : t('limits.newTitle')}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <SelectField
        label={t('fields.category')}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        options={available.map((c) => ({ value: c, label: categoryLabel(t, c) }))}
        disabled={!!categoryId}
        error={fieldError(t, fmt, issues, 'categoryId')}
      />
      <MoneyField label={t('limits.amount')} value={amountText} onChange={setAmountText} error={amountError ?? fieldError(t, fmt, issues, 'monthlyLimitMinor')} fmt={fmt} autoFocus />
      <p className="note">{t('limits.note')}</p>
    </Dialog>
  )
}
