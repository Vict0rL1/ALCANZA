import { memo, useCallback, useMemo, useState } from 'react'
import { txAppliesToAccount } from '../../domain/balances'
import { categoriesForKind } from '../../domain/categories'
import { sumMinor } from '../../domain/money'
import { txCategoryIds } from '../../domain/splits'
import { transactionsToCsv } from '../../domain/csvExport'
import { restoreFromTrashMany, trashTransactions } from '../../domain/operations'
import { useRun } from '../../state/hooks'
import { downloadText } from '../backupActions'
import { useDeleteTransaction } from '../useDeleteTransaction'
import { BottomSheet, ListRow, SearchBar, SwipeRow } from '../components/base'
import { ConfirmDialog } from '../components/Dialog'
import { useToast } from '../components/toastContext'
import type { Transaction, TxKind, TxStatus } from '../../domain/types'
import { useT, type MessageKey } from '../../i18n'
import { useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Badge, EmptyState, PageHeader } from '../components/common'
import { SelectField, TextField } from '../components/fields'
import { Icon, type IconName } from '../components/Icon'
import { MonthSummary } from '../components/MonthSummary'
import { useFormat } from '../format'
import { accountName, categoryLabel, transactionTitle } from '../labels'
import { href, type Route } from '../router'

const KIND_ICON: Record<TxKind, IconName> = { income: 'arrowDown', expense: 'arrowUp', transfer: 'transfer', refund: 'refund', adjustment: 'sliders' }
const PAGE = 60

