/** Papelera: movimientos eliminados que se pueden restaurar o eliminar definitivamente. */
import { useState } from 'react'
import { purgeTrash } from '../../domain/operations'
import type { TrashEntry } from '../../domain/types'
import { useT, type MessageKey } from '../../i18n'
import { useRun, useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Badge, Card, EmptyState, PageHeader } from '../components/common'
import { ConfirmDialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { accountName, categoryLabel, transactionTitle } from '../labels'
import { href } from '../router'
import { useRestoreFromTrash } from '../useDeleteTransaction'

export function Trash() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const run = useRun()
  const toast = useToast()
  const restore = useRestoreFromTrash()
  const [confirm, setConfirm] = useState<TrashEntry | 'all' | null>(null)

  const entries = [...data.trash].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))

  const purge = async () => {
    if (!confirm) return
    const ids = confirm === 'all' ? 'all' : [confirm.id]
    setConfirm(null)
    const { result, saved } = await run((d, c) => purgeTrash(d, ids, c))
    if (!result.ok) return
    toast({ message: saved ? tn('trash.purged', result.value.purged) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  return (
    <div className="stack">
      <PageHeader title={t('trash.title')} back={{ href: href('/movimientos'), label: t('nav.movements') }}>
        {entries.length > 0 && (
          <button type="button" className="btn btn--danger-ghost" onClick={() => setConfirm('all')}>
            <Icon name="trash" />
            {t('trash.purgeAll')}
          </button>
        )}
      </PageHeader>
      <p className="note">{t('trash.intro')}</p>

      {entries.length === 0 ? (
        <EmptyState icon="trash" title={t('trash.empty')} />
      ) : (
        <Card>
          <ul className="item-list">
            {entries.map((e) => {
              const tx = e.transaction
              const title = transactionTitle(tx, data.accounts, t)
              const sign = tx.kind === 'income' || tx.kind === 'refund' || (tx.kind === 'adjustment' && tx.adjustmentDirection === 'increase') ? '+' : tx.kind === 'transfer' ? '' : '−'
              const where =
                tx.kind === 'transfer'
                  ? `${accountName(data.accounts, tx.accountId, t)} → ${accountName(data.accounts, tx.toAccountId, t)}`
                  : `${tx.kind === 'adjustment' ? t('adjustment.title') : categoryLabel(t, tx.categoryId)} · ${accountName(data.accounts, tx.accountId, t)}`
              return (
                <li key={e.id} className="item item--stacked">
                  <div className="item__row">
                    <div className="item__main">
                      <p className="item__title">{title}</p>
                      <p className="item__meta">
                        {t(`txKind.${tx.kind}` as MessageKey)} · {fmt.date(tx.date, { compact: true, today })} · {where}
                      </p>
                      <p className="item__meta">{t('trash.deletedOn', { when: fmt.timestamp(e.deletedAt) })}</p>
                      <p className="item__badges">
                        {tx.status === 'planned' && <Badge tone="info" icon="clock">{t('status.planned')}</Badge>}
                        {tx.occurrenceDate && <Badge icon="calendar">{t('trash.linkedSchedule', { date: fmt.date(tx.occurrenceDate, { compact: true, today }) })}</Badge>}
                        {tx.refundOfId && <Badge icon="refund">{t('movements.linkedRefund')}</Badge>}
                        {tx.importRef && <Badge icon="upload">{t('trash.fromImport')}</Badge>}
                        {e.unlinkedRefundIds.length > 0 && <Badge icon="refund">{tn('trash.unlinkedRefunds', e.unlinkedRefundIds.length)}</Badge>}
                      </p>
                    </div>
                    <p className={`item__amount item__amount--${tx.kind}`}>
                      <span className="sr-only">{t(`txKind.${tx.kind}` as MessageKey)}: </span>
                      {sign}
                      {fmt.money(tx.amountMinor)}
                    </p>
                  </div>
                  <div className="item__actions">
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => void restore(e.id)}>
                      <Icon name="undo" size={16} />
                      {t('trash.restore')}
                      <span className="sr-only">: {title}</span>
                    </button>
                    <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => setConfirm(e)}>
                      <Icon name="trash" size={16} />
                      {t('trash.purge')}
                      <span className="sr-only">: {title}</span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm === 'all' ? t('trash.purgeAllTitle') : t('trash.purgeTitle')}
        confirmLabel={confirm === 'all' ? t('trash.purgeAll') : t('trash.purge')}
        onConfirm={() => void purge()}
        onCancel={() => setConfirm(null)}
        destructive
      >
        <p>{confirm === 'all' ? tn('trash.purgeAllText', entries.length) : t('trash.purgeText')}</p>
      </ConfirmDialog>
    </div>
  )
}
