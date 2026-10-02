/**
 * Configuración inicial (se muestra cuando no hay datos guardados).
 * Todo lo que se pide es opcional salvo moneda y saldo; se puede explorar la demo.
 */
import { useRef, useState } from 'react'
import { computeBudget, type BudgetResult } from '../../domain/budget'
import { detectTimeZone, todayInTimeZone } from '../../domain/dates'
import { SUPPORTED_CURRENCIES } from '../../domain/money'
import { createInitialData, type SetupInput } from '../../domain/operations'
import type { AppData, Frequency, GoalFunding, Language, NumberLocale, Settings } from '../../domain/types'
import { FREQUENCIES, NUMBER_LOCALES, type Issue } from '../../domain/validation'
import { createDemoData } from '../../demo/demoData'
import { useT, type MessageKey } from '../../i18n'
import { getStore } from '../../state/store'
import { Alert, CalcRow, Card } from '../components/common'
import { MoneyField, Segmented, SelectField, TextField } from '../components/fields'
import { moneyErrorMessage } from '../moneyText'
import { Icon } from '../components/Icon'
import { createFormatter } from '../format'
import { frequencyLabel, issueMessage } from '../labels'
import { parseMoney } from '../../domain/money'

interface BillRow {
  key: number
  name: string
  amount: string
  date: string
  frequency: Frequency
}

const STEPS = 5

function guessLocale(): NumberLocale {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'es'
  if (lang.startsWith('es-ES')) return 'es-ES'
  if (lang.startsWith('fr')) return 'fr-CA'
  return 'es-MX'
}

