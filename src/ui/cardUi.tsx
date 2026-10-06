/**
 * Tarjetas de crédito en la interfaz: campos del formulario y resumen
 * (uso del límite, fechas, pago mínimo e intereses estimados).
 */
import { cardSummary } from '../domain/cards'
import type { Account } from '../domain/types'
import { useT } from '../i18n'
import { useToday } from '../state/hooks'
import { useData } from '../state/store'
import { Alert, Badge, Meter } from './components/common'
import { MoneyField, SelectField, TextField } from './components/fields'
import type { Formatter } from './format'
import type { CardErrors, CardFieldsState } from './cardFields'

export function CardFields({ value, onChange, errors, fmt }: { value: CardFieldsState; onChange: (v: CardFieldsState) => void; errors: CardErrors; fmt: Formatter }) {
  const { t } = useT()
  const set = (patch: Partial<CardFieldsState>) => onChange({ ...value, ...patch })
  const days = [{ value: '', label: t('card.dayNone') }, ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: t('card.dayOption', { day: i + 1 }) }))]
  return (
    <fieldset className="stack-sm card-fields">
      <legend className="field__label">{t('card.detailsLegend')}</legend>
      <MoneyField label={t('card.limit')} value={value.limit} onChange={(v) => set({ limit: v })} error={errors.limit} fmt={fmt} />
      <TextField label={t('card.apr')} inputMode="decimal" value={value.apr} onChange={(e) => set({ apr: e.target.value })} hint={t('card.aprHint')} error={errors.apr} />
      <SelectField label={t('card.statementDay')} value={value.statementDay} onChange={(e) => set({ statementDay: e.target.value })} options={days} />
      <SelectField label={t('card.dueDay')} value={value.dueDay} onChange={(e) => set({ dueDay: e.target.value })} options={days} hint={t('card.dayHint')} />
      <TextField label={t('card.minPct')} inputMode="decimal" value={value.minPct} onChange={(e) => set({ minPct: e.target.value })} error={errors.minPct} />
      <MoneyField label={t('card.minFloor')} value={value.minFloor} onChange={(v) => set({ minFloor: v })} error={errors.minFloor} fmt={fmt} hint={t('card.minHint')} />
    </fieldset>
  )
}

/** Resumen de la tarjeta para la lista de cuentas. */
export function CardSummaryView({ account, fmt }: { account: Account; fmt: Formatter }) {
  const { t } = useT()
  const data = useData()
  const today = useToday()
  const s = cardSummary(data, account, today)
  return (
    <div className="card-summary">
      {s.limitMinor !== null && s.utilization !== null && (
        <>
          <Meter
            fraction={s.utilization}
            label={account.name}
            valueText={t('card.used', { debt: fmt.money(s.debtMinor), limit: fmt.money(s.limitMinor), pct: fmt.percent(s.utilization) })}
          />
          <p className="item__meta">{t('card.used', { debt: fmt.money(s.debtMinor), limit: fmt.money(s.limitMinor), pct: fmt.percent(s.utilization) })}</p>
          {s.overLimit ? (
            <Badge tone="critical" icon="alert">
              {t('card.overLimit', { amount: fmt.money(-(s.availableCreditMinor ?? 0)) })}
            </Badge>
          ) : (
            <p className="item__meta">{t('card.available', { amount: fmt.money(s.availableCreditMinor ?? 0) })}</p>
          )}
        </>
      )}
      <ul className="card-summary__facts">
        {s.nextStatementDate && <li>{t('card.nextStatement', { date: fmt.date(s.nextStatementDate, { compact: true, today }) })}</li>}
        {s.nextDueDate && <li>{t('card.nextDue', { date: fmt.date(s.nextDueDate, { compact: true, today }) })}</li>}
        {s.debtMinor > 0 && <li>{t('card.minPayment', { amount: fmt.money(s.minPaymentMinor) })}</li>}
        {s.debtMinor > 0 && s.monthlyInterestMinor !== null && <li>{t('card.interest', { amount: fmt.money(s.monthlyInterestMinor) })}</li>}
      </ul>
      {s.debtMinor > 0 && <p className="note">{t('card.payInFull')} {t('card.estimateNote')}</p>}
      {!account.includeInBudget && s.debtMinor > 0 && <Alert tone="warning" title={t('card.excludedWarning')} />}
    </div>
  )
}
