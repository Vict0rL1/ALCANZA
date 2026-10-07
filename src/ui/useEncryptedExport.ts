/** Exporta la copia cifrada con una frase (§7.8); la frase no se guarda. */
import { useT } from '../i18n'
import { useData } from '../state/store'
import { createBackup } from '../storage/backup'
import { encryptBackup } from '../storage/encryptedBackup'
import { APP_VERSION, downloadText } from './backupActions'
import { useToast } from './components/toastContext'

export function useEncryptedExport() {
  const { t } = useT()
  const data = useData()
  const toast = useToast()
  return async (passphrase: string) => {
    try {
      const json = JSON.stringify(createBackup(data, new Date(), APP_VERSION))
      const envelope = await encryptBackup(json, passphrase)
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      downloadText(`clara-${data.isDemo ? 'demo-' : ''}copia-cifrada-${stamp}.json`, JSON.stringify(envelope))
      toast({ message: t('encrypted.exported'), tone: 'good' })
      return true
    } catch {
      toast({ message: t('encrypted.exportFailed'), tone: 'critical' })
      return false
    }
  }
}