export function Setup({ language, onLanguageChange }: { language: Language; onLanguageChange: (l: Language) => void }) {
  const { t, tn } = useT()
  const [timeZone] = useState(detectTimeZone)
  const [today] = useState(() => todayInTimeZone(timeZone))
  const billKey = useRef(0)
  const [step, setStep] = useState(0)
  const [currency, setCurrency] = useState('CAD')
  const [numberLocale, setNumberLocale] = useState<NumberLocale>(guessLocale)
  const [accountName, setAccountName] = useState('')
  const [balance, setBalance] = useState('')
  const [balanceDate, setBalanceDate] = useState(today)
  const [hasIncome, setHasIncome] = useState<'yes' | 'no'>('yes')
  const [incomeName, setIncomeName] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeDate, setIncomeDate] = useState('')
  const [incomeFrequency, setIncomeFrequency] = useState<Frequency>('biweekly')
  const [incomeVariable, setIncomeVariable] = useState<'fixed' | 'variable'>('fixed')
  const [horizon, setHorizon] = useState('14')
  const [bills, setBills] = useState<BillRow[]>([])
  const [reserve, setReserve] = useState('')
  const [reserveWhere, setReserveWhere] = useState<GoalFunding>('budget')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)

  const settings: Settings = { currency, numberLocale, dateStyle: 'medium', timeZone, language, fallbackHorizonDays: null }
  const fmt = createFormatter(settings)
  const money = (text: string, opts: { allowNegative?: boolean; allowZero?: boolean } = {}) => parseMoney(text, currency, numberLocale, opts)

  /** Valida el paso actual y construye la entrada de configuración si todo está bien. */
  const buildInput = (upTo: number): { input: SetupInput | null; errs: Record<string, string> } => {
    const errs: Record<string, string> = {}
    const bal = money(balance, { allowNegative: true, allowZero: true })
    if (upTo >= 1) {
      if (!bal.ok) errs.balance = moneyErrorMessage(t, bal)!
      if (!balanceDate) errs.balanceDate = t('issue.invalidDate')
      else if (balanceDate > today) errs.balanceDate = t('issue.realizedInFuture')
    }
    let income: SetupInput['income'] = null
    if (upTo >= 2 && hasIncome === 'yes') {
      const amt = money(incomeAmount)
      if (!amt.ok) errs.incomeAmount = moneyErrorMessage(t, amt)!
      if (!incomeDate) errs.incomeDate = t('setup.income.dateRequired')
      if (amt.ok && incomeDate) {
        income = { name: incomeName.trim() || t('setup.income.defaultName'), amountMinor: amt.minor, date: incomeDate, frequency: incomeFrequency, isEstimate: incomeVariable === 'variable' }
      }
    }
    const billInputs: SetupInput['bills'] = []
    if (upTo >= 3) {
      bills.forEach((b) => {
        const amt = money(b.amount)
        if (!b.name.trim()) errs[`bill-${b.key}-name`] = t('issue.required')
        if (!amt.ok) errs[`bill-${b.key}-amount`] = moneyErrorMessage(t, amt)!
        if (!b.date) errs[`bill-${b.key}-date`] = t('issue.invalidDate')
        if (b.name.trim() && amt.ok && b.date) billInputs.push({ name: b.name.trim(), amountMinor: amt.minor, date: b.date, frequency: b.frequency })
      })
    }
    let reserveInput: SetupInput['reserve'] = null
    if (upTo >= 4 && reserve.trim()) {
      const amt = money(reserve, { allowZero: true })
      if (!amt.ok) errs.reserve = moneyErrorMessage(t, amt)!
      else if (amt.minor > 0) reserveInput = { amountMinor: amt.minor, fundedFrom: reserveWhere, name: t('setup.reserve.defaultName') }
    }
    if (Object.keys(errs).length > 0 || !bal.ok) return { input: null, errs }
    return {
      input: {
        currency,
        timeZone,
        numberLocale,
        language,
        accountName: accountName.trim() || t('setup.balance.defaultAccount'),
        balanceMinor: bal.minor,
        balanceDate,
        income,
        fallbackHorizonDays: hasIncome === 'no' ? Number(horizon) : null,
        bills: billInputs,
        reserve: reserveInput,
      },
      errs,
    }
  }

  type Preview = { data: AppData; budget: BudgetResult } | { issues: Issue[] }
  const [preview, setPreview] = useState<Preview | null>(null)

  const next = () => {
    const { input, errs } = buildInput(step)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    if (step === 4 && input) {
      const r = createInitialData(input, { today, now: new Date().toISOString() })
      setPreview(r.ok ? { data: r.data, budget: computeBudget(r.data, today) } : { issues: r.issues })
    }
    setStep((s) => s + 1)
    window.scrollTo({ top: 0 })
    requestAnimationFrame(() => document.getElementById('setup-step-title')?.focus())
  }

  const back = () => {
    setErrors({})
    setStep((s) => Math.max(0, s - 1))
    requestAnimationFrame(() => document.getElementById('setup-step-title')?.focus())
  }

  const finish = async () => {
    if (!preview || !('data' in preview) || busy) return
    setBusy(true)
    const ok = await getStore().commit(preview.data)
    setBusy(false)
    if (!ok) setIssues([{ path: '', code: 'notFound' }])
  }

  const startDemo = async () => {
    setBusy(true)
    await getStore().commit(createDemoData({ now: new Date(), timeZone, language }))
    setBusy(false)
  }

  const stepTitle = (key: MessageKey) => (
    <>
      <p className="setup__progress">{t('setup.progress', { step, total: STEPS })}</p>
      <h1 id="setup-step-title" tabIndex={-1}>
        {t(key)}
      </h1>
    </>
  )

  const nav = (nextLabel?: string) => (
    <div className="form__actions">
      <button type="button" className="btn btn--secondary btn--large" onClick={back}>
        <Icon name="back" />
        {t('common.back')}
      </button>
      <button type="submit" className="btn btn--primary btn--large">
        {nextLabel ?? t('common.next')}
        <Icon name="chevronRight" />
      </button>
    </div>
  )

  return (
    <main className="setup" id="main">
      <div className="setup__brand">
        <span className="brand__mark" aria-hidden="true">M</span>
        <span className="brand__name">Margen</span>
        <span className="badge badge--neutral">{t('shell.prototype')}</span>
      </div>

      {step === 0 && (
        <Card className="setup__card">
          <Segmented
            legend={t('setup.welcome.language')}
            name="lang"
            value={language}
            onChange={onLanguageChange}
            options={[
              { value: 'es', label: t('settings.language.es') },
              { value: 'en', label: t('settings.language.en') },
            ]}
          />
          <h1 id="setup-step-title" tabIndex={-1}>
            {t('setup.welcome.title')}
          </h1>
          <p className="lead">{t('setup.welcome.lead')}</p>
          <ul className="bullets">
            <li>{t('setup.welcome.q1')}</li>
            <li>{t('setup.welcome.q2')}</li>
            <li>{t('setup.welcome.q3')}</li>
            <li>{t('setup.welcome.q4')}</li>
          </ul>
          <Alert tone="info" icon="lock" title={t('setup.welcome.privacyTitle')}>
            {t('setup.welcome.privacyText')}
          </Alert>
          <div className="form__actions form__actions--stack">
            <button type="button" className="btn btn--primary btn--large" onClick={() => setStep(1)}>
              {t('setup.welcome.start')}
            </button>
            <button type="button" className="btn btn--secondary btn--large" onClick={() => void startDemo()} disabled={busy}>
              {t('setup.welcome.demo')}
            </button>
          </div>
          <p className="note">{t('setup.welcome.demoNote')}</p>
        </Card>
      )}

      {step >= 1 && step <= 4 && (
        <Card className="setup__card">
          <form
            className="form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              next()
            }}
          >
            {step === 1 && (
              <>
                {stepTitle('setup.balance.title')}
                <SelectField label={t('setup.balance.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)} options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: t(`currency.${c.code}` as MessageKey) }))} hint={t('setup.balance.currencyHint')} />
                <SelectField
                  label={t('settings.format.number')}
                  value={numberLocale}
                  onChange={(e) => setNumberLocale(e.target.value as NumberLocale)}
                  options={NUMBER_LOCALES.map((l) => ({ value: l, label: `${createFormatter({ ...settings, numberLocale: l }).money(123456)} (${t(`settings.format.locale.${l}` as MessageKey)})` }))}
                />
                <TextField label={t('setup.balance.accountName')} value={accountName} maxLength={40} onChange={(e) => setAccountName(e.target.value)} placeholder={t('setup.balance.defaultAccount')} />
                <MoneyField label={t('setup.balance.amount')} hint={t('setup.balance.amountHint')} value={balance} onChange={setBalance} error={errors.balance} fmt={fmt} big autoFocus />
                <TextField label={t('setup.balance.date')} type="date" value={balanceDate} max={today} onChange={(e) => setBalanceDate(e.target.value)} error={errors.balanceDate} hint={t('setup.balance.dateHint')} />
                <p className="note">{t('setup.balance.timeZone', { zone: timeZone })}</p>
                {nav()}
              </>
            )}

            {step === 2 && (
              <>
                {stepTitle('setup.income.title')}
                <Segmented
                  legend={t('setup.income.question')}
                  name="hasIncome"
                  value={hasIncome}
                  onChange={setHasIncome}
                  options={[
                    { value: 'yes', label: t('setup.income.yes') },
                    { value: 'no', label: t('setup.income.no') },
                  ]}
                />
                {hasIncome === 'yes' ? (
                  <>
                    <TextField label={t('fields.name')} value={incomeName} maxLength={60} onChange={(e) => setIncomeName(e.target.value)} placeholder={t('setup.income.defaultName')} />
                    <MoneyField label={t('setup.income.amount')} value={incomeAmount} onChange={setIncomeAmount} error={errors.incomeAmount} fmt={fmt} />
                    <Segmented
                      legend={t('setup.income.variableLegend')}
                      name="variable"
                      value={incomeVariable}
                      onChange={setIncomeVariable}
                      options={[
                        { value: 'fixed', label: t('setup.income.fixed') },
                        { value: 'variable', label: t('setup.income.variable') },
                      ]}
                      hint={t('setup.income.variableHint')}
                    />
                    <TextField label={t('setup.income.date')} type="date" value={incomeDate} min={today} onChange={(e) => setIncomeDate(e.target.value)} error={errors.incomeDate} hint={incomeDate && incomeDate <= today ? t('setup.income.dateToday') : t('setup.income.dateHint')} />
                    <SelectField label={t('fields.frequency')} value={incomeFrequency} onChange={(e) => setIncomeFrequency(e.target.value as Frequency)} options={FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(t, f) }))} />
                  </>
                ) : (
                  <>
                    <SelectField
                      label={t('setup.income.horizon')}
                      value={horizon}
                      onChange={(e) => setHorizon(e.target.value)}
                      options={['7', '14', '30'].map((d) => ({ value: d, label: t('horizon.option', { days: d }) }))}
                      hint={t('setup.income.horizonHint')}
                    />
                  </>
                )}
                {nav()}
              </>
            )}

            {step === 3 && (
              <>
                {stepTitle('setup.bills.title')}
                <p>{t('setup.bills.lead')}</p>
                {bills.length === 0 && <p className="note">{t('setup.bills.none')}</p>}
                {bills.map((b, idx) => (
                  <fieldset key={b.key} className="bill-row">
                    <legend>{t('setup.bills.rowLegend', { n: idx + 1 })}</legend>
                    <TextField label={t('fields.name')} value={b.name} maxLength={60} onChange={(e) => setBills((list) => list.map((x) => (x.key === b.key ? { ...x, name: e.target.value } : x)))} error={errors[`bill-${b.key}-name`]} placeholder={t('setup.bills.namePlaceholder')} />
                    <MoneyField label={t('fields.amount')} value={b.amount} onChange={(v) => setBills((list) => list.map((x) => (x.key === b.key ? { ...x, amount: v } : x)))} error={errors[`bill-${b.key}-amount`]} fmt={fmt} />
                    <TextField label={t('setup.bills.date')} type="date" value={b.date} onChange={(e) => setBills((list) => list.map((x) => (x.key === b.key ? { ...x, date: e.target.value } : x)))} error={errors[`bill-${b.key}-date`]} />
                    <SelectField label={t('fields.frequency')} value={b.frequency} onChange={(e) => setBills((list) => list.map((x) => (x.key === b.key ? { ...x, frequency: e.target.value as Frequency } : x)))} options={FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(t, f) }))} />
                    <button type="button" className="btn btn--danger-ghost btn--small" onClick={() => setBills((list) => list.filter((x) => x.key !== b.key))}>
                      <Icon name="trash" size={16} />
                      {t('setup.bills.remove')}
                    </button>
                  </fieldset>
                ))}
                <button type="button" className="btn btn--secondary" onClick={() => setBills((list) => [...list, { key: ++billKey.current, name: '', amount: '', date: '', frequency: 'monthly' }])}>
                  <Icon name="plus" />
                  {t('setup.bills.add')}
                </button>
                <p className="note">{t('setup.bills.monthEnd')}</p>
                {nav()}
              </>
            )}

            {step === 4 && (
              <>
                {stepTitle('setup.reserve.title')}
                <p>{t('setup.reserve.lead')}</p>
                <MoneyField label={t('setup.reserve.amount')} value={reserve} onChange={setReserve} error={errors.reserve} fmt={fmt} hint={t('setup.reserve.amountHint')} />
                <Segmented
                  legend={t('setup.reserve.where')}
                  name="reserveWhere"
                  value={reserveWhere}
                  onChange={setReserveWhere}
                  options={[
                    { value: 'budget', label: t('setup.reserve.inBudget') },
                    { value: 'external', label: t('setup.reserve.external') },
                  ]}
                  hint={t(reserveWhere === 'budget' ? 'setup.reserve.inBudgetHint' : 'setup.reserve.externalHint')}
                />
                {nav(t('setup.reserve.review'))}
              </>
            )}
          </form>
        </Card>
      )}

      {step === 5 && (
        <Card className="setup__card">
          {stepTitle('setup.summary.title')}
          {preview && 'budget' in preview ? (
            <>
              <p className="hero__label">{preview.budget.status === 'ok' ? t('home.availableLabel') : t('home.balanceLabel')}</p>
              <p className="hero__value">{fmt.money(preview.budget.status === 'ok' ? preview.budget.availableMinor : preview.budget.spendableMinor)}</p>
              {preview.budget.horizon && (
                <p className="hero__sub">
                  {t(preview.budget.horizon.source === 'income' ? 'home.untilIncome' : 'home.untilHorizon', { date: fmt.date(preview.budget.horizon.endDate, { weekday: true }) })} · {tn('home.periodDays', preview.budget.horizon.days)}
                </p>
              )}
              <div className="calc">
                <CalcRow label={t('explain.balance')} value={fmt.money(preview.budget.spendableMinor)} />
                <CalcRow op="−" label={tn('explain.reserved', preview.budget.reservedItems.length)} value={fmt.money(preview.budget.reservedTotalMinor)} />
                <CalcRow op="−" label={t('explain.goals')} value={fmt.money(preview.budget.goalsReservedMinor)} />
                <CalcRow op="=" label={t('explain.available')} value={fmt.money(preview.budget.availableMinor)} strong />
                {preview.budget.dailyMinor !== null && <CalcRow label={t('home.daily')} value={fmt.money(preview.budget.dailyMinor)} />}
              </div>
              {preview.budget.availableMinor < 0 && <Alert tone="warning" title={t('home.negativeTitle', { amount: fmt.money(-preview.budget.availableMinor) })}>{t('home.negativeText')}</Alert>}
              {preview.budget.overdueIncomes.length > 0 && <Alert tone="warning" title={t('setup.summary.incomePast')} />}
              <p className="note">{t('setup.summary.note')}</p>
            </>
          ) : (
            <Alert tone="critical" title={t('common.fixErrors')}>
              {preview && 'issues' in preview && (
                <ul>
                  {preview.issues.map((i, idx) => (
                    <li key={idx}>{issueMessage(t, fmt, i)}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          {issues.length > 0 && <Alert tone="critical" title={t('save.error.generic')} role="alert" />}
          <div className="form__actions">
            <button type="button" className="btn btn--secondary btn--large" onClick={back}>
              <Icon name="back" />
              {t('common.back')}
            </button>
            <button type="button" className="btn btn--primary btn--large" onClick={() => void finish()} disabled={busy || !preview || !('data' in preview)}>
              <Icon name="check" />
              {t('setup.summary.finish')}
            </button>
          </div>
        </Card>
      )}
    </main>
  )
}