export function Movements({ route }: { route?: Route }) {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | TxKind>('all')
  const [status, setStatus] = useState<'all' | TxStatus>('all')
  const [accountId, setAccountId] = useState('all')
  const [categoryId, setCategoryId] = useState(() => route?.query.get('categoria') || 'all')
  const [tagId, setTagId] = useState(() => route?.query.get('etiqueta') || 'all')
  const [from, setFrom] = useState(() => route?.query.get('desde') || '')
  const [to, setTo] = useState(() => route?.query.get('hasta') || '')
  const [limit, setLimit] = useState(PAGE)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const run = useRun()
  const toast = useToast()

  // Filtros activos como fichas con «quitar» (la búsqueda tiene su propio campo).
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(kind !== 'all' ? [{ key: 'kind', label: t(`txKind.${kind}` as MessageKey), clear: () => setKind('all') }] : []),
    ...(status !== 'all' ? [{ key: 'status', label: t(status === 'realized' ? 'status.realized' : 'status.planned'), clear: () => setStatus('all') }] : []),
    ...(accountId !== 'all' ? [{ key: 'account', label: accountName(data.accounts, accountId, t), clear: () => setAccountId('all') }] : []),
    ...(categoryId !== 'all' ? [{ key: 'category', label: categoryLabel(t, categoryId), clear: () => setCategoryId('all') }] : []),
    ...(tagId !== 'all' ? [{ key: 'tag', label: data.tags.find((x) => x.id === tagId)?.name ?? tagId, clear: () => setTagId('all') }] : []),
    ...(from ? [{ key: 'from', label: t('filters.from.chip', { date: fmt.date(from, { compact: true, today }) }), clear: () => setFrom('') }] : []),
    ...(to ? [{ key: 'to', label: t('filters.to.chip', { date: fmt.date(to, { compact: true, today }) }), clear: () => setTo('') }] : []),
  ]

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return data.transactions.filter((tx) => {
      if (kind !== 'all' && tx.kind !== kind) return false
      if (status !== 'all' && tx.status !== status) return false
      if (accountId !== 'all' && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
      // Una compra dividida aparece en cada categoría de sus líneas.
      if (categoryId !== 'all' && !txCategoryIds(tx).includes(categoryId)) return false
      if (tagId !== 'all' && !tx.tagIds?.includes(tagId)) return false
      if (from && tx.date < from) return false
      if (to && tx.date > to) return false
      if (q) {
        const haystack = [tx.note, categoryLabel(t, tx.categoryId), accountName(data.accounts, tx.accountId, t), tx.toAccountId ? accountName(data.accounts, tx.toAccountId, t) : '', fmt.money(tx.amountMinor)]
          .join(' ')
          .toLocaleLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [data, query, kind, status, accountId, categoryId, tagId, from, to, t, fmt])

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
    setTagId('all')
    setFrom('')
    setTo('')
  }

  const exportCsv = () => {
    const csv = transactionsToCsv([...planned, ...realized], {
      headers: (['date', 'kind', 'status', 'amount', 'currency', 'category', 'account', 'toAccount', 'note', 'merchant', 'id'] as const).map((k) => t(`csv.${k}` as MessageKey)),
      kind: (tx) => t(`txKind.${tx.kind}` as MessageKey),
      status: (tx) => t(tx.status === 'planned' ? 'status.planned' : 'status.realized'),
      category: (tx) => (tx.kind === 'transfer' || tx.kind === 'adjustment' ? '' : txCategoryIds(tx).map((c) => categoryLabel(t, c)).join(' | ')),
      account: (id) => (id ? accountName(data.accounts, id, t) : ''),
    })
    downloadText(`clara-movimientos-${today}.csv`, csv, 'text/csv;charset=utf-8')
  }

  const bulkTrash = async () => {
    const ids = [...selected]
    setConfirmBulk(false)
    const { result, saved } = await run((d, c) => trashTransactions(d, ids, c))
    if (!result.ok) {
      toast({ message: t('save.error.generic'), tone: 'critical' })
      return
    }
    setSelected(new Set())
    setSelecting(false)
    // «Deshacer» devuelve exactamente esos movimientos en una sola operación (todo o nada).
    const undo = async () => {
      const r = await run((d, c) => restoreFromTrashMany(d, ids, c))
      const ok = r.result.ok && r.saved
      toast({ message: ok ? tn('movements.bulkRestored', ids.length) : t('save.error.generic'), tone: ok ? 'good' : 'critical' })
    }
    toast({ message: saved ? tn('movements.bulkTrashed', ids.length) : t('save.error.generic'), tone: saved ? 'good' : 'critical', ...(saved ? { action: { label: t('common.undo'), onClick: () => void undo() } } : {}) })
  }

  // Estable entre renders: las filas memorizadas no se repintan al pasar de página.
  const toggleSelected = useCallback(
    (id: string) =>
      setSelected((s) => {
        const n = new Set(s)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      }),
    [],
  )

  const categoryOptions = [
    { value: 'all', label: t('filters.allCategories') },
    ...[...categoriesForKind('expense', data.categories, { includeArchived: true }), ...categoriesForKind('income', data.categories, { includeArchived: true })].map((c) => ({ value: c, label: categoryLabel(t, c) })),
  ]

  return (
    <div className="stack">
      <PageHeader title={t('movements.title')}>
        {/* Registrar va por la pestaña «+»; lo secundario (estadísticas, favoritos, plantillas, papelera, importar) en «⋯». */}
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => setMoreOpen(true)} aria-label={t('movements.more')} aria-haspopup="dialog" aria-expanded={moreOpen} data-testid="movements-more">
          <Icon name="more" />
        </button>
      </PageHeader>
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('movements.more')}>
        <div className="stack-sm" onClick={(e) => (e.target as HTMLElement).closest('a') && setMoreOpen(false)}>
          <ListRow icon="chart" title={t('stats.title')} href={href('/estadisticas')} chevron />
          <ListRow icon="star" title={`${t('favorites.title')}${data.favorites.length > 0 ? ` (${data.favorites.length})` : ''}`} href={href('/movimientos/favoritos')} chevron />
          <ListRow icon="list" title={`${t('templates.title')}${data.templates.length > 0 ? ` (${data.templates.length})` : ''}`} href={href('/movimientos/plantillas')} chevron />
          <ListRow icon="trash" title={`${t('trash.link')}${data.trash.length > 0 ? ` (${data.trash.length})` : ''}`} href={href('/movimientos/papelera')} chevron />
          <ListRow icon="upload" title={t('movements.import')} href={href('/movimientos/importar')} chevron />
          {data.transactions.length > 0 && (
            <button type="button" className="list-row list-row--link" onClick={() => { setMoreOpen(false); exportCsv() }} disabled={filtered.length === 0} title={t('movements.exportCsvHint', { count: filtered.length })}>
              <span className="cat-dot" aria-hidden="true">
                <Icon name="download" size={18} />
              </span>
              <span className="list-row__main">
                <span className="list-row__title">{t('movements.exportCsv')}</span>
                <span className="list-row__subtitle">{t('movements.exportCsvHint', { count: filtered.length })}</span>
              </span>
            </button>
          )}
        </div>
      </BottomSheet>

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
          <div className="movements__top">
          <form className="filters filters--compact" onSubmit={(e) => e.preventDefault()} aria-label={t('filters.aria')}>
            <SearchBar
              label={t('filters.search')}
              value={query}
              placeholder={t('filters.searchPlaceholder')}
              onChange={(v) => {
                setQuery(v)
                setLimit(PAGE)
              }}
              clearLabel={t('common.clear')}
            />
            <button type="button" className="btn btn--secondary filters__open" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen} data-testid="open-filters">
              <Icon name="sliders" size={16} />
              {activeChips.length > 0 ? tn('movements.filtersCount', activeChips.length) : t('movements.filters')}
            </button>
          </form>
          {activeChips.length > 0 && (
            <div className="chip-wrap filters__chips" data-testid="active-filters">
              {activeChips.map((c) => (
                <button key={c.key} type="button" className="chip chip--selected" onClick={c.clear} aria-label={t('filters.remove', { label: c.label })}>
                  <span>{c.label}</span>
                  <Icon name="x" size={14} />
                </button>
              ))}
              <button type="button" className="btn btn--ghost btn--small filters__clear" onClick={clear}>
                {t('filters.clear')}
              </button>
            </div>
          )}
          <BottomSheet
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            title={t('movements.filters')}
            footer={
              <button type="button" className="btn btn--primary btn--large" onClick={() => setFiltersOpen(false)}>
                {t('filters.apply')}
              </button>
            }
          >
            <div className="stack" data-testid="filters-sheet">
              <ChipGroup legend={t('filters.kind')} value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: 'all', label: t('filters.allKinds') }, ...(['expense', 'income', 'transfer', 'refund', 'adjustment'] as const).map((k) => ({ value: k, label: t(`txKind.${k}` as MessageKey) }))]} />
              <ChipGroup
                legend={t('filters.status')}
                value={status}
                onChange={(v) => setStatus(v as typeof status)}
                options={[
                  { value: 'all', label: t('filters.allStatuses') },
                  { value: 'realized', label: t('status.realized') },
                  { value: 'planned', label: t('status.planned') },
                ]}
              />
              {data.accounts.length > 1 && <ChipGroup legend={t('fields.account')} value={accountId} onChange={setAccountId} options={[{ value: 'all', label: t('filters.allAccounts') }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]} />}
              <SelectField label={t('fields.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categoryOptions} />
              {data.tags.length > 0 && <ChipGroup legend={t('fields.tags')} value={tagId} onChange={setTagId} options={[{ value: 'all', label: t('filters.allTags') }, ...data.tags.map((tg) => ({ value: tg.id, label: tg.name }))]} />}
              <div className="form-row">
                <TextField label={t('filters.from')} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                <TextField label={t('filters.to')} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </BottomSheet>

          <MonthSummary />

          <div className="movements__toolbar" data-testid="history-tools">
            {/* Sin filtros, solo el total; con filtros, también las sumas del resultado (C2). */}
            <p className="summary-line" aria-live="polite">
              {tn('movements.count', filtered.length)}
              {(activeChips.length > 0 || query !== '') && (
                <>
                  {' · '}
                  {t('movements.incomeTotal', { amount: fmt.money(incomeTotal) })} · {t('movements.spentTotal', { amount: fmt.money(spentTotal) })}
                </>
              )}
            </p>
            <button type="button" className="btn btn--ghost btn--small" aria-pressed={selecting} onClick={() => { setSelecting((v) => !v); setSelected(new Set()) }}>
              <Icon name="check" size={16} />
              {selecting ? t('movements.selectDone') : t('movements.select')}
            </button>
            {selecting && (
              <>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setSelected(new Set([...planned, ...shownRealized].map((x) => x.id)))}>
                  {t('movements.selectAll')}
                </button>
                <span className="muted">{tn('movements.selected', selected.size)}</span>
                <button type="button" className="btn btn--danger-ghost btn--small" disabled={selected.size === 0} onClick={() => setConfirmBulk(true)}>
                  <Icon name="trash" size={16} />
                  {t('movements.bulkTrash')}
                </button>
              </>
            )}
          </div>
          </div>
          <ConfirmDialog open={confirmBulk} title={t('movements.bulkTrashTitle', { count: selected.size })} confirmLabel={t('movements.bulkTrash')} destructive onCancel={() => setConfirmBulk(false)} onConfirm={() => void bulkTrash()}>
            <p>{t('movements.bulkTrashText')}</p>
          </ConfirmDialog>

          {filtered.length === 0 && (
            <EmptyState icon="search" title={t('movements.noResults')} action={<button type="button" className="btn btn--secondary" onClick={clear}>{t('filters.clear')}</button>} />
          )}

          {planned.length > 0 && (
            <section aria-labelledby="planned-title" className="stack-sm">
              <h2 id="planned-title" className="section-title">
                {t('movements.plannedSection')} <span className="section-title__note">· {t('movements.plannedNote')}</span>
              </h2>
              <TxList txs={planned} today={today} selecting={selecting} selected={selected} onToggle={toggleSelected} />
            </section>
          )}

          {realized.length > 0 && (
            <section aria-labelledby="realized-title" className="stack-sm">
              <h2 id="realized-title" className="section-title">
                {t('movements.realizedSection')}
              </h2>
              <TxList txs={shownRealized} today={today} groupByDate selecting={selecting} selected={selected} onToggle={toggleSelected} />
              {realized.length > shownRealized.length && (
                <button type="button" className="btn btn--secondary" onClick={() => setLimit((l) => l + PAGE)}>
                  {t('movements.showMore', { count: realized.length - shownRealized.length })}
                </button>
              )}
              {!selecting && <p className="note">{t('movements.swipeHint')}</p>}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TxList({ txs, today, groupByDate, selecting, selected, onToggle }: { txs: Transaction[]; today: string; groupByDate?: boolean; selecting?: boolean; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const fmt = useFormat()
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
            {g.items.map((tx) => (
              <TxRow key={tx.id} tx={tx} today={today} showDate={!groupByDate} selecting={!!selecting} isSelected={selected?.has(tx.id) ?? false} onToggle={onToggle} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Una fila del historial. Memorizada: al cargar más, solo se pintan las filas nuevas. */
const TxRow = memo(function TxRow({
  tx,
  today,
  showDate,
  selecting,
  isSelected,
  onToggle,
}: {
  tx: Transaction
  today: string
  showDate: boolean
  selecting: boolean
  isSelected: boolean
  onToggle?: (id: string) => void
}) {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const deleteTx = useDeleteTransaction()
  const account = data.accounts.find((a) => a.id === tx.accountId)
  const includedInAnchor = tx.status === 'realized' && account && !txAppliesToAccount(tx, account) && tx.date >= account.anchor.date
  const sign =
    tx.kind === 'income' || tx.kind === 'refund' || (tx.kind === 'adjustment' && tx.adjustmentDirection === 'increase')
      ? '+'
      : tx.kind === 'expense' || tx.kind === 'adjustment'
        ? '−'
        : ''
  const title = transactionTitle(tx, data.accounts, t)
  const row = (
      <a className="item item--link" href={href(`/movimientos/editar/${tx.id}`)}>
        <span className={`item__icon item__icon--${tx.kind}`}>
          <Icon name={KIND_ICON[tx.kind]} size={18} />
        </span>
        <span className="item__main">
          <span className="item__title">{transactionTitle(tx, data.accounts, t)}</span>
          <span className="item__meta">
            {showDate && <>{fmt.date(tx.date, { compact: true, today })} · </>}
            {tx.kind === 'transfer'
              ? t('txKind.transfer')
              : tx.kind === 'adjustment'
                ? t('adjustment.title')
                : tx.splits?.length
                  ? txCategoryIds(tx).map((c) => categoryLabel(t, c)).join(', ')
                  : categoryLabel(t, tx.categoryId)}
            {tx.kind !== 'transfer' && data.accounts.length > 1 && <> · {accountName(data.accounts, tx.accountId, t)}</>}
          </span>
          <span className="item__badges">
            {tx.status === 'planned' ? <Badge tone="info" icon="clock">{t('status.planned')}</Badge> : null}
            {tx.scheduleId ? <Badge icon="calendar">{t('movements.fromCalendar')}</Badge> : null}
            {tx.kind === 'adjustment' ? <Badge icon="scale">{t('adjustment.title')}</Badge> : null}
            {tx.refundOfId ? <Badge icon="refund">{t('movements.linkedRefund')}</Badge> : null}
            {tx.splits?.length && tx.kind === 'expense' ? <Badge icon="list">{tn('split.badge', txCategoryIds(tx).length)}</Badge> : null}
            {includedInAnchor ? <Badge icon="lock">{t('movements.includedInBalance')}</Badge> : null}
          </span>
        </span>
        <span className={`item__amount item__amount--${tx.kind}`}>
          <span className="sr-only">{t(`txKind.${tx.kind}` as MessageKey)}: </span>
          {sign}
          {fmt.money(tx.amountMinor)}
        </span>
      </a>
  )
  return (
    <li className={isSelected ? 'is-selected' : undefined}>
      {selecting ? (
        <label className="item item--select">
          <input type="checkbox" checked={isSelected} onChange={() => onToggle?.(tx.id)} aria-label={t('movements.selectRow', { title })} />
          {row}
        </label>
      ) : (
        <SwipeRow actionLabel={t('movements.swipeDelete', { title })} onAction={() => void deleteTx(tx.id)}>
          {row}
        </SwipeRow>
      )}
    </li>
  )
})

/** Grupo de fichas excluyentes (sustituye a los <select> que se recortaban a 320 px, B10/C2). */
function ChipGroup({ legend, value, onChange, options }: { legend: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <fieldset className="field">
      <legend className="field__label">{legend}</legend>
      <div className="chip-wrap" role="group" aria-label={legend}>
        {options.map((o) => (
          <button key={o.value} type="button" className={`chip${o.value === value ? ' chip--selected' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
