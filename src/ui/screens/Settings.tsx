import { useEffect, useRef, useState } from 'react'
import { accountBalance } from '../../domain/balances'
import { detectTimeZone, todayInTimeZone } from '../../domain/dates'
import { newId } from '../../domain/ids'
import { changeCurrency, deleteAccount, saveAccount, updateSettings, type AccountDraft } from '../../domain/operations'
import { backupStatus, setBackupReminder } from '../../domain/backupReminder'
import type { Account, AccountKind, AppData, BackupReminder, BudgetPeriodType, CurrencyCode, DateStyle, Language, NumberLocale, Weekday } from '../../domain/types'
import { ACCOUNT_KINDS, BACKUP_REMINDERS, BUDGET_PERIOD_TYPES, DATE_STYLES, LANGUAGES, NUMBER_LOCALES, type Issue } from '../../domain/validation'
import { formatMoney } from '../../domain/money'
import { createDemoData } from '../../demo/demoData'
import { useT, type MessageKey } from '../../i18n'
import { GROUP_TITLE_KEY, SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settings/sections'
import { MAX_BACKUP_BYTES, parseBackup, performExport, type ImportIssue } from '../../storage/backup'
import { APP_VERSION, downloadText, useExportBackup, useVerifyBackup } from '../backupActions'
import { IndexedDbRepository } from '../../storage/indexedDbRepository'
import { nextFrame, ReadCancelled, readFileWithProgress } from '../readFile'
import { usePwaState } from '../../pwa/register'
import { useRun, useToday } from '../../state/hooks'
import { getStore, useAppState, useData } from '../../state/store'
import { Alert, Badge, Card, PageHeader } from '../components/common'
import { CheckboxField, MoneyField, Segmented, SelectField, TextField } from '../components/fields'
import { parseMoneyText, moneyErrorMessage } from '../moneyText'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { href } from '../router'
import { useToast } from '../components/toastContext'
import { UpdateBalanceDialog } from '../dialogs'
import { createFormatter, useFormat } from '../format'
import { fieldError, issueMessage } from '../labels'
import { CardFields, CardSummaryView } from '../cardUi'
import { useThemePreference } from '../theme'
import { parseCardFields, useCardFields, type CardErrors } from '../cardFields'
import { CategoriesSection } from './CategoriesSection'
import { NotificationsSection } from './NotificationsSection'
import { RulesSection } from './RulesSection'
import { PersonalizeSection } from './PersonalizeSection'
import { AssistantSection } from './settings/AssistantSection'
import { BackupsSection } from './settings/BackupsSection'
import { PassphraseDialog } from './settings/PassphraseDialog'
import { useEncryptedExport } from '../useEncryptedExport'
import { DEV_MODE } from './Pro'
import { aiUsagePercent, isPro } from '../../domain/featureGate'
import { decryptBackup, isEncryptedBackup, looksEncrypted } from '../../storage/encryptedBackup'
import { CurrencyDialog } from './settings/CurrencyDialog'
import { ExportSection } from './settings/ExportSection'
import { LockSection } from './settings/LockSection'
import { SafeToSpendSection } from './settings/SafeToSpendSection'
import { ScheduledSection } from './settings/ScheduledSection'
import { TagsSection } from './settings/TagsSection'
import { useLockState } from '../lock/lockContext'
import { localBackups } from '../useAutoBackup'
import { currencyName } from '../../domain/formatters'
import { getPeriod } from '../../domain/periods'
import { periodLabel } from '../periodLabel'
import { CategoryChip } from '../components/base'

/** Enlace de contacto solo si se configuró al compilar; sin dirección real no se muestra un botón que no funciona. */
const CONTACT_URL = typeof import.meta.env.VITE_CONTACT_URL === 'string' && /^(https?:|mailto:)/.test(import.meta.env.VITE_CONTACT_URL) ? import.meta.env.VITE_CONTACT_URL : null
const BUILD_ID = import.meta.env.MODE === 'production' ? (import.meta.env.VITE_BUILD_ID ?? 'local') : import.meta.env.MODE

const LANGUAGE_FLAGS: Record<string, string> = { es: '🇪🇸', en: '🇬🇧', pt: '🇧🇷', fr: '🇫🇷' }

const COMMON_TIME_ZONES = [
  'America/Toronto',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
]

export function Settings() {
  const [theme, setTheme] = useThemePreference()
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const state = useAppState()
  const run = useRun()
  const toast = useToast()
  const today = useToday()
  const [accountDialog, setAccountDialog] = useState<Account | 'new' | null>(null)
  const [balanceFor, setBalanceFor] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{ stage: 'reading' | 'validating'; loaded: number; total: number } | null>(null)
  const importAbort = useRef<AbortController | null>(null)
  const [importState, setImportState] = useState<{ issues: ImportIssue[] } | { data: AppData; exportedAt: string | null; withoutReceipts: boolean } | null>(null)
  const [confirm, setConfirm] = useState<'resetDemo' | 'clearAll' | 'leaveDemo' | null>(null)
  const [understood, setUnderstood] = useState(false)
  const [typed, setTyped] = useState('')
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [encryptOpen, setEncryptOpen] = useState(false)
  const [decrypting, setDecrypting] = useState<{ text: string; error: string | null } | null>(null)
  const exportEncrypted = useEncryptedExport()
  const proActive = isPro(data.settings, { devMode: DEV_MODE })
  const aiPct = aiUsagePercent(data.settings, { today, devMode: DEV_MODE })
  const lock = useLockState()
  const fileRef = useRef<HTMLInputElement>(null)
  const pwa = usePwaState()

  const detected = detectTimeZone()
  const zones = Array.from(new Set([data.settings.timeZone, detected, ...COMMON_TIME_ZONES]))

  const setSetting = async (patch: Parameters<typeof updateSettings>[1]) => {
    const { saved } = await run((d, c) => updateSettings(d, patch, c))
    toast({ message: saved ? t('settings.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  const exportData = useExportBackup()
  // Copia ligera sin fotos: no se registra como copia de seguridad, porque restaurarla las perdería.
  const exportWithoutReceipts = () => {
    const result = performExport(data, new Date(), APP_VERSION, downloadText, { withoutReceipts: true })
    toast({ message: t(result.ok ? 'backup.lightExported' : 'backup.exportFailed'), tone: result.ok ? 'info' : 'critical' })
  }
  const verifyBackup = useVerifyBackup()
  const verifyRef = useRef<HTMLInputElement>(null)
  const [verifyIssues, setVerifyIssues] = useState<ImportIssue[] | null>(null)
  const backup = backupStatus(data, today)
  // Los recibos son imágenes guardadas dentro de cada movimiento: viajan en la copia y la agrandan.
  const receipts = data.transactions.filter((tx) => tx.receiptUri)
  const receiptBytes = receipts.reduce((sum, tx) => sum + (tx.receiptUri?.length ?? 0), 0)

  const onVerifyFile = async (file: File | undefined) => {
    if (verifyRef.current) verifyRef.current.value = ''
    if (!file) return
    const r = await verifyBackup(file)
    setVerifyIssues(r.ok ? null : r.issues)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setImportState({ issues: [{ path: 'file', code: 'tooLarge' }] })
      return
    }
    const controller = new AbortController()
    importAbort.current = controller
    setImportProgress({ stage: 'reading', loaded: 0, total: file.size })
    try {
      const text = await readFileWithProgress(file, (loaded, total) => setImportProgress({ stage: 'reading', loaded, total }), controller.signal)
      setImportProgress({ stage: 'validating', loaded: file.size, total: file.size })
      await nextFrame()
      if (controller.signal.aborted) throw new ReadCancelled()
      if (looksEncrypted(text)) {
        // Copia cifrada: se pide la frase y se valida después, igual que cualquier importación.
        setDecrypting({ text, error: null })
        return
      }
      const result = parseBackup(text)
      if (controller.signal.aborted) throw new ReadCancelled()
      setImportState(result.ok ? { data: result.data, exportedAt: result.exportedAt, withoutReceipts: result.withoutReceipts } : { issues: result.issues })
    } catch (e) {
      // Cancelar: no se aplica nada; los datos siguen como estaban.
      if (e instanceof ReadCancelled) toast({ message: t('settings.backup.importCancelled'), tone: 'info' })
      else setImportState({ issues: [{ path: 'file', code: 'invalidJson' }] })
    } finally {
      importAbort.current = null
      setImportProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const openEncrypted = async (passphrase: string) => {
    if (!decrypting) return
    let envelope: unknown
    try {
      envelope = JSON.parse(decrypting.text)
    } catch {
      envelope = null
    }
    if (!isEncryptedBackup(envelope)) {
      setDecrypting(null)
      setImportState({ issues: [{ path: 'file', code: 'notABackup' }] })
      return
    }
    const r = await decryptBackup(envelope, passphrase)
    if (!r.ok) {
      setDecrypting({ ...decrypting, error: t(r.reason === 'unsupported' ? 'encrypted.unsupported' : 'encrypted.wrong') })
      return
    }
    setDecrypting(null)
    const result = parseBackup(r.json)
    setImportState(result.ok ? { data: result.data, exportedAt: result.exportedAt, withoutReceipts: result.withoutReceipts } : { issues: result.issues })
  }

  const applyImport = async () => {
    if (!importState || !('data' in importState)) return
    // Se conserva en memoria lo que había para poder deshacer la importación.
    const previous = getStore().data
    const ok = await getStore().commit(importState.data, { source: 'replace' })
    setImportState(null)
    toast({
      message: ok ? t('settings.backup.imported') : t('save.error.generic'),
      tone: ok ? 'good' : 'critical',
      ...(ok && previous
        ? {
            action: {
              label: t('common.undo'),
              onClick: async () => {
                const undone = await getStore().commit(previous, { source: 'replace' })
                toast({ message: undone ? t('settings.backup.importUndone') : t('save.error.generic'), tone: undone ? 'good' : 'critical' })
              },
            },
          }
        : {}),
    })
  }

  const resetDemo = async () => {
    const demo = createDemoData({ now: new Date(), timeZone: data.settings.timeZone, currency: 'CAD', language: data.settings.language })
    const ok = await getStore().commit(demo, { source: 'replace' })
    setConfirm(null)
    toast({ message: ok ? t('settings.demo.resetDone') : t('save.error.generic'), tone: ok ? 'good' : 'critical' })
  }

  const clearAll = async () => {
    setConfirm(null)
    // Copia local antes de borrar (operación crítica): si no se puede, igual se borra porque la persona lo confirmó dos veces.
    try {
      if (!data.isDemo) await localBackups()?.save(data, 'beforeDelete', new Date(), APP_VERSION)
    } catch {
      // Sin espacio o sin IndexedDB: la copia exportable ya se ofreció en el diálogo.
    }
    await getStore().clearAll()
  }

  const pickCurrency = async (code: CurrencyCode) => {
    setCurrencyOpen(false)
    const { result, saved } = await run((d, c) => changeCurrency(d, code, c))
    if (!result.ok) {
      toast({ message: t('currency.blocked'), tone: 'critical' })
      return
    }
    if (!result.unchanged) toast({ message: saved ? t('currency.changed', { code }) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }
  const canChangeCurrency = data.transactions.length === 0 && data.trash.length === 0 && data.schedules.length === 0 && data.goals.length === 0 && data.plans.length === 0 && data.periodBudgets.length === 0 && !data.favorites.some((f) => f.amountMinor !== undefined)
  const currentPeriod = data.settings.budgetPeriod?.type && data.settings.budgetPeriod.type !== 'untilIncome' ? getPeriod(data.settings.budgetPeriod, today) : null

  const sample = createFormatter({ ...data.settings })
  return (
    <div className="stack">
      <PageHeader title={t('settings.title')} />
      <nav className="settings-toc card" aria-label={t('settings.toc')}>
        {SETTINGS_GROUPS.map((group) => (
          <div key={group}>
            <p className="settings-toc__group">{t(GROUP_TITLE_KEY[group])}</p>
            <ul>
              {SETTINGS_SECTIONS.filter((x) => x.group === group).map((x) => (
                <li key={x.id}>
                  <a href={href(x.href ?? `/ajustes?seccion=${x.id}`)}>{t(x.titleKey)}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <Card labelledBy="account-card-title" className="account-card">
        <h2 id="account-card-title" className="card__title">
          {data.profile.isGuest ? t('account.guestTitle') : (data.profile.displayName ?? data.profile.email ?? t('account.title'))}
        </h2>
        <p className="note">{t('account.cardText')}</p>
        <a className="btn btn--secondary btn--small" href={href('/cuenta')} data-testid="account-link">
          <Icon name="user" size={16} />
          {t('account.open')}
        </a>
      </Card>

      {!proActive && (
        <Card labelledBy="pro-card-title" className="pro-card">
          <h2 id="pro-card-title" className="card__title">
            {t('pro.cardTitle')}
          </h2>
          <p className="note">{t('pro.cardText')}</p>
          <p className="item__meta" data-testid="ai-usage">{t('pro.aiUsagePct', { pct: aiPct })}</p>
          <a className="btn btn--secondary btn--small" href={href('/pro')}>
            <Icon name="sparkles" size={16} />
            {t('pro.discover')}
          </a>
        </Card>
      )}

      <Card labelledBy="formato">
        <h2 id="formato" className="card__title">
          {t('settings.format.title')}
        </h2>
        <Segmented
          legend={t('settings.theme.label')}
          name="theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('settings.theme.system') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
          ]}
          hint={t('settings.theme.hint')}
        />
        <SelectField
          label={t('settings.format.number')}
          value={data.settings.numberLocale}
          onChange={(e) => void setSetting({ numberLocale: e.target.value as NumberLocale })}
          options={NUMBER_LOCALES.map((l) => ({ value: l, label: `${formatMoney(123456, data.settings.currency, l)} (${t(`settings.format.locale.${l}` as MessageKey)})` }))}
        />
        <SelectField
          label={t('settings.format.date')}
          value={data.settings.dateStyle}
          onChange={(e) => void setSetting({ dateStyle: e.target.value as DateStyle })}
          options={DATE_STYLES.map((s) => ({ value: s, label: createFormatter({ ...data.settings, dateStyle: s }).date(today) }))}
        />
        <SelectField
          label={t('settings.format.timeZone')}
          value={data.settings.timeZone}
          onChange={(e) => void setSetting({ timeZone: e.target.value })}
          options={zones.map((z) => ({ value: z, label: z === detected ? t('settings.format.detected', { zone: z }) : z }))}
          hint={t('settings.format.timeZoneHint', { today: sample.date(todayInTimeZone(data.settings.timeZone)) })}
        />
        <SelectField
          label={t('settings.period.label')}
          value={data.settings.budgetPeriod?.type ?? 'untilIncome'}
          onChange={(e) => void setSetting({ budgetPeriod: { ...(data.settings.budgetPeriod ?? { weekStartsOn: 1 }), type: e.target.value as BudgetPeriodType } })}
          options={BUDGET_PERIOD_TYPES.map((p) => ({ value: p, label: t(`period.type.${p}` as MessageKey) }))}
          hint={t('settings.period.hint')}
        />
        {data.settings.budgetPeriod?.type === 'week' && (
          <SelectField
            label={t('settings.period.weekStart')}
            value={String(data.settings.budgetPeriod.weekStartsOn)}
            onChange={(e) => void setSetting({ budgetPeriod: { ...data.settings.budgetPeriod, weekStartsOn: Number(e.target.value) as Weekday } })}
            options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: sample.weekdayShort(`2026-09-${27 + d}`) }))}
          />
        )}
        {data.settings.budgetPeriod?.type === 'custom' && (
          <>
            <TextField label={t('settings.period.customStart')} type="date" value={data.settings.budgetPeriod.customStart ?? ''} onChange={(e) => void setSetting({ budgetPeriod: { ...data.settings.budgetPeriod, customStart: e.target.value } })} />
            <TextField label={t('settings.period.customEnd')} type="date" value={data.settings.budgetPeriod.customEnd ?? ''} onChange={(e) => void setSetting({ budgetPeriod: { ...data.settings.budgetPeriod, customEnd: e.target.value } })} />
          </>
        )}
        {currentPeriod && (
          <p className="note note--box" data-testid="current-period">
            {t('settings.period.current', { label: periodLabel(t, fmt, currentPeriod), from: fmt.date(currentPeriod.start, { compact: true, today }), to: fmt.date(currentPeriod.end, { compact: true, today }) })}
          </p>
        )}
        {data.settings.budgetPeriod?.type !== 'untilIncome' && (
          <CheckboxField label={t('settings.period.carryOver')} hint={t('settings.period.carryOverHint')} checked={data.settings.carryOverBalance !== false} onChange={(v) => void setSetting({ carryOverBalance: v })} />
        )}
        <div className="field">
          <p className="field__label">{t('settings.currency.label')}</p>
          <p>
            <strong>{data.settings.currency}</strong> · {currencyName(data.settings.currency, data.settings.numberLocale)} · {sample.money(123456)}
          </p>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setCurrencyOpen(true)} data-testid="change-currency">
            <Icon name="coins" size={16} />
            {t('currency.change')}
          </button>
          <p className="field__hint">{canChangeCurrency ? t('currency.canChange') : t('settings.currency.hint')}</p>
        </div>
        <fieldset className="field">
          <legend className="field__label">{t('settings.language.label')}</legend>
          <div className="chip-wrap" data-testid="language-chips">
            {LANGUAGES.map((l) => (
              <CategoryChip key={l} label={`${LANGUAGE_FLAGS[l]} ${t(`settings.language.${l}` as MessageKey)}`} icon="globe" color="sky" selected={data.settings.language === l} onClick={() => void setSetting({ language: l as Language })} />
            ))}
          </div>
          <p className="field__hint">{t('settings.language.hint')}</p>
        </fieldset>
      </Card>

      <PersonalizeSection />

      <Card labelledBy="accounts-title">
        <h2 id="cuentas" className="card__title">
          <span id="accounts-title">{t('settings.accounts.title')}</span>
        </h2>
        <ul className="item-list">
          {data.accounts.map((a) => {
            const b = accountBalance(data, a)
            return (
              <li key={a.id} className="item item--stacked">
                <div className="item__row">
                  <div className="item__main">
                    <p className="item__title">{a.name}</p>
                    <p className="item__meta">
                      {t(`accountKind.${a.kind}` as MessageKey)} · {t('settings.accounts.updated', { when: fmt.timestamp(a.anchor.setAt) })}
                    </p>
                    <p className="item__badges">
                      <Badge tone={a.includeInBudget ? 'info' : 'neutral'}>{t(a.includeInBudget ? 'settings.accounts.included' : 'settings.accounts.excluded')}</Badge>
                    </p>
                  </div>
                  <p className="item__amount">
                    {a.kind === 'credit'
                      ? b.balanceMinor <= 0
                        ? t('settings.accounts.debt', { amount: fmt.money(-b.balanceMinor) })
                        : t('settings.accounts.creditInFavor', { amount: fmt.money(b.balanceMinor) })
                      : fmt.money(b.balanceMinor)}
                  </p>
                </div>
                {a.kind === 'credit' && <CardSummaryView account={a} fmt={fmt} />}
                <div className="item__actions">
                  <button type="button" className="btn btn--small btn--secondary" onClick={() => setBalanceFor(a.id)}>
                    {t('home.updateBalance')}
                    <span className="sr-only">: {a.name}</span>
                  </button>
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => setAccountDialog(a)}>
                    <Icon name="edit" size={16} />
                    {t('common.edit')}
                    <span className="sr-only">: {a.name}</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <button type="button" className="btn btn--secondary" onClick={() => setAccountDialog('new')}>
          <Icon name="plus" />
          {t('settings.accounts.add')}
        </button>
        <Alert tone="neutral" icon="lock" title={t('settings.accounts.cardsTitle')}>
          {t('settings.accounts.cardsText')}
        </Alert>
      </Card>

      <CategoriesSection />
      <RulesSection />
      <TagsSection />
      <ScheduledSection />
      <SafeToSpendSection />
      <BackupsSection />

      <Card labelledBy="backup-title">
        <h2 id="copia" className="card__title">
          <span id="backup-title">{t('settings.backup.title')}</span>
        </h2>
        <p>{t('settings.backup.text')}</p>
        <Alert tone="neutral" icon="shield" title={t('backup.localNotBackup')} />
        <div className="backup-status" data-testid="backup-status">
          <p className="field__label">{t('backup.statusTitle')}</p>
          <ul className="bullets">
            {backup.neverExported ? (
              <li>
                <strong>{t('backup.neverExported')}</strong>
              </li>
            ) : (
              <li>
                {t('backup.lastExport', { when: fmt.timestamp(backup.lastExportAt!) })}
                <br />
                <span className="muted">{t('backup.lastExportNote')}</span>
              </li>
            )}
            <li>{backup.hasUnbackedChanges ? t('backup.unbacked') : t('backup.upToDate')}</li>
            <li>
              {backup.lastVerifiedAt
                ? t('backup.verified', { exported: backup.verifiedExportedAt ? fmt.timestamp(backup.verifiedExportedAt) : '—', when: fmt.timestamp(backup.lastVerifiedAt) })
                : t('backup.notVerified')}
              {backup.lastVerifiedAt && backup.latestExportUnverified ? ` ${t('backup.latestUnverified')}` : ''}
            </li>
            {receipts.length > 0 && (
              <li data-testid="backup-receipts">{t('backup.receipts', { count: receipts.length, size: receiptBytes >= 1048576 ? `${(receiptBytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(receiptBytes / 1024))} KB` })}</li>
            )}
            {backup.snoozedUntil && backup.snoozedUntil > today ? (
              <li>{t('backup.snoozedUntil', { date: fmt.date(backup.snoozedUntil) })}</li>
            ) : backup.dueDate && !data.isDemo ? (
              <li>{t('backup.nextDue', { date: fmt.date(backup.dueDate < today ? today : backup.dueDate) })}</li>
            ) : null}
          </ul>
        </div>
        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={() => void exportData()}>
            <Icon name="download" />
            {t('settings.backup.export')}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => setEncryptOpen(true)}>
            <Icon name="lock" />
            {t('encrypted.export')}
          </button>
          {receipts.length > 0 && (
            <button type="button" className="btn btn--secondary" onClick={exportWithoutReceipts} aria-describedby="backup-light-hint" data-testid="export-without-receipts">
              <Icon name="download" />
              {t('backup.exportWithoutReceipts')}
            </button>
          )}
          <label className="btn btn--secondary file-button">
            <Icon name="shield" />
            {t('backup.verify')}
            <input ref={verifyRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onVerifyFile(e.target.files?.[0])} data-testid="verify-file" />
          </label>
          <label className="btn btn--secondary file-button">
            <Icon name="upload" />
            {t('settings.backup.import')}
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="import-file" />
          </label>
        </div>
        {receipts.length > 0 && (
          <p className="field__hint" id="backup-light-hint">
            {t('backup.lightHint')}
          </p>
        )}
        {importProgress && (
          <div className="stack-sm" role="status" data-testid="import-progress">
            <p>
              {importProgress.stage === 'reading'
                ? t('settings.backup.importReading', { pct: Math.floor((importProgress.loaded / Math.max(1, importProgress.total)) * 100), mb: (importProgress.total / 1048576).toFixed(1) })
                : t('settings.backup.importValidating')}
            </p>
            <progress max={importProgress.total || 1} value={importProgress.stage === 'reading' ? importProgress.loaded : undefined} aria-label={t('settings.backup.importProgress')} />
            <button type="button" className="btn btn--secondary btn--small" onClick={() => importAbort.current?.abort()}>
              {t('common.cancel')}
            </button>
          </div>
        )}
        <p className="note">{t('backup.verifyHint')}</p>
        {verifyIssues && (
          <Alert tone="critical" title={t('backup.verifyFailed')} role="alert">
            <ul>
              {verifyIssues.slice(0, 5).map((i, idx) => (
                <li key={idx}>{issueMessage(t, fmt, i)}</li>
              ))}
            </ul>
          </Alert>
        )}
        <SelectField
          label={t('backup.reminder')}
          value={data.backup.reminder}
          onChange={(e) => void run((d) => setBackupReminder(d, e.target.value as BackupReminder))}
          options={BACKUP_REMINDERS.map((r) => ({ value: r, label: t(`backup.reminder.${r}` as MessageKey) }))}
          hint={t('backup.reminderHint')}
        />
        <p className="note">{t('settings.backup.importNote')}</p>
        {importState && 'issues' in importState && (
          <Alert tone="critical" title={t('settings.backup.invalidTitle')} role="alert">
            <p>{t('settings.backup.invalidText')}</p>
            <ul>
              {importState.issues.slice(0, 8).map((i, idx) => (
                <li key={idx}>
                  {i.path !== 'file' ? <code>{i.path}</code> : null} {issueMessage(t, fmt, i)}
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </Card>

      <Card labelledBy="almacenamiento">
        <h2 id="almacenamiento" className="card__title">
          {t('settings.storage.title')}
        </h2>
        {state.phase === 'ready' && state.storage === 'memory' && <Alert tone="critical" title={t('shell.memoryTitle')}>{t('shell.memoryText')}</Alert>}
        <ul className="bullets">
          <li>{t('settings.storage.local')}</li>
          {getStore().backend !== 'memory' && <li data-testid="storage-backend">{t(getStore().backend === 'indexeddb' ? 'settings.storage.backend.indexeddb' : 'settings.storage.backend.localStorage')}</li>}
          <li>{t('settings.storage.lost')}</li>
          <li>{t('settings.storage.noSync')}</li>
          <li>{t('settings.storage.eviction')}</li>
          <li>{t('settings.storage.notEncrypted')}</li>
          <li>{t(pwa.offlineReady ? 'settings.storage.offlineReady' : 'settings.storage.offlineNotReady')}</li>
          <li>{t('settings.storage.noAccount')}</li>
          <li>{t('settings.storage.noBank')}</li>
          <li>{t('settings.storage.noAi')}</li>
        </ul>
        <PersistentStorage />
        <OriginCopy />
        <p className="note">{t('history.openHint')}</p>
        <a className="btn btn--secondary" href={href('/ajustes/historial')}>
          <Icon name="clock" size={18} />
          {t('history.open')}
        </a>
      </Card>

      {lock && <LockSection lock={lock} />}
      <ExportSection />
      <NotificationsSection />
      <AssistantSection />

      <Card labelledBy="formulas-title">
        <h2 id="formulas" className="card__title">
          <span id="formulas-title">{t('settings.formulas.title')}</span>
        </h2>
        <ul className="bullets">
          <li>{t('settings.formulas.available')}</li>
          <li>{t('settings.formulas.period')}</li>
          <li>{t('settings.formulas.daily')}</li>
          <li>{t('settings.formulas.balance')}</li>
          <li>{t('settings.formulas.paid')}</li>
          <li>{t('settings.formulas.transfer')}</li>
          <li>{t('settings.formulas.monthEnd')}</li>
          <li>{t('settings.formulas.rounding')}</li>
        </ul>
      </Card>

      <Card labelledBy="reinicio">
        <h2 id="reinicio" className="card__title">
          {t('settings.reset.title')}
        </h2>
        {data.isDemo ? (
          <div className="button-row">
            <button type="button" className="btn btn--secondary" onClick={() => setConfirm('resetDemo')}>
              {t('settings.demo.reset')}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setConfirm('leaveDemo')}>
              {t('shell.leaveDemo')}
            </button>
          </div>
        ) : (
          <p className="note">{t('settings.reset.noDemo')}</p>
        )}
        <button
          type="button"
          className="btn btn--danger-ghost"
          onClick={() => {
            setUnderstood(false)
            setTyped('')
            setConfirm('clearAll')
          }}
        >
          <Icon name="trash" />
          {t('settings.reset.clearAll')}
        </button>
      </Card>

      <Card labelledBy="atajos">
        <h2 id="atajos" className="card__title">
          {t('settings.shortcuts.title')}
        </h2>
        <ul className="bullets kbd-list">
          <li>
            <kbd>N</kbd> {t('settings.shortcuts.new')}
          </li>
          <li>
            <kbd>/</kbd> {t('settings.shortcuts.search')}
          </li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd> {t('settings.shortcuts.save')}
          </li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> {t('settings.shortcuts.saveNew')}
          </li>
        </ul>
        <p className="note">{t('settings.shortcuts.note')}</p>
      </Card>

      <Card labelledBy="legal-title">
        <h2 id="legal" className="card__title">
          <span id="legal-title">{t('legal.title')}</span>
        </h2>
        <p className="link-row">
          <a href={href('/legal/terminos')}>{t('legal.terms.title')}</a>
          <a href={href('/legal/privacidad')}>{t('legal.privacy.title')}</a>
        </p>
      </Card>

      <Card labelledBy="acerca">
        <h2 id="acerca" className="card__title">
          {t('settings.about.title')}
        </h2>
        <p>{t('settings.about.text', { version: APP_VERSION })}</p>
        <p className="item__meta">{t('settings.about.build', { build: BUILD_ID })}</p>
        {CONTACT_URL ? (
          <a className="btn btn--secondary btn--small" href={CONTACT_URL} target="_blank" rel="noreferrer">
            {t('settings.about.contact')}
          </a>
        ) : (
          <p className="note">{t('settings.about.noContact')}</p>
        )}
      </Card>

      {encryptOpen && (
        <PassphraseDialog
          mode="encrypt"
          onClose={() => setEncryptOpen(false)}
          onSubmit={async (p) => {
            if (await exportEncrypted(p)) setEncryptOpen(false)
          }}
        />
      )}
      {decrypting && <PassphraseDialog mode="decrypt" error={decrypting.error} onClose={() => setDecrypting(null)} onSubmit={openEncrypted} />}
      {currencyOpen && <CurrencyDialog current={data.settings.currency} locale={data.settings.numberLocale} onPick={(code) => void pickCurrency(code)} onClose={() => setCurrencyOpen(false)} />}
      {accountDialog && <AccountDialog account={accountDialog === 'new' ? null : accountDialog} onClose={() => setAccountDialog(null)} />}
      {balanceFor && <UpdateBalanceDialog initialAccountId={balanceFor} onClose={() => setBalanceFor(null)} />}

      <ConfirmDialog
        open={!!importState && 'data' in importState}
        title={t('settings.backup.confirmTitle')}
        confirmLabel={t('settings.backup.confirm')}
        onConfirm={() => void applyImport()}
        onCancel={() => setImportState(null)}
        destructive
      >
        {importState && 'data' in importState && (
          <>
            <p>{t('settings.backup.confirmText')}</p>
            <ul className="bullets">
              {importState.exportedAt && <li>{t('settings.backup.summaryDate', { when: fmt.timestamp(importState.exportedAt) })}</li>}
              <li>{t('settings.backup.summaryCurrency', { currency: importState.data.settings.currency })}</li>
              <li>
                {t('settings.backup.summaryCounts', {
                  accounts: importState.data.accounts.length,
                  movements: importState.data.transactions.length,
                  schedules: importState.data.schedules.length,
                  goals: importState.data.goals.length,
                })}
              </li>
              {importState.data.isDemo && <li>{t('settings.backup.summaryDemo')}</li>}
              {importState.withoutReceipts && <li data-testid="import-no-receipts">{t('settings.backup.summaryNoReceipts')}</li>}
            </ul>
            <p className="note">{t('settings.backup.confirmHint')}</p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={confirm === 'resetDemo'} title={t('settings.demo.resetTitle')} confirmLabel={t('settings.demo.reset')} onConfirm={() => void resetDemo()} onCancel={() => setConfirm(null)} destructive>
        <p>{t('settings.demo.resetText')}</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'leaveDemo'} title={t('shell.leaveDemoTitle')} confirmLabel={t('shell.leaveDemo')} onConfirm={() => void clearAll()} onCancel={() => setConfirm(null)}>
        <p>{t('shell.leaveDemoText')}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'clearAll'}
        title={t('settings.reset.clearTitle')}
        confirmLabel={t('settings.reset.clearConfirm')}
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirm(null)}
        destructive
        confirmDisabled={!understood || typed.trim().toLocaleUpperCase() !== t('settings.reset.word').toLocaleUpperCase()}
      >
        <p>{t('settings.reset.clearText')}</p>
        <p className="note">{data.isDemo ? t('settings.reset.demoNote') : t('settings.reset.localCopyNote')}</p>
        <CheckboxField checked={understood} onChange={setUnderstood} label={t('settings.reset.understand')} />
        <TextField label={t('settings.reset.typeWord', { word: t('settings.reset.word') })} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </ConfirmDialog>
    </div>
  )
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  const today = useToday()
  const [id] = useState(() => account?.id ?? newId())
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank')
  const [include, setInclude] = useState(account?.includeInBudget ?? true)
  const [balanceText, setBalanceText] = useState('')
  const [issues, setIssues] = useState<Issue[]>([])
  const [amountError, setAmountError] = useState<string | null>(null)
  const [cardText, setCardText] = useCardFields(account?.card, fmt)
  const [cardErrors, setCardErrors] = useState<CardErrors>({})

  const submit = async () => {
    let card: AccountDraft['card']
    if (kind === 'credit') {
      const parsed = parseCardFields(cardText, fmt, t)
      setCardErrors(parsed.errors)
      if (!parsed.card) return
      card = parsed.card
    }
    let openingBalanceMinor: number | undefined
    if (!account) {
      const parsed = parseMoneyText(balanceText || '0', fmt, { allowNegative: true, allowZero: true })
      setAmountError(moneyErrorMessage(t, parsed))
      if (!parsed.ok) return
      // En una tarjeta se escribe lo que se debe; se guarda como saldo negativo.
      openingBalanceMinor = kind === 'credit' ? (parsed.minor === 0 ? 0 : -parsed.minor) : parsed.minor
    }
    const draft: AccountDraft = { id, name, kind, includeInBudget: include, openingBalanceMinor, openingDate: today, card }
    const { result, saved } = await run((d, c) => saveAccount(d, draft, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('settings.accounts.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  const remove = async () => {
    if (!account) return
    const { result, saved } = await run((d, c) => deleteAccount(d, account.id, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('settings.accounts.deleted') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  const generalIssue = issues.find((i) => i.path === 'id' || i.path === 'includeInBudget' || i.path === 'kind')
  return (
    <Dialog
      open
      onClose={onClose}
      title={account ? t('settings.accounts.editTitle') : t('settings.accounts.newTitle')}
      onSubmit={() => void submit()}
      footer={
        <>
          {account && (
            <button type="button" className="btn btn--danger-ghost" onClick={() => void remove()}>
              {t('common.delete')}
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <TextField label={t('fields.name')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} error={fieldError(t, fmt, issues, 'name')} required />
      <SelectField label={t('settings.accounts.kind')} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} options={ACCOUNT_KINDS.map((k) => ({ value: k, label: t(`accountKind.${k}` as MessageKey) }))} hint={t('settings.accounts.kindHint')} />
      <CheckboxField
        checked={include}
        onChange={setInclude}
        label={t('settings.accounts.includeLabel')}
        hint={kind === 'credit' ? t('settings.accounts.creditIncludeHint') : t('settings.accounts.includeHint')}
      />
      {!account && (
        <MoneyField
          label={kind === 'credit' ? t('settings.accounts.debtLabel') : t('settings.accounts.openingBalance')}
          hint={kind === 'credit' ? t('settings.accounts.debtHint') : t('settings.accounts.openingHint')}
          value={balanceText}
          onChange={setBalanceText}
          error={amountError}
          fmt={fmt}
        />
      )}
      {kind === 'credit' && <CardFields value={cardText} onChange={setCardText} errors={cardErrors} fmt={fmt} />}
      {generalIssue && <Alert tone="critical" title={issueMessage(t, fmt, generalIssue)} role="alert" />}
    </Dialog>
  )
}

type PersistState = 'unsupported' | 'granted' | 'notGranted' | 'checking'

/**
 * Pedir al navegador que no borre los datos del sitio por falta de espacio
 * (`navigator.storage.persist`). Es una función estándar del navegador, sin servicios
 * externos. El navegador decide; reduce el riesgo pero no lo elimina.
 */
function PersistentStorage() {
  const { t } = useT()
  const supported = typeof navigator !== 'undefined' && !!navigator.storage?.persisted && !!navigator.storage.persist
  const [status, setStatus] = useState<PersistState>(supported ? 'checking' : 'unsupported')
  useEffect(() => {
    if (!supported) return
    let alive = true
    navigator.storage
      .persisted()
      .then((p) => alive && setStatus(p ? 'granted' : 'notGranted'))
      .catch(() => alive && setStatus('unsupported'))
    return () => {
      alive = false
    }
  }, [supported])
  if (status === 'checking') return null
  return (
    <div className="stack-sm" data-testid="persist-storage">
      <p>
        <Icon name={status === 'granted' ? 'check' : 'info'} size={16} /> {t(`settings.storage.persist.${status}` as 'settings.storage.persist.granted')}
      </p>
      {status === 'notGranted' && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={async () => {
            const granted = await navigator.storage.persist().catch(() => false)
            setStatus(granted ? 'granted' : 'notGranted')
          }}
        >
          {t('settings.storage.persist.request')}
        </button>
      )}
    </div>
  )
}

/**
 * Copia de los datos tal como estaban en localStorage antes de pasar a IndexedDB. Se conserva
 * hasta que la persona decida eliminarla (no se borra sola).
 */
function OriginCopy() {
  const { t } = useT()
  const toast = useToast()
  const [copy, setCopy] = useState(() => IndexedDbRepository.readOriginCopy())
  const [confirming, setConfirming] = useState(false)
  if (!copy) return null
  return (
    <div className="stack-sm" data-testid="origin-copy">
      <p>
        <Icon name="info" size={16} /> {t('settings.storage.originCopy', { size: (copy.length / 1024 / 1024).toFixed(2) })}
      </p>
      <div className="button-row">
        <button type="button" className="btn btn--secondary btn--small" onClick={() => downloadText('clara-datos-anteriores-a-indexeddb.json', copy)}>
          <Icon name="download" size={16} />
          {t('settings.storage.originDownload')}
        </button>
        <button type="button" className="btn btn--danger-ghost btn--small" onClick={() => setConfirming(true)}>
          {t('settings.storage.originDelete')}
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('settings.storage.originDeleteTitle')}
        confirmLabel={t('settings.storage.originDelete')}
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          IndexedDbRepository.deleteOriginCopy()
          setCopy(null)
          setConfirming(false)
          toast({ message: t('settings.storage.originDeleted'), tone: 'good' })
        }}
      >
        <p>{t('settings.storage.originDeleteText')}</p>
      </ConfirmDialog>
    </div>
  )
}
