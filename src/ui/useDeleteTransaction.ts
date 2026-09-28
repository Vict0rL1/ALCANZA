import { deleteTransaction, restoreTransaction } from '../domain/operations'
import { useT } from '../i18n'
import { useRun } from '../state/hooks'
import { useToast } from './components/toastContext'

/** Utilidad compartida para deshacer la eliminación de un movimiento. */
export function useDeleteTransaction() {
  const { t } = useT()
  const run = useRun()
  const toast = useToast()
  return async (id: string) => {
    const { result, saved } = await run((d, c) => deleteTransaction(d, id, c))
    if (!result.ok) return false
    const { tx, unlinkedRefundIds } = result.value
    toast({
      message: saved ? t('movements.deleted') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => restoreTransaction(d, tx, c, unlinkedRefundIds)) },
    })
    return true
  }
}
