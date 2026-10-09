/** Frase para cifrar o abrir una copia cifrada. Nunca se guarda. */
import { useState } from 'react'
import { MIN_PASSPHRASE } from '../../../storage/encryptedBackup'
import { useT } from '../../../i18n'
import { Dialog } from '../../components/Dialog'
import { TextField } from '../../components/fields'

export function PassphraseDialog({ mode, onClose, onSubmit, error }: { mode: 'encrypt' | 'decrypt'; onClose: () => void; onSubmit: (passphrase: string) => Promise<void> | void; error?: string | null }) {
  const { t } = useT()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (pass.length < MIN_PASSPHRASE) return setLocal(t('encrypted.tooShort', { min: MIN_PASSPHRASE }))
    if (mode === 'encrypt' && pass !== confirm) return setLocal(t('encrypted.mismatch'))
    setLocal(null)
    setBusy(true)
    try {
      await onSubmit(pass)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(mode === 'encrypt' ? 'encrypted.exportTitle' : 'encrypted.importTitle')}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? t('common.saving') : t(mode === 'encrypt' ? 'encrypted.export' : 'encrypted.open')}
          </button>
        </>
      }
    >
      <p className="note">{t(mode === 'encrypt' ? 'encrypted.exportText' : 'encrypted.importText')}</p>
      <TextField label={t('encrypted.passphrase')} type="password" autoComplete={mode === 'encrypt' ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} error={local ?? error ?? null} autoFocus />
      {mode === 'encrypt' && <TextField label={t('encrypted.confirm')} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
    </Dialog>
  )
}
