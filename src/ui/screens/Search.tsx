/**
 * Búsqueda global local: movimientos, cuentas, categorías, metas, pagos programados,
 * presupuestos por periodo y favoritos (y la papelera si se pide). Nada sale del dispositivo.
 */
import { useDeferredValue, useMemo, useState } from 'react'
import { buildSearchIndex, MIN_QUERY_LENGTH, search, type SearchEntry, type SearchKind } from '../../domain/search'
import { useT, type MessageKey } from '../../i18n'
import { useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { Badge, EmptyState, PageHeader } from '../components/common'
import { CheckboxField, TextField } from '../components/fields'
import { Icon, type IconName } from '../components/Icon'
import { useFormat } from '../format'
import { categoryLabel } from '../labels'
import { href, withQuery, type Route } from '../router'

const ICON: Record<SearchKind, IconName> = {
  transaction: 'list',
  account: 'wallet',
  category: 'star',
  goal: 'target',
  schedule: 'calendar',
  periodBudget: 'wallet',
  favorite: 'star',
  trash: 'trash',
}

function target(e: SearchEntry, back: string): string {
  switch (e.kind) {
    case 'transaction':
      return withQuery(`/movimientos/editar/${e.id}`, { returnTo: back })
    case 'account':
      return '/ajustes?seccion=cuentas'
    case 'category':
      return withQuery('/movimientos', { categoria: e.id })
    case 'goal':
      return `/plan/metas/editar/${e.id}`
    case 'schedule':
      return `/plan/programado/editar/${e.id}`
    case 'periodBudget':
      return `/plan/periodos/${e.id}`
    case 'favorite':
      return '/movimientos/favoritos'
    case 'trash':
      return '/movimientos/papelera'
  }
}

export function Search({ route }: { route: Route }) {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const today = useToday()
  const [query, setQuery] = useState(route.query.get('q') ?? '')
  const [includeTrash, setIncludeTrash] = useState(route.query.get('papelera') === '1')
  const deferred = useDeferredValue(query)
  // El índice se reconstruye solo si cambian los datos o el idioma (nombres de categorías).
  const index = useMemo(() => buildSearchIndex(data, (id) => categoryLabel(t, id)), [data, t])
  const groups = useMemo(() => search(index, deferred, { includeTrash }), [index, deferred, includeTrash])
  const total = groups.reduce((n, g) => n + g.total, 0)
  const back = withQuery('/buscar', { q: deferred.trim() || undefined, papelera: includeTrash ? 1 : undefined })
  const tooShort = deferred.trim().replace(/\s/g, '').length < MIN_QUERY_LENGTH

  const remember = (q: string, trash: boolean) => {
    // Guarda la búsqueda en la dirección sin recargar la pantalla (para volver atrás).
    try {
      window.history.replaceState(null, '', `#${withQuery('/buscar', { q: q.trim() || undefined, papelera: trash ? 1 : undefined })}`)
    } catch {
      /* sin historial: no pasa nada */
    }
  }

  return (
    <div className="stack">
      <PageHeader title={t('search.title')} />
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()} aria-label={t('search.title')}>
        <TextField
          label={t('search.label')}
          type="search"
          value={query}
          autoFocus
          enterKeyHint="search"
          placeholder={t('search.placeholder')}
          hint={t('search.hint')}
          onChange={(e) => {
            setQuery(e.target.value)
            remember(e.target.value, includeTrash)
          }}
          className="filters__search"
        />
        <CheckboxField
          checked={includeTrash}
          onChange={(v) => {
            setIncludeTrash(v)
            remember(query, v)
          }}
          label={t('search.includeTrash')}
        />
      </form>
      <p className="summary-line" aria-live="polite" data-testid="search-summary">
        {tooShort ? t('search.typeMore', { min: MIN_QUERY_LENGTH }) : tn('search.count', total)}
      </p>
      {!tooShort && total === 0 && (
        <EmptyState icon="search" title={t('search.noResults', { query: deferred.trim() })}>
          <p>{t(includeTrash || data.trash.length === 0 ? 'search.noResultsHint' : 'search.noResultsTrash')}</p>
        </EmptyState>
      )}
      {groups.map((g) => (
        <section key={g.kind} className="stack-sm" aria-labelledby={`sg-${g.kind}`}>
          <h2 id={`sg-${g.kind}`} className="section-title">
            {t(`search.group.${g.kind}` as MessageKey)} ({g.total})
          </h2>
          <ul className="item-list">
            {g.items.map((e) => (
              <li key={`${e.kind}-${e.id}`}>
                <a className="item item--link" href={href(target(e, back))}>
                  <span className="item__icon">
                    <Icon name={ICON[e.kind]} size={18} />
                  </span>
                  <span className="item__main">
                    <span className="item__title">{e.title || t(`search.group.${e.kind}` as MessageKey)}</span>
                    <span className="item__meta">
                      {[e.date ? fmt.date(e.date, { compact: true, today }) : null, e.category && e.category !== e.title ? e.category : null].filter(Boolean).join(' · ')}
                    </span>
                    {e.kind === 'trash' && (
                      <span className="item__badges">
                        <Badge icon="trash">{t('search.inTrash')}</Badge>
                      </span>
                    )}
                  </span>
                  {e.amountMinor !== undefined && <span className="item__amount">{fmt.money(e.amountMinor)}</span>}
                </a>
              </li>
            ))}
          </ul>
          {g.total > g.items.length && <p className="note">{t('search.more', { shown: g.items.length, total: g.total })}</p>}
        </section>
      ))}
      <p className="note">
        <Icon name="lock" size={16} /> {t('search.localNote')}
      </p>
    </div>
  )
}
