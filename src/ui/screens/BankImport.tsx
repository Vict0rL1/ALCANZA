import { useMemo, useRef, useState } from 'react'
import {
  guessMapping,
  isImportable,
  looksLikeHeader,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  possibleDateFormats,
  previewImport,
  type BankDateFormat,
  type ColumnMapping,
  type ImportRow,
} from '../../domain/bankImport'
import { categoriesForKind } from '../../domain/categories'
import { newId } from '../../domain/ids'
import { importTransactions, removeTransactions } from '../../domain/operations'
import type { Issue } from '../../domain/validation'
import { useT, type MessageKey } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Alert, Badge, Card, PageHeader } from '../components/common'
import { CheckboxField, Segmented, SelectField } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { categoryLabel, issueMessage } from '../labels'
import { href, navigate } from '../router'

const PAGE = 100

interface LoadedFile {
  name: string
  table: string[][]
}

/** Lee el archivo como UTF-8; si no lo es, como Windows-1252 (habitual en bancos). */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export function BankImport() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [accountId, setAccountId] = useState(() => (data.accounts.find((a) => a.includeInBudget) ?? data.accounts[0]!).id)
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [fileError, setFileError] = useState<MessageKey | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<ColumnMapping>({ date: 0, description: 1, amount: 2 })
  const [dateFormat, setDateFormat] = useState<BankDateFormat>('ymd')
  const [invertSign, setInvertSign] = useState(false)
  const [sameDayIncluded, setSameDayIncluded] = useState(true)
  const [expenseCategory, setExpenseCategory] = useState('other_expense')
  const [incomeCategory, setIncomeCategory] = useState('other_income')
  const [choices, setChoices] = useState<Map<string, boolean>>(new Map())
  const [limit, setLimit] = useState(PAGE)
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)
  // Un id por fila, fijado al verla por primera vez: confirmar dos veces no duplica.
  const ids = useRef(new Map<string, string>())
  const idFor = (ref: string) => {
    let id = ids.current.get(ref)
    if (!id) ids.current.set(ref, (id = newId()))
    return id
  }

  const account = data.accounts.find((a) => a.id === accountId)

  const onFile = async (picked: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!picked) return
    setFile(null)
    setIssues([])
    if (picked.size > MAX_IMPORT_BYTES) return setFileError('bankImport.error.tooLarge')
    const table = parseCsv(await readText(picked))
    const width = table.reduce((max, r) => Math.max(max, r.length), 0)
    if (table.length === 0 || width < 2) return setFileError('bankImport.error.notCsv')
    const header = looksLikeHeader(table[0]!)
    const guessed = header ? guessMapping(table[0]!) : null
    const nextMapping = guessed ?? { date: 0, description: Math.min(1, width - 1), amount: Math.min(2, width - 1) }
    const formats = possibleDateFormats((header ? table.slice(1) : table).map((r) => r[nextMapping.date] ?? ''))
    setFileError(null)
    setHasHeader(header)
    setMapping(nextMapping)
    setDateFormat(formats[0] ?? 'dmy')
    setInvertSign(false)
    setChoices(new Map())
    setLimit(PAGE)
    setFile({ name: picked.name, table })
  }

  const preview = useMemo(
    () => (file ? previewImport(file.table, data, { accountId, mapping, hasHeader, dateFormat, invertSign, locale: data.settings.numberLocale, today }) : null),
    [file, data, accountId, mapping, hasHeader, dateFormat, invertSign, today],
  )

  const header = file?.table[0] ?? []
  const width = file ? file.table.reduce((max, r) => Math.max(max, r.length), 0) : 0
  const columnOptions = Array.from({ length: width }, (_, i) => ({
    value: String(i),
    label: hasHeader && header[i] ? t('bankImport.columnNamed', { n: i + 1, name: header[i] }) : t('bankImport.column', { n: i + 1 }),
  }))
  const dateValues = file ? (hasHeader ? file.table.slice(1) : file.table).map((r) => r[mapping.date] ?? '') : []
  const validFormats = possibleDateFormats(dateValues)
  const splitAmount = mapping.amount === undefined

  const isChecked = (row: ImportRow) => isImportable(row) && (choices.get(row.importRef) ?? row.status === 'new')
  const selected = preview ? preview.rows.filter(isChecked) : []
  const hasSameDay = selected.some((r) => r.anchorRelation === 'sameDay')
  const selectedTotal = selected.reduce((sum, r) => sum + (r.kind === 'income' ? r.amountMinor! : -r.amountMinor!), 0)

  const toggle = (row: ImportRow, value: boolean) => {
    if (!row.importRef) return
    setChoices((prev) => new Map(prev).set(row.importRef!, value))
  }

  const confirm = async () => {
    if (busy || !preview || selected.length === 0) return
    setBusy(true)
    const items = selected.filter(isImportable).map((r) => ({
      id: idFor(r.importRef),
      kind: r.kind,
      amountMinor: r.amountMinor,
      date: r.date,
      accountId,
      categoryId: r.kind === 'income' ? incomeCategory : expenseCategory,
      note: r.description || undefined,
      importRef: r.importRef,
    }))
    const { result, saved } = await run((d, c) => importTransactions(d, { items, sameDayAlreadyInBalance: sameDayIncluded }, c))
    setBusy(false)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    const created = result.value.ids
    toast({
      message: saved ? tn('bankImport.done', created.length) : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: created.length ? { label: t('common.undo'), onClick: () => void run((d, c) => removeTransactions(d, created, c)) } : undefined,
    })
    if (saved) navigate('/movimientos')
  }

  const rowBadges = (row: ImportRow) => {
    switch (row.status) {
      case 'error':
        return <Badge tone="critical" icon="alert">{t(`bankImport.error.row.${row.error}` as MessageKey)}</Badge>
      case 'duplicate':
        return <Badge tone="neutral" icon="check">{t('bankImport.status.duplicate')}</Badge>
      case 'possibleDuplicate':
        return <Badge tone="warning" icon="alert">{t('bankImport.status.possibleDuplicate')}</Badge>
      default:
        return <Badge tone="good" icon="plus">{t('bankImport.status.new')}</Badge>
    }
  }

  const possibleMatch = (row: ImportRow) => {
    const match = row.matchId ? data.transactions.find((tx) => tx.id === row.matchId) : undefined
    if (!match || row.status !== 'possibleDuplicate') return null
    return t('bankImport.matchHint', { date: fmt.date(match.date, { compact: true, today }), note: match.note || categoryLabel(t, match.categoryId) })
  }

  return (
    <div className="stack">
      <PageHeader title={t('bankImport.title')} back={{ href: href('/movimientos'), label: t('nav.movements') }} />

      <Card labelledBy="import-file-title">
        <h2 id="import-file-title" className="card__title">
          {t('bankImport.step1')}
        </h2>
        <p>{t('bankImport.intro')}</p>
        <SelectField
          label={t('bankImport.account')}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={data.accounts.map((a) => ({ value: a.id, label: a.name }))}
          hint={t('bankImport.accountHint')}
        />
        <div className="button-row">
          <label className="btn btn--primary file-button">
            <Icon name="upload" />
            {file ? t('bankImport.chooseOther') : t('bankImport.choose')}
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="bank-file" />
          </label>
        </div>
        <p className="note">
          <Icon name="lock" size={14} /> {t('bankImport.privacy', { max: MAX_IMPORT_ROWS })}
        </p>
        {file && <p className="note">{t('bankImport.loaded', { name: file.name })}</p>}
        {fileError && (
          <Alert tone="critical" title={t(fileError)} role="alert">
            {t('bankImport.error.help')}
          </Alert>
        )}
      </Card>

      {file && preview && (
        <>
          <Card labelledBy="import-map-title">
            <h2 id="import-map-title" className="card__title">
              {t('bankImport.step2')}
            </h2>
            <p className="note">{t('bankImport.mapIntro')}</p>
            <CheckboxField label={t('bankImport.hasHeader')} checked={hasHeader} onChange={setHasHeader} />
            <div className="form-grid">
              <SelectField label={t('bankImport.dateColumn')} value={String(mapping.date)} onChange={(e) => setMapping({ ...mapping, date: Number(e.target.value) })} options={columnOptions} />
              <SelectField
                label={t('bankImport.descriptionColumn')}
                value={String(mapping.description)}
                onChange={(e) => setMapping({ ...mapping, description: Number(e.target.value) })}
                options={columnOptions}
              />
            </div>
            <Segmented
              legend={t('bankImport.amountMode')}
              name="amount-mode"
              value={splitAmount ? 'split' : 'single'}
              onChange={(v) =>
                setMapping(
                  v === 'single'
                    ? { date: mapping.date, description: mapping.description, amount: mapping.debit ?? Math.min(2, width - 1) }
                    : { date: mapping.date, description: mapping.description, debit: mapping.amount ?? Math.min(2, width - 1), credit: Math.min((mapping.amount ?? 2) + 1, width - 1) },
                )
              }
              options={[
                { value: 'single', label: t('bankImport.amountSingle') },
                { value: 'split', label: t('bankImport.amountSplit') },
              ]}
            />
            <div className="form-grid">
              {splitAmount ? (
                <>
                  <SelectField label={t('bankImport.debitColumn')} value={String(mapping.debit)} onChange={(e) => setMapping({ ...mapping, debit: Number(e.target.value) })} options={columnOptions} />
                  <SelectField label={t('bankImport.creditColumn')} value={String(mapping.credit)} onChange={(e) => setMapping({ ...mapping, credit: Number(e.target.value) })} options={columnOptions} />
                </>
              ) : (
                <SelectField
                  label={t('bankImport.amountColumn')}
                  value={String(mapping.amount)}
                  onChange={(e) => setMapping({ ...mapping, amount: Number(e.target.value) })}
                  options={columnOptions}
                  hint={t('bankImport.amountHint')}
                />
              )}
              <SelectField
                label={t('bankImport.dateFormat')}
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as BankDateFormat)}
                options={(['ymd', 'dmy', 'mdy'] as const).map((f) => ({ value: f, label: t(`bankImport.dateFormat.${f}` as MessageKey) }))}
                hint={validFormats.length > 1 ? t('bankImport.dateAmbiguous') : undefined}
                error={validFormats.length > 0 && !validFormats.includes(dateFormat) ? t('bankImport.dateMismatch') : null}
              />
            </div>
            <CheckboxField
              label={t('bankImport.invert')}
              hint={account?.kind === 'credit' ? t('bankImport.invertCardHint') : t('bankImport.invertHint')}
              checked={invertSign}
              onChange={setInvertSign}
            />
            <div className="form-grid">
              <SelectField
                label={t('bankImport.expenseCategory')}
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                options={categoriesForKind('expense', data.categories).map((c) => ({ value: c, label: categoryLabel(t, c) }))}
              />
              <SelectField
                label={t('bankImport.incomeCategory')}
                value={incomeCategory}
                onChange={(e) => setIncomeCategory(e.target.value)}
                options={categoriesForKind('income', data.categories).map((c) => ({ value: c, label: categoryLabel(t, c) }))}
              />
            </div>
            <p className="note">{t('bankImport.categoryNote')}</p>
          </Card>

          <Card labelledBy="import-review-title">
            <h2 id="import-review-title" className="card__title">
              {t('bankImport.step3')}
            </h2>
            <ul className="import-counts" aria-live="polite">
              <li>
                <Badge tone="good" icon="plus">{tn('bankImport.count.new', preview.counts.new)}</Badge>
              </li>
              {preview.counts.possibleDuplicate > 0 && (
                <li>
                  <Badge tone="warning" icon="alert">{tn('bankImport.count.possibleDuplicate', preview.counts.possibleDuplicate)}</Badge>
                </li>
              )}
              {preview.counts.duplicate > 0 && (
                <li>
                  <Badge tone="neutral" icon="check">{tn('bankImport.count.duplicate', preview.counts.duplicate)}</Badge>
                </li>
              )}
              {preview.counts.error > 0 && (
                <li>
                  <Badge tone="critical" icon="alert">{tn('bankImport.count.error', preview.counts.error)}</Badge>
                </li>
              )}
            </ul>
            {preview.tooManyRows && <Alert tone="warning" title={t('bankImport.tooManyRows', { max: MAX_IMPORT_ROWS })} />}
            {preview.counts.possibleDuplicate > 0 && <p className="note">{t('bankImport.possibleNote')}</p>}
            {preview.counts.duplicate > 0 && <p className="note">{t('bankImport.duplicateNote')}</p>}
            {account && selected.some((r) => r.anchorRelation === 'before') && (
              <p className="note">{t('bankImport.beforeAnchorNote', { date: fmt.date(account.anchor.date) })}</p>
            )}

            <ul className="item-list import-rows">
              {preview.rows.slice(0, limit).map((row) => {
                const importable = isImportable(row)
                const inputId = `import-row-${row.line}`
                const matchHint = possibleMatch(row)
                return (
                  <li key={row.line} className={`item import-row${importable ? '' : ' import-row--disabled'}`}>
                    <input
                      id={inputId}
                      type="checkbox"
                      className="import-row__check"
                      checked={isChecked(row)}
                      disabled={!importable}
                      onChange={(e) => toggle(row, e.target.checked)}
                      aria-describedby={`${inputId}-meta`}
                    />
                    <label htmlFor={inputId} className="item__main">
                      <span className="item__title">{row.description || t('bankImport.noDescription')}</span>
                      <span className="item__meta" id={`${inputId}-meta`}>
                        {t('bankImport.line', { n: row.line })}
                        {row.date ? ` · ${fmt.date(row.date, { compact: true, today })}` : ''}
                        {matchHint ? ` · ${matchHint}` : ''}
                        {importable && row.anchorRelation === 'before' ? ` · ${t('bankImport.notInBalance')}` : ''}
                      </span>
                      <span className="item__badges">{rowBadges(row)}</span>
                    </label>
                    {row.amountMinor !== undefined && (
                      <span className={`item__amount item__amount--${row.kind}`}>{fmt.money(row.kind === 'income' ? row.amountMinor : -row.amountMinor, { sign: true })}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            {preview.rows.length > limit && (
              <button type="button" className="btn btn--secondary" onClick={() => setLimit(limit + PAGE)}>
                {t('movements.showMore', { count: preview.rows.length - limit })}
              </button>
            )}

            {hasSameDay && account && (
              <CheckboxField
                label={t('bankImport.sameDay', { date: fmt.date(account.anchor.date) })}
                hint={t('bankImport.sameDayHint')}
                checked={sameDayIncluded}
                onChange={setSameDayIncluded}
              />
            )}

            {issues.length > 0 && (
              <Alert tone="critical" title={t('bankImport.failed')} role="alert">
                <ul>
                  {issues.slice(0, 5).map((i, idx) => (
                    <li key={idx}>{issueMessage(t, fmt, i)}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <p className="summary-line">{t('bankImport.selectedSummary', { count: selected.length, total: fmt.money(selectedTotal, { sign: true }) })}</p>
            <div className="form__actions">
              <button type="button" className="btn btn--primary btn--large" disabled={busy || selected.length === 0} onClick={() => void confirm()}>
                <Icon name="check" />
                {tn('bankImport.confirm', selected.length)}
              </button>
              <a className="btn btn--secondary btn--large" href={href('/movimientos')}>
                {t('common.cancel')}
              </a>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
