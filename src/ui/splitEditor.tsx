/**
 * Editor de líneas de una compra dividida (o del reparto de una devolución).
 * Solo muestra y edita: la regla «Σ líneas = total exacto» la valida el dominio.
 */
import { useT } from '../i18n'
import { Alert } from './components/common'
import { MoneyField, SelectField, TextField } from './components/fields'
import { Icon } from './components/Icon'
import { useFormat, type Formatter } from './format'
import { categoryLabel } from './labels'
import { parseMoneyText } from './moneyText'
import { LIMITS } from '../domain/validation'
import { MAX_SPLIT_LINES } from '../domain/splits'
import { newSplitDraft, type SplitDraft } from './splitDrafts'

/** Suma de las líneas que ya tienen un importe válido (las vacías cuentan 0). */
function assignedMinor(drafts: SplitDraft[], fmt: Formatter): number {
  return drafts.reduce((sum, d) => {
    const p = parseMoneyText(d.amountText, fmt)
    return p.ok ? sum + p.minor : sum
  }, 0)
}

export function SplitEditor({
  legend,
  drafts,
  onChange,
  totalMinor,
  categories,
  maxByCategory,
  withNotes = true,
  error,
}: {
  legend: string
  drafts: SplitDraft[]
  onChange: (drafts: SplitDraft[]) => void
  /** Total del movimiento (null si el importe aún no es válido). */
  totalMinor: number | null
  categories: readonly string[]
  /** Devoluciones: máximo por categoría (lo pendiente de devolver). */
  maxByCategory?: Map<string, number>
  withNotes?: boolean
  error?: string | null
}) {
  const { t } = useT()
  const fmt = useFormat()
  const assigned = assignedMinor(drafts, fmt)
  const remaining = totalMinor === null ? null : totalMinor - assigned
  const update = (id: string, patch: Partial<SplitDraft>) => onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  const minLines = maxByCategory ? 1 : 2

  return (
    <fieldset className="stack-sm split-editor" data-testid="split-editor">
      <legend className="field__label">{legend}</legend>
      {drafts.map((d, i) => {
        const own = parseMoneyText(d.amountText, fmt)
        const ownMinor = own.ok ? own.minor : 0
        const max = maxByCategory?.get(d.categoryId)
        return (
          <div key={d.id} className="card split-line" role="group" aria-label={t('split.lineN', { n: i + 1 })}>
            <SelectField
              label={t('split.category', { n: i + 1 })}
              value={d.categoryId}
              onChange={(e) => update(d.id, { categoryId: e.target.value })}
              options={categories.map((c) => ({ value: c, label: categoryLabel(t, c) }))}
            />
            <MoneyField
              label={t('split.amount', { n: i + 1 })}
              value={d.amountText}
              onChange={(v) => update(d.id, { amountText: v })}
              fmt={fmt}
              hint={max !== undefined ? t('split.maxRefund', { amount: fmt.money(Math.max(0, max)) }) : undefined}
            />
            {withNotes && <TextField label={t('split.note', { n: i + 1 })} value={d.note} maxLength={LIMITS.noteMax} onChange={(e) => update(d.id, { note: e.target.value })} />}
            <div className="button-row">
              {remaining !== null && remaining !== 0 && ownMinor + remaining > 0 && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => update(d.id, { amountText: fmt.moneyInput(ownMinor + remaining) })}>
                  {t('split.assignRest')}
                  <span className="sr-only">: {t('split.lineN', { n: i + 1 })}</span>
                </button>
              )}
              {drafts.length > minLines && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(drafts.filter((x) => x.id !== d.id))}>
                  <Icon name="x" size={16} />
                  {t('split.removeLine', { n: i + 1 })}
                </button>
              )}
            </div>
          </div>
        )
      })}
      {drafts.length < MAX_SPLIT_LINES && (
        <button type="button" className="btn btn--secondary btn--small" onClick={() => onChange([...drafts, newSplitDraft(categories.find((c) => !drafts.some((d) => d.categoryId === c)) ?? categories[0]!)])}>
          <Icon name="plus" size={16} />
          {t('split.addLine')}
        </button>
      )}
      <p className={`split-status${remaining === 0 ? ' is-ok' : ''}`} aria-live="polite" data-testid="split-status">
        <Icon name={remaining === 0 ? 'checkCircle' : 'alert'} size={16} />{' '}
        {remaining === null
          ? t('split.needTotal')
          : remaining === 0
            ? t('split.balanced', { amount: fmt.money(assigned) })
            : remaining > 0
              ? t('split.missing', { amount: fmt.money(remaining) })
              : t('split.over', { amount: fmt.money(-remaining) })}
      </p>
      {error && (
        <Alert tone="critical" title={error} role="alert" />
      )}
    </fieldset>
  )
}
