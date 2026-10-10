import { useRef, useState } from 'react'
import { localDateInTimeZone } from '../../../domain/dates'
import type { AppData } from '../../../domain/types'
import { useT } from '../../../i18n'
import { getStore } from '../../../state/store'
import { MAX_BACKUP_BYTES, parseBackup, type ImportIssue } from '../../../storage/backup'
import { decryptBackup, isEncryptedBackup, looksEncrypted } from '../../../storage/encryptedBackup'
import { Alert } from '../../components/common'
import { Icon } from '../../components/Icon'
import type { Formatter } from '../../format'
import { issueMessage } from '../../labels'
import { PassphraseDialog } from '../settings/PassphraseDialog'

type State =
  | { kind: 'idle' }
  | { kind: 'issues'; issues: ImportIssue[] }
  | { kind: 'encrypted'; text: string; error: string | null }
  | { kind: 'preview'; data: AppData; exportedAt: string | null }

/**
 * K4 · Restaurar una copia desde la bienvenida: en un navegador o una app instalada sin datos no
 * hace falta inventar una configuración para llegar a Ajustes. Valida TODO el archivo (igual que
 * Ajustes), enseña qué contiene y solo guarda al pulsar «Restaurar».
 */
export function WelcomeRestore({ fmt, timeZone }: { fmt: Formatter; timeZone: string }) {
  const { t } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)

  const parse = (text: string) => {
    const result = parseBackup(text)
    setState(result.ok ? { kind: 'preview', data: result.data, exportedAt: result.exportedAt } : { kind: 'issues', issues: result.issues })
  }

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) return setState({ kind: 'issues', issues: [{ path: 'file', code: 'tooLarge' }] })
    let text: string
    try {
      text = await file.text()
    } catch {
      return setState({ kind: 'issues', issues: [{ path: 'file', code: 'invalidJson' }] })
    }
    if (looksEncrypted(text)) return setState({ kind: 'encrypted', text, error: null })
    parse(text)
  }

  const openEncrypted = async (passphrase: string) => {
    if (state.kind !== 'encrypted') return
    let envelope: unknown = null
    try {
      envelope = JSON.parse(state.text)
    } catch {
      envelope = null
    }
    if (!isEncryptedBackup(envelope)) return setState({ kind: 'issues', issues: [{ path: 'file', code: 'notABackup' }] })
    const r = await decryptBackup(envelope, passphrase)
    if (!r.ok) return setState({ ...state, error: t(r.reason === 'unsupported' ? 'encrypted.unsupported' : r.reason === 'invalid' ? 'encrypted.invalid' : 'encrypted.wrong') })
    parse(r.json)
  }

  const restore = async () => {
    if (state.kind !== 'preview' || busy) return
    setBusy(true)
    const ok = await getStore().commit(state.data, { source: 'replace' })
    setBusy(false)
    if (!ok) setState({ kind: 'issues', issues: [{ path: 'file', code: 'notFound' }] })
  }

  return (
    <div className="stack-sm" data-testid="welcome-restore">
      <p className="note">{t('welcome.restore.hint')}</p>
      <button type="button" className="btn btn--ghost btn--large" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" />
        {t('welcome.restore.button')}
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="welcome-import-file" />
      {state.kind === 'issues' && (
        <Alert tone="critical" title={t('settings.backup.invalidTitle')} role="alert">
          <p>{t('settings.backup.invalidText')}</p>
          <ul>
            {state.issues.slice(0, 8).map((i, idx) => (
              <li key={idx}>
                {i.path !== 'file' ? <code>{i.path}</code> : null} {issueMessage(t, fmt, i)}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {state.kind === 'preview' && (
        <Alert
          tone="info"
          icon="checkCircle"
          title={t('welcome.restore.previewTitle')}
          actions={
            <>
              <button type="button" className="btn btn--small btn--primary" onClick={() => void restore()} disabled={busy}>
                {t('welcome.restore.confirm')}
              </button>
              <button type="button" className="btn btn--small btn--secondary" onClick={() => setState({ kind: 'idle' })}>
                {t('common.cancel')}
              </button>
            </>
          }
        >
          <p data-testid="welcome-restore-preview">
            {t('welcome.restore.previewText', {
              date: state.exportedAt ? fmt.date(localDateInTimeZone(new Date(state.exportedAt), timeZone)) : '—',
              movements: state.data.transactions.length,
              accounts: state.data.accounts.length,
            })}
          </p>
          {state.data.isDemo && <p>{t('welcome.restore.demo')}</p>}
        </Alert>
      )}
      {state.kind === 'encrypted' && <PassphraseDialog mode="decrypt" error={state.error} onClose={() => setState({ kind: 'idle' })} onSubmit={openEncrypted} />}
    </div>
  )
}
