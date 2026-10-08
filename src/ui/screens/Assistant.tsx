/**
 * Asistente de registro (§7.3): texto o dictado → vista previa editable → registro todo o nada.
 * El análisis es local salvo que haya un proveedor remoto configurado por variables de entorno
 * (nunca se simula). Ninguna IA calcula ni modifica saldos.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createAiProvider, LocalProvider } from '../../domain/aiProvider'
import { gate } from '../../domain/featureGate'
import { DEV_MODE } from './Pro'
import { recordAiUsage, saveConfirmedEntries, type ConfirmedEntry } from '../../domain/assistant'
import { parseReceiptText } from '../../domain/receipt'
import { compressReceipt, ocrAvailable, recognizeText } from '../ocr'
import { resolveCategories } from '../../domain/categories'
import { newId } from '../../domain/ids'
import { parseMoney } from '../../domain/money'
import { countEntries, learnCategories, MAX_PARSER_LINES, type ParsedEntry } from '../../domain/parser'
import { lastUsedAccount } from '../../domain/quickEntry'
import type { Issue } from '../../domain/validation'
import { useT, type MessageKey } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { PrimaryButton, SecondaryButton, TextButton } from '../components/base'
import { Alert, Badge, Card, PageHeader } from '../components/common'
import { MoneyField, Segmented, SelectField, TextAreaField, TextField } from '../components/fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { categoryLabel, issueMessage } from '../labels'
import { moneyErrorMessage } from '../moneyText'
import { href, useNavigateIfStillHere, withQuery, type Route } from '../router'

const provider = createAiProvider(import.meta.env as { VITE_AI_ENDPOINT?: string; VITE_AI_KEY?: string })
const localProvider = new LocalProvider()

interface Line {
  id: string
  entry: ParsedEntry
  kind: 'expense' | 'income'
  amountText: string
  categoryId: string
  date: string
  note: string
  /** Foto del recibo (data URL) cuando la línea viene de una foto. */
  receiptUri?: string
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }

