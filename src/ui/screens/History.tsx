/**
 * Historial local de cambios (Ajustes › Historial). Muestra qué cambió, cuándo y los valores
 * anteriores y nuevos, con acceso al registro. «Revertir» solo se ofrece si nada cambió
 * después; si no, se explica qué registro cambió. Ver domain/history.ts.
 */
import { useMemo, useState } from 'react'
import { goalSavedMinor } from '../../domain/goals'
import { canRevert, revertConflicts, revertEntry } from '../../domain/history'
import type { Account, AppData, Goal, HistoryChange, HistoryEntry, Schedule, Transaction } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { useT, type MessageKey } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { validateAppData } from '../../storage/backup'
import { Alert, Badge, Card, EmptyState, PageHeader } from '../components/common'
import { ConfirmDialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { useFormat, type Formatter } from '../format'
import { accountName, categoryLabel, issueMessage, transactionTitle } from '../labels'
import { href } from '../router'

const PAGE = 30

type T = ReturnType<typeof useT>['t']

interface Line {
  text: string
  details: string[]
  link?: string
}

function txDetails(a: Transaction, b: Transaction, data: AppData, t: T, fmt: Formatter): string[] {
  const out: string[] = []
  const field = (key: MessageKey, x: string, y: string) => x !== y && out.push(t('history.field', { field: t(key), before: x, after: y }))
  field('fields.amount', fmt.money(a.amountMinor), fmt.money(b.amountMinor))
  field('fields.date', fmt.date(a.date), fmt.date(b.date))
  field('fields.account', accountName(data.accounts, a.accountId, t), accountName(data.accounts, b.accountId, t))
  field('fields.category', categoryLabel(t, a.categoryId) || '—', categoryLabel(t, b.categoryId) || '—')
  field('history.note', a.note ?? '—', b.note ?? '—')
  field('history.status', t(`status.${a.status}` as MessageKey), t(`status.${b.status}` as MessageKey))
  if (JSON.stringify(a.splits ?? null) !== JSON.stringify(b.splits ?? null)) out.push(t('history.splitChanged'))
  return out
}

/** Una línea legible por registro cambiado (la papelera se describe junto al movimiento). */
function describe(change: HistoryChange, entry: HistoryEntry, data: AppData, t: T, fmt: Formatter): Line | null {
  const verb = change.before === null ? 'created' : change.after === null ? 'deleted' : 'updated'
  switch (change.collection) {
    case 'transactions': {
      const tx = (change.after ?? change.before) as Transaction
      const toTrash = verb === 'deleted' && entry.changes.some((c) => c.collection === 'trash' && c.id === change.id && c.after !== null)
      const fromTrash = verb === 'created' && entry.changes.some((c) => c.collection === 'trash' && c.id === change.id && c.after === null)
      const key = toTrash ? 'history.tx.trashed' : fromTrash ? 'history.tx.restored' : `history.tx.${verb}`
      const sign = tx.kind === 'income' || tx.kind === 'refund' ? '+' : tx.kind === 'expense' ? '−' : ''
      return {
        text: t(key as MessageKey, { title: transactionTitle(tx, data.accounts, t), amount: `${sign}${fmt.money(tx.amountMinor)}`, date: fmt.date(tx.date) }),
        details: verb === 'updated' ? txDetails(change.before as Transaction, change.after as Transaction, data, t, fmt) : [],
        link: data.transactions.some((x) => x.id === change.id) ? `/movimientos/editar/${change.id}` : undefined,
      }
    }
    case 'trash': {
      // Solo se menciona si no va con su movimiento (p. ej. eliminar definitivamente).
      if (entry.changes.some((c) => c.collection === 'transactions' && c.id === change.id)) return null
      const tx = ((change.before ?? change.after) as { transaction: Transaction }).transaction
      return { text: t(change.after === null ? 'history.trash.purged' : 'history.trash.added', { title: transactionTitle(tx, data.accounts, t), amount: fmt.money(tx.amountMinor) }), details: [] }
    }
    case 'goals': {
      const g = (change.after ?? change.before) as Goal
      const details = verb === 'updated' && goalSavedMinor(change.before as Goal) !== goalSavedMinor(change.after as Goal) ? [t('history.field', { field: t('history.saved'), before: fmt.money(goalSavedMinor(change.before as Goal)), after: fmt.money(goalSavedMinor(change.after as Goal)) })] : []
      if (verb === 'updated' && (change.before as Goal).targetMinor !== g.targetMinor) details.push(t('history.field', { field: t('history.target'), before: fmt.money((change.before as Goal).targetMinor), after: fmt.money(g.targetMinor) }))
      return { text: t(`history.goal.${verb}` as MessageKey, { name: g.name }), details, link: data.goals.some((x) => x.id === g.id) ? `/plan/metas/editar/${g.id}` : undefined }
    }
    case 'schedules': {
      const s = (change.after ?? change.before) as Schedule
      const details = verb === 'updated' && (change.before as Schedule).amountMinor !== s.amountMinor ? [t('history.field', { field: t('fields.amount'), before: fmt.money((change.before as Schedule).amountMinor), after: fmt.money(s.amountMinor) })] : []
      return { text: t(`history.schedule.${verb}` as MessageKey, { name: s.name }), details, link: data.schedules.some((x) => x.id === s.id) ? `/plan/programado/editar/${s.id}` : undefined }
    }
    case 'accounts': {
      const a = (change.after ?? change.before) as Account
      return { text: t(`history.account.${verb}` as MessageKey, { name: a.name }), details: [], link: '/ajustes?seccion=cuentas' }
    }
    case 'reconciliations':
      return { text: t(`history.reconciliation.${verb}` as MessageKey), details: [], link: '/conciliar' }
    case 'incomeDistributions':
      return { text: t(`history.distribution.${verb}` as MessageKey), details: [] }
    case 'periodBudgets': {
      const b = (change.after ?? change.before) as { name: string }
      return { text: t(`history.period.${verb}` as MessageKey, { name: b.name }), details: [] }
    }
    case 'settings':
      return { text: t('history.settings'), details: Object.keys(change.after as object).filter((k) => (change.before as Record<string, unknown>)[k] !== (change.after as Record<string, unknown>)[k]).map((k) => t('history.field', { field: k, before: String((change.before as Record<string, unknown>)[k]), after: String((change.after as Record<string, unknown>)[k]) })) }
  }
}

export function History() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [limit, setLimit] = useState(PAGE)
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entries = useMemo(() => [...data.history].reverse(), [data.history])
  const shown = entries.slice(0, limit)

  const revert = async (entry: HistoryEntry) => {
    setConfirm(null)
    const { result, saved } = await run(
      (d, c) => {
        const r = revertEntry(d, entry.id, c)
        if (!r.ok) return r
        // El resultado se valida completo: nunca se guardan datos incoherentes (p. ej. un pago
        // liquidado dos veces o una devolución sin su compra).
        const v = validateAppData(JSON.parse(JSON.stringify(r.data)))
        return v.ok ? r : { ok: false as const, issues: v.issues as Issue[] }
      },
      { source: 'revert', revertOf: entry.id },
    )
    if (!result.ok) return setError(issueMessage(t, fmt, result.issues[0]!))
    setError(null)
    toast({ message: saved ? t('history.reverted') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  return (
    <div className="stack">
      <PageHeader title={t('history.title')} back={{ href: href('/ajustes'), label: t('nav.settings') }} />
      <Alert tone="info" title={t('history.localTitle')}>
        {t('history.localText', { date: fmt.timestamp(data.historyStartedAt), max: 1000 })}
      </Alert>
      {error && <Alert tone="critical" title={error} role="alert" />}
      {entries.length === 0 ? (
        <EmptyState icon="clock" title={t('history.empty')}>
          <p>{t('history.emptyText')}</p>
        </EmptyState>
      ) : (
        <ul className="item-list history-list" aria-label={t('history.title')}>
          {shown.map((entry) => {
            const lines = entry.changes.map((c) => describe(c, entry, data, t, fmt)).filter((l): l is Line => l !== null)
            const status = canRevert(data, entry)
            const conflicts = status === 'conflict' ? revertConflicts(data, entry) : []
            const original = entry.revertOf ? data.history.find((e) => e.id === entry.revertOf) : undefined
            return (
              <li key={entry.id}>
                <Card as="article" className="history-entry">
                  <p className="item__meta">
                    <Icon name="clock" size={14} /> {fmt.timestamp(entry.at)}
                    {entry.source === 'revert' && <Badge icon="refund">{t('history.badge.revert')}</Badge>}
                    {entry.source === 'plan' && <Badge icon="calendar">{t('history.badge.plan')}</Badge>}
                    {status === 'alreadyReverted' && <Badge tone="info" icon="check">{t('history.badge.reverted')}</Badge>}
                  </p>
                  {entry.source === 'replace' ? (
                    <p className="item__title">{t('history.replace')}</p>
                  ) : (
                    <ul className="stack-sm">
                      {lines.map((l, i) => (
                        <li key={i}>
                          <span className="item__title">{l.link ? <a href={href(l.link)}>{l.text}</a> : l.text}</span>
                          {l.details.length > 0 && (
                            <ul className="bullets history-details">
                              {l.details.map((d, j) => (
                                <li key={j}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {original && <p className="note">{t('history.revertOf', { date: fmt.timestamp(original.at) })}</p>}
                  {status === 'ok' && (
                    <div className="button-row">
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => setConfirm(entry)}>
                        <Icon name="refund" size={16} />
                        {t('history.revert')}
                      </button>
                    </div>
                  )}
                  {status === 'conflict' && <p className="note note--icon">{tn('history.conflict', conflicts.length)}</p>}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {entries.length > shown.length && (
        <button type="button" className="btn btn--secondary" onClick={() => setLimit((l) => l + PAGE)}>
          {t('movements.showMore', { count: entries.length - shown.length })}
        </button>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={t('history.confirmTitle')}
        confirmLabel={t('history.revert')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void revert(confirm)}
      >
        <p>{t('history.confirmText')}</p>
        {confirm && (
          <ul className="bullets">
            {confirm.changes
              .map((c) => describe(c, confirm, data, t, fmt))
              .filter((l): l is Line => l !== null)
              .map((l, i) => (
                <li key={i}>{l.text}</li>
              ))}
          </ul>
        )}
      </ConfirmDialog>
    </div>
  )
}
