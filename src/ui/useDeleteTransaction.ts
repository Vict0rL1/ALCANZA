import { deleteTransaction, restoreFromTrash } from '../domain/operations'
import { useT } from '../i18n'
import { useRun } from '../state/hooks'
import { useToast } from './components/toastContext'
import { useFormat } from './format'
import { issueMessage } from './labels'

/**
 * Enviar un movimiento a la papelera con «Deshacer» como acceso rápido a la
 * restauración (el movimiento sigue en la papelera aunque se cierre la app).
 */
export function useDeleteTransaction() {
  const restore = useRestoreFromTrash()
  const { t } = useT()
  const run = useRun()
  const toast = useToast()
  return async (id: string) => {
    const { result, saved } = await run((d, c) => deleteTransaction(d, id, c))
    if (!result.ok) return false
    toast({
      message: saved ? t('trash.moved') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void restore(id) },
    })
    return true
  }
}

/** Restaura desde la papelera y explica si no se pudo (por ejemplo, pago ya liquidado). */
export function useRestoreFromTrash() {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  return async (id: string) => {
    const { result, saved } = await run((d, c) => restoreFromTrash(d, id, c))
    if (!result.ok) {
      toast({ message: result.issues[0] ? issueMessage(t, fmt, result.issues[0]) : t('save.error.generic'), tone: 'critical' })
      return false
    }
    const { refundLinkDropped, relinkedRefundIds } = result.value
    const detail = refundLinkDropped ? ` ${t('trash.refundLinkDropped')}` : relinkedRefundIds.length ? ` ${t('trash.refundsRelinked')}` : ''
    toast({ message: saved ? `${t('trash.restored')}${detail}` : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    return saved
  }
}
