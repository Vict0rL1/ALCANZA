import { useMemo, useState } from 'react'
import { txAppliesToAccount } from '../../domain/balances'
import { categoriesForKind } from '../../domain/categories'
import { sumMinor } from '../../domain/money'
import type { Transaction, TxKind, TxStatus } from '../../domain/types'
import { useT, type MessageKey } from '../../i18n'
import { useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Badge, EmptyState, PageHeader } from '../components/common'
import { SelectField, TextField } from '../components/fields'
import { Icon, type IconName } from '../components/Icon'
import { useFormat } from '../format'
import { accountName, categoryLabel, transactionTitle } from '../labels'
import { href } from '../router'

const KIND_ICON: Record<TxKind, IconName> = { income: 'arrowDown', expense: 'arrowUp', transfer: 'transfer', refund: 'refund' }
const PAGE = 60

export function Movements() {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | TxKind>('all')
  const [status, setStatus] = useState<'all' | TxStatus>('all')
  const [accountId, setAccountId] = useState('all')
  const [categoryId, setCategoryId] = useState('all')
  const [limit, setLimit] = useState(PAGE)

  const filtersActive = query !== '' || kind !== 'all' || status !== 'all' || accountId !== 'all' || categoryId !== 'all'

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return data.transactions.filter((tx) => {
      if (kind !== 'all' && tx.kind !== kind) return false
      if (status !== 'all' && tx.status !== status) return false
      if (accountId !== 'all' && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
      if (categoryId !== 'all' && tx.categoryId !== categoryId) return false
      if (q) {
        const haystack = [tx.note, categoryLabel(t, tx.categoryId), accountName(data.accounts, tx.accountId, t), tx.toAccountId ? accountName(data.accounts, tx.toAccountId, t) : '', fmt.money(tx.amountMinor)]
          .join(' ')
          .toLocaleLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [data, query, kind, status, accountId, categoryId, t, fmt])

  const planned = filtered.filter((tx) => tx.status === 'planned').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const realized = filtered
    .filter((tx) => tx.status === 'realized')
    .sort((a, b) => (a.date === b.date ? (b.createdAt > a.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
  const shownRealized = realized.slice(0, limit)

  const incomeTotal = sumMinor(realized.filter((tx) => tx.kind === 'income').map((tx) => tx.amountMinor))
  const spentTotal = sumMinor(realized.filter((tx) => tx.kind === 'expense').map((tx) => tx.amountMinor)) - sumMinor(realized.filter((tx) => tx.kind === 'refund').map((tx) => tx.amountMinor))

  const clear = () => {
    setQuery('')
    setKind('all')
    setStatus('all')
    setAccountId('all')
    setCategoryId('all')
  }

  const categoryOptions = [
    { value: 'all', label: t('filters.allCategories') },
    ...[...categoriesForKind('expense'), ...categoriesForKind('income')].map((c) => ({ value: c, label: categoryLabel(t, c) })),
  ]

  return (
    <div className="stack">
      <PageHeader title={t('movements.title')}>
        <a className="btn btn--primary" href={href('/movimientos/nuevo')}>
          <Icon name="plus" />
          {t('movements.add')}
        </a>
      </PageHeader>

      {data.transactions.length === 0 ? (
        <EmptyState
          icon="list"
          title={t('movements.emptyTitle')}
          action={
            <a className="btn btn--primary" href={href('/movimientos/nuevo')}>
              {t('movements.add')}
            </a>
          }
        >
          <p>{t('movements.emptyText')}</p>
        </EmptyState>
      ) : (
        <>
          <form className="filters" role="search" onSubmit={(e) => e.preventDefault()} aria-label={t('filters.aria')}>
            <TextField
              label={t('filters.search')}
              type="search"
              value={query}
              placeholder={t('filters.searchPlaceholder')}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE)
              }}
              className="filters__search"
            />
            <SelectField
              label={t('filters.kind')}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              options={[{ value: 'all', label: t('filters.allKinds') }, ...(['expense', 'income', 'transfer', 'refund'] as const).map((k) => ({ value: k, label: t(`txKind.${k}` as MessageKey) }))]}
            />
            <SelectField
              label={t('filters.status')}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              options={[
                { value: 'all', label: t('filters.allStatuses') },
                { value: 'realized', label: t('status.realized') },
                { value: 'planned', label: t('status.planned') },
              ]}
            />
            {data.accounts.length > 1 && (
              <SelectField
                label={t('fields.account')}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                options={[{ value: 'all', label: t('filters.allAccounts') }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]}
              />
            )}
            <SelectField label={t('fields.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categoryOptions} />
            {filtersActive && (
              <button type="button" className="btn btn--ghost filters__clear" onClick={clear}>
                <Icon name="x" size={16} />
                {t('filters.clear')}
              </button>
            )}
          </form>

          <p className="summary-line" aria-live="polite">
            {tn('movements.count', filtered.length)} · {t('movements.incomeTotal', { amount: fmt.money(incomeTotal) })} · {t('movements.spentTotal', { amount: fmt.money(spentTotal) })}
          </p>

          {filtered.length === 0 && (
            <EmptyState icon="search" title={t('movements.noResults')} action={<button type="button" className="btn btn--secondary" onClick={clear}>{t('filters.clear')}</button>} />
          )}

          {planned.length > 0 && (
            <section aria-labelledby="planned-title" className="stack-sm">
              <h2 id="planned-title" className="section-title">
                {t('movements.plannedSection')}
              </h2>
              <p className="note">{t('movements.plannedNote')}</p>
              <TxList txs={planned} today={today} />
            </section>
          )}

          {realized.length > 0 && (
            <section aria-labelledby="realized-title" className="stack-sm">
              <h2 id="realized-title" className="section-title">
                {t('movements.realizedSection')}
              </h2>
              <TxList txs={shownRealized} today={today} groupByDate />
              {realized.length > shownRealized.length && (
                <button type="button" className="btn btn--secondary" onClick={() => setLimit((l) => l + PAGE)}>
                  {t('movements.showMore', { count: realized.length - shownRealized.length })}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TxList({ txs, today, groupByDate }: { txs: Transaction[]; today: string; groupByDate?: boolean }) {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const groups: { date: string; items: Transaction[] }[] = []
  for (const tx of txs) {
    const last = groups[groups.length - 1]
    if (groupByDate && last && last.date === tx.date) last.items.push(tx)
    else groups.push({ date: tx.date, items: [tx] })
  }

  return (
    <div className="tx-groups">
      {groups.map((g, gi) => (
        <div key={`${g.date}-${gi}`} className="tx-group">
          {groupByDate && <h3 className="tx-group__date">{fmt.date(g.date, { weekday: true, compact: true, today })}</h3>}
          <ul className="item-list">
            {g.items.map((tx) => {
              const account = data.accounts.find((a) => a.id === tx.accountId)
              const includedInAnchor = tx.status === 'realized' && account && !txAppliesToAccount(tx, account) && tx.date >= account.anchor.date
              const sign = tx.kind === 'income' || tx.kind === 'refund' ? '+' : tx.kind === 'expense' ? '−' : ''
              return (
                <li key={tx.id}>
                  <a className="item item--link" href={href(`/movimientos/editar/${tx.id}`)}>
                    <span className={`item__icon item__icon--${tx.kind}`}>
                      <Icon name={KIND_ICON[tx.kind]} size={18} />
                    </span>
                    <span className="item__main">
                      <span className="item__title">{transactionTitle(tx, data.accounts, t)}</span>
                      <span className="item__meta">
                        {!groupByDate && <>{fmt.date(tx.date, { compact: true, today })} · </>}
                        {tx.kind === 'transfer' ? t('txKind.transfer') : categoryLabel(t, tx.categoryId)}
                        {tx.kind !== 'transfer' && data.accounts.length > 1 && <> · {accountName(data.accounts, tx.accountId, t)}</>}
                      </span>
                      <span className="item__badges">
                        {tx.status === 'planned' ? <Badge tone="info" icon="clock">{t('status.planned')}</Badge> : null}
                        {tx.scheduleId ? <Badge icon="calendar">{t('movements.fromCalendar')}</Badge> : null}
                        {tx.refundOfId ? <Badge icon="refund">{t('movements.linkedRefund')}</Badge> : null}
                        {includedInAnchor ? <Badge icon="lock">{t('movements.includedInBalance')}</Badge> : null}
                      </span>
                    </span>
                    <span className={`item__amount item__amount--${tx.kind}`}>
                      <span className="sr-only">{t(`txKind.${tx.kind}` as MessageKey)}: </span>
                      {sign}
                      {fmt.money(tx.amountMinor)}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
