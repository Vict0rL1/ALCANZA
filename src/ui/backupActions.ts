/** Acciones de copia de seguridad compartidas por Inicio y Ajustes. */
import { recordExport, recordVerification, snoozeBackupReminder } from '../domain/backupReminder'
import { useT } from '../i18n'
import { useRun } from '../state/hooks'
import { getStore } from '../state/store'
import { MAX_BACKUP_BYTES, parseBackup, performExport, type ImportIssue } from '../storage/backup'
import { deliverFile } from './backupDelivery'
import { useToast } from './components/toastContext'
import { useFormat } from './format'

import { APP_VERSION } from './version'

export { APP_VERSION }

/** Pide al navegador descargar un archivo de texto. */
export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Exporta y SOLO si el archivo se entregó registra la exportación: con la hoja de compartir del
 * sistema cuando el navegador puede compartir archivos (iPhone: «Guardar en Archivos»), si no con
 * la descarga de siempre (K1). Cerrar la hoja sin elegir destino no es exportar ni es un error.
 * El navegador no confirma dónde quedó el archivo: el texto lo dice así.
 */
export function useExportBackup() {
  const { t } = useT()
  const run = useRun()
  const toast = useToast()
  return async () => {
    const data = getStore().data
    if (!data) return false
    let file: { filename: string; text: string } | null = null
    const result = performExport(data, new Date(), APP_VERSION, (filename, text) => {
      file = { filename, text }
    })
    if (!result.ok || !file) {
      toast({ message: t('backup.exportFailed'), tone: 'critical' })
      return false
    }
    const { filename, text } = file as { filename: string; text: string }
    let delivery: Awaited<ReturnType<typeof deliverFile>>
    try {
      delivery = await deliverFile(filename, text, { nav: typeof navigator === 'undefined' ? undefined : navigator, download: downloadText })
    } catch {
      // La descarga no se pudo pedir (p. ej. el navegador la bloquea): no se registra nada.
      toast({ message: t('backup.exportFailed'), tone: 'critical' })
      return false
    }
    if (delivery === 'cancelled') return false
    const { saved } = await run((d) => recordExport(d, result.exportedAt))
    const done = delivery === 'shared' ? t('settings.backup.shared') : t('settings.backup.exported')
    toast({ message: saved ? done : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    return saved
  }
}

export function useSnoozeBackup() {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  return async (days: number) => {
    const { result, saved } = await run((d, c) => snoozeBackupReminder(d, days, c))
    if (!result.ok) return
    const until = result.data.backup.snoozedUntil
    toast({ message: saved && until ? t('home.backup.snoozed', { date: fmt.date(until) }) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }
}

/** Comprueba un archivo de copia SIN importarlo y registra la verificación. */
export function useVerifyBackup() {
  const { t } = useT()
  const run = useRun()
  const toast = useToast()
  return async (file: File): Promise<{ ok: true } | { ok: false; issues: ImportIssue[] }> => {
    if (file.size > MAX_BACKUP_BYTES) return { ok: false, issues: [{ path: 'file', code: 'tooLarge' }] }
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) return { ok: false, issues: parsed.issues }
    const { result, saved } = await run((d, c) => recordVerification(d, { budgetId: parsed.data.budgetId, exportedAt: parsed.exportedAt }, c))
    if (!result.ok) return { ok: false, issues: result.issues }
    toast({ message: saved ? t('backup.verifiedDone') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    return { ok: true }
  }
}