function speechApi(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function Assistant({ route }: { route: Route }) {
  const { t, tn, language } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const leave = useNavigateIfStillHere()
  const returnTo = route.query.get('returnTo') || '/'
  const [text, setText] = useState(() => route.query.get('texto') ?? '')
  const [lines, setLines] = useState<Line[] | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)
  // Líneas pegadas por encima del tope: se analizan las primeras y se avisa (F1).
  const [truncated, setTruncated] = useState(0)
  const [listening, setListening] = useState(false)
  const recognizer = useRef<InstanceType<SpeechCtor> | null>(null)
  const speech = useMemo(() => speechApi(), [])
  const categories = useMemo(() => resolveCategories(data).filter((c) => !c.archived), [data])
  const learned = useMemo(() => learnCategories(data), [data])
  const [accountId, setAccountId] = useState(() => data.accounts.find((a) => a.id === lastUsedAccount(data, 'expense'))?.id ?? data.accounts.find((a) => a.includeInBudget)?.id ?? data.accounts[0]?.id ?? '')

  useEffect(() => () => recognizer.current?.stop(), [])
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const parseCtx = () => ({ today, currency: data.settings.currency, language, categories: categories.map((c) => ({ id: c.id, kind: c.kind })), learned, rules: data.categoryRules })

  /** Foto de un recibo: se comprime, se lee el texto en el dispositivo (si el navegador puede) y se propone UNA línea para revisar. */
  const onPhoto = async (file: File | undefined) => {
    if (photoRef.current) photoRef.current.value = ''
    if (!file || photoBusy) return
    setPhotoBusy(true)
    try {
      const receiptUri = await compressReceipt(file)
      if (!receiptUri) {
        toast({ message: t('assistant.photoTooBig'), tone: 'critical' })
        return
      }
      const ocr = await recognizeText(file)
      const receipt = ocr ? parseReceiptText(ocr.text, parseCtx()) : null
      const hints: ParsedEntry['hints'] = []
      if (!ocr) hints.push('ocrUnavailable')
      else if (receipt?.totalMinor === null) hints.push('receiptNoAmount')
      else if (receipt && receipt.amountsMinor.length > 0 && receipt.confidence >= 0.5) hints.push('receiptTotal')
      else hints.push('receiptLargest')
      if (receipt?.date) hints.push('receiptDate')
      else hints.push('assumedToday')
      if (receipt?.merchant) hints.push('receiptMerchant')
      const entry: ParsedEntry = {
        kind: 'expense',
        amountMinor: receipt?.totalMinor ?? null,
        description: receipt?.merchant ?? t('assistant.photoDefaultNote'),
        ...(receipt?.merchant ? { merchant: receipt.merchant } : {}),
        ...(receipt?.categoryId ? { categoryId: receipt.categoryId } : {}),
        date: receipt?.date ?? today,
        confidence: receipt?.confidence ?? 0,
        raw: t('assistant.photoRaw', { name: file.name || 'foto' }),
        hints,
      }
      const line: Line = { id: newId(), entry, kind: 'expense', amountText: entry.amountMinor === null ? '' : fmt.moneyInput(entry.amountMinor), categoryId: entry.categoryId ?? 'other_expense', date: entry.date, note: entry.description, receiptUri }
      setLines((ls) => [...(ls ?? []), line])
      setIssues([])
    } catch {
      toast({ message: t('assistant.photoFailed'), tone: 'critical' })
    } finally {
      setPhotoBusy(false)
    }
  }

  const analyze = async (input = text) => {
    if (!input.trim()) return
    setBusy(true)
    const remoteGate = gate('aiRemote', data.settings, { today, devMode: DEV_MODE })
    const active = provider.id === 'remote' && remoteGate.allowed ? provider : localProvider
    const entries = await active.parseText(input, {
      today,
      currency: data.settings.currency,
      language,
      categories: categories.map((c) => ({ id: c.id, kind: c.kind })),
      learned,
      rules: data.categoryRules,
    })
    setBusy(false)
    setIssues([])
    const total = countEntries(input)
    setTruncated(total > MAX_PARSER_LINES ? total : 0)
    setLines(
      entries.map((entry) => ({
        id: newId(),
        entry,
        kind: entry.kind,
        amountText: entry.amountMinor === null ? '' : fmt.moneyInput(entry.amountMinor),
        categoryId: entry.categoryId ?? (entry.kind === 'income' ? 'salary' : 'other_expense'),
        date: entry.date,
        note: entry.description,
      })),
    )
    if (active.id === 'remote') void run((d, c) => recordAiUsage(d, c))
  }

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls?.map((l) => (l.id === id ? { ...l, ...patch } : l)) ?? null)

  const confirm = async () => {
    if (!lines?.length || busy) return
    const entries: ConfirmedEntry[] = []
    const errs: Issue[] = []
    lines.forEach((l, i) => {
      const parsed = parseMoney(l.amountText, data.settings.currency, data.settings.numberLocale)
      if (!parsed.ok) {
        errs.push({ path: `entries[${i}].amountMinor`, code: 'invalidAmount' })
        return
      }
      entries.push({ id: l.id, kind: l.kind, amountMinor: parsed.minor, date: l.date, accountId, categoryId: l.categoryId, note: l.note.trim() || undefined, merchant: l.entry.merchant, ...(l.receiptUri ? { receiptUri: l.receiptUri, source: 'photo' as const } : { source: 'ai_text' as const }) })
    })
    if (errs.length) {
      setIssues(errs)
      return
    }
    setBusy(true)
    const { result, saved } = await run((d, c) => saveConfirmedEntries(d, entries, c))
    setBusy(false)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? tn('assistant.recorded', entries.length) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    if (saved) leave(returnTo)
  }

  const toggleVoice = () => {
    if (!speech) return
    if (listening) {
      recognizer.current?.stop()
      return
    }
    const r = new speech()
    r.lang = { es: 'es-MX', en: 'en-CA', pt: 'pt-BR', fr: 'fr-CA' }[language]
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const transcript = Array.from(e.results, (res) => res[0]?.transcript ?? '').join(' ').trim()
      if (transcript) setText((prev) => (prev ? `${prev}\n${transcript}` : transcript))
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recognizer.current = r
    setListening(true)
    r.start()
  }

  const level = (c: number) => (c >= 0.7 ? 'high' : c >= 0.4 ? 'medium' : 'low')
  const lineError = (i: number, field: string) => issues.find((x) => x.path === `entries[${i}].${field}`)

  return (
    <div className="stack">
      <PageHeader title={t('assistant.title')} back={{ href: href(returnTo), label: t('common.back') }} />
      <p className="muted">{t('assistant.intro')}</p>
      <Card>
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void analyze()
          }}
        >
          {/* Varias líneas: un <input> convertía los saltos de línea en espacios y perdía movimientos (F1). */}
          <TextAreaField
            label={t('assistant.input')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void analyze()
              }
            }}
            placeholder={t('assistant.placeholder')}
            hint={t('assistant.inputHint')}
            rows={Math.min(10, Math.max(4, text.split('\n').length))}
            maxLength={4000}
            autoFocus
            data-testid="assistant-text"
          />
          {truncated > 0 && (
            <p className="note note--box" role="status" data-testid="assistant-truncated">
              {t('assistant.truncated', { max: MAX_PARSER_LINES, count: truncated })}
            </p>
          )}
          <div className="button-row">
            <PrimaryButton type="submit" icon="sparkles" disabled={busy || !text.trim()}>
              {t('assistant.analyze')}
            </PrimaryButton>
            {speech ? (
              <SecondaryButton icon="mic" onClick={toggleVoice} aria-pressed={listening}>
                {listening ? t('assistant.voiceStop') : t('assistant.voice')}
              </SecondaryButton>
            ) : null}
            <label className={`btn btn--secondary file-button${photoBusy ? ' is-disabled' : ''}`}>
              <Icon name="camera" size={18} />
              {photoBusy ? t('assistant.photoReading') : t('assistant.photo')}
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="sr-only" disabled={photoBusy} onChange={(e) => void onPhoto(e.target.files?.[0])} data-testid="photo-input" />
            </label>
            <TextButton
              onClick={() => {
                const example = t('assistant.exampleText')
                setText(example)
                void analyze(example)
              }}
            >
              {t('assistant.example')}
            </TextButton>
          </div>
          <p className="note">{provider.id === 'remote' ? t('assistant.remote', { endpoint: (import.meta.env as { VITE_AI_ENDPOINT?: string }).VITE_AI_ENDPOINT ?? '' }) : t('assistant.local')}</p>
          {provider.id === 'remote' && !gate('aiRemote', data.settings, { today, devMode: DEV_MODE }).allowed && <p className="note">{t('assistant.aiLimitReached')}</p>}
          {!speech && <p className="note">{t('assistant.voiceUnavailable')}</p>}
          <p className="note">{ocrAvailable() ? t('assistant.photoHint') : t('assistant.photoNoOcr')}</p>
          {speech && <p className="note">{t('assistant.voiceHint')}</p>}
        </form>
      </Card>

      {lines && lines.length === 0 && <Alert tone="warning" title={t('assistant.empty')} />}
      {lines && lines.length > 0 && (
        <Card labelledBy="preview-title">
          <h2 id="preview-title" className="card__title">
            {t('assistant.preview', { count: lines.length })}
          </h2>
          <p className="note">{t('assistant.previewHint')}</p>
          {data.accounts.length > 1 && <SelectField label={t('assistant.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)} options={data.accounts.map((a) => ({ value: a.id, label: a.name }))} />}
          <ul className="plain-list assistant__lines" data-testid="assistant-preview">
            {lines.map((l, i) => (
              <li key={l.id} className="assistant__line">
                <div className="assistant__head">
                  {l.receiptUri && <img className="receipt-thumb" src={l.receiptUri} alt={t('assistant.receiptAlt')} />}
                  <span className="muted">«{l.entry.raw}»</span>
                  <Badge tone={level(l.entry.confidence) === 'high' ? 'good' : level(l.entry.confidence) === 'medium' ? 'warning' : 'critical'} icon={level(l.entry.confidence) === 'high' ? 'checkCircle' : 'alert'}>
                    {t('assistant.confidence', { pct: `${fmt.percent(l.entry.confidence)} · ${t(`assistant.confidence.${level(l.entry.confidence)}` as MessageKey)}` })}
                  </Badge>
                </div>
                <Segmented legend={t('fields.kind')} name={`kind-${l.id}`} value={l.kind} onChange={(k) => update(l.id, { kind: k, categoryId: k === 'income' ? 'salary' : 'other_expense' })} options={[{ value: 'expense', label: t('txKind.expense') }, { value: 'income', label: t('txKind.income') }]} />
                <MoneyField label={t('fields.amount')} value={l.amountText} onChange={(v) => update(l.id, { amountText: v })} fmt={fmt} error={lineError(i, 'amountMinor') ? (moneyErrorMessage(t, parseMoney(l.amountText, data.settings.currency, data.settings.numberLocale)) ?? t('issue.invalidAmount')) : null} />
                <SelectField label={t('fields.category')} value={l.categoryId} onChange={(e) => update(l.id, { categoryId: e.target.value })} options={categories.filter((c) => c.kind === l.kind).map((c) => ({ value: c.id, label: c.name ?? categoryLabel(t, c.id) }))} />
                <TextField label={t('fields.date')} type="date" value={l.date} max={today} onChange={(e) => update(l.id, { date: e.target.value })} error={lineError(i, 'date') ? issueMessage(t, fmt, lineError(i, 'date')!) : undefined} />
                <TextField label={t('fields.noteOptional')} value={l.note} maxLength={120} onChange={(e) => update(l.id, { note: e.target.value })} />
                <ul className="bullets assistant__hints">
                  {l.entry.hints.map((h) => (
                    <li key={h}>{t(`assistant.hint.${h}` as MessageKey)}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <a className="btn btn--ghost btn--small" href={href(withQuery('/movimientos/nuevo', { kind: l.kind, amount: parseMoney(l.amountText, data.settings.currency, data.settings.numberLocale).ok ? (parseMoney(l.amountText, data.settings.currency, data.settings.numberLocale) as { minor: number }).minor : undefined, date: l.date, note: l.note, category: l.categoryId, account: accountId, returnTo: '/asistente' }))}>
                    {t('assistant.openForm')}
                  </a>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setLines((ls) => ls?.filter((x) => x.id !== l.id) ?? null)}>
                    <Icon name="x" size={16} />
                    {t('assistant.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {issues.some((x) => !/^entries\[\d+\]\.(amountMinor|date)$/.test(x.path)) && (
            <Alert tone="critical" title={t('common.fixErrors')} role="alert">
              <ul>
                {issues.map((x, k) => (
                  <li key={k}>
                    {x.path}: {issueMessage(t, fmt, x)}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          <p className="note">{t('assistant.allOrNothing')}</p>
          <p className="note">{t('assistant.noAi')}</p>
          <PrimaryButton large icon="check" onClick={() => void confirm()} disabled={busy || lines.length === 0}>
            {tn('assistant.record', lines.length)}
          </PrimaryButton>
        </Card>
      )}
      <p className="note">{t('assistant.usage', { count: data.settings.aiUsage?.month === today.slice(0, 7) ? data.settings.aiUsage.count : 0 })}</p>
    </div>
  )
}
