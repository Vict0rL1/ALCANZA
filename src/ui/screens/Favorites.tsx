/** Favoritos: crear, editar, ordenar y eliminar plantillas de movimientos. */
import { useState } from 'react'
import { sortedFavorites } from '../../domain/favorites'
import { deleteFavorite, moveFavorite, restoreFavorite } from '../../domain/operations'
import type { Favorite } from '../../domain/types'
import { useT, type MessageKey } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { Badge, Card, EmptyState, PageHeader } from '../components/common'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toastContext'
import { FavoriteDialog } from '../favoritesUi'
import { useFormat } from '../format'
import { accountName, categoryLabel } from '../labels'
import { href, withQuery } from '../router'

export function Favorites() {
  const { t } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [editing, setEditing] = useState<Favorite | 'new' | null>(null)
  const favorites = sortedFavorites(data)

  const remove = async (f: Favorite) => {
    const { result, saved } = await run((d, c) => deleteFavorite(d, f.id, c))
    if (!result.ok) return
    const removed = result.value
    toast({
      message: saved ? t('favorites.deleted') : t('save.error.generic'),
      tone: saved ? 'good' : 'critical',
      action: { label: t('common.undo'), onClick: () => void run((d, c) => restoreFavorite(d, removed, c)) },
    })
  }

  return (
    <div className="stack">
      <PageHeader title={t('favorites.title')} back={{ href: href('/movimientos'), label: t('nav.movements') }}>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" />
          {t('favorites.add')}
        </button>
      </PageHeader>
      <p className="note">{t('favorites.intro')}</p>

      {favorites.length === 0 ? (
        <EmptyState icon="star" title={t('favorites.empty')} />
      ) : (
        <Card>
          <ul className="item-list">
            {favorites.map((f, index) => (
              <li key={f.id} className="item item--stacked">
                <div className="item__row">
                  <div className="item__main">
                    <p className="item__title">{f.name}</p>
                    <p className="item__meta">
                      {t(`txKind.${f.kind}` as MessageKey)} · {categoryLabel(t, f.categoryId)} · {accountName(data.accounts, f.accountId, t)}
                    </p>
                    {f.broken && (
                      <p className="item__badges">
                        <Badge tone="warning" icon="alert">
                          {t('favorites.broken')}
                        </Badge>
                      </p>
                    )}
                  </div>
                  <p className="item__amount">{f.amountMinor !== undefined ? fmt.money(f.amountMinor) : t('favorites.noAmount')}</p>
                </div>
                <div className="item__actions">
                  <a className="btn btn--small btn--primary" href={href(withQuery('/movimientos/nuevo', { favorito: f.id }))}>
                    {t('favorites.use')}
                    <span className="sr-only">: {f.name}</span>
                  </a>
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(f)}>
                    <Icon name="edit" size={16} />
                    {t('common.edit')}
                    <span className="sr-only">: {f.name}</span>
                  </button>
                  <button type="button" className="btn btn--small btn--ghost" disabled={index === 0} onClick={() => void run((d, c) => moveFavorite(d, f.id, -1, c))}>
                    <Icon name="up" size={16} />
                    {t('favorites.moveUp')}
                    <span className="sr-only">: {f.name}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={index === favorites.length - 1}
                    onClick={() => void run((d, c) => moveFavorite(d, f.id, 1, c))}
                  >
                    <Icon name="down" size={16} />
                    {t('favorites.moveDown')}
                    <span className="sr-only">: {f.name}</span>
                  </button>
                  <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => void remove(f)}>
                    <Icon name="trash" size={16} />
                    {t('common.delete')}
                    <span className="sr-only">: {f.name}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing && <FavoriteDialog favorite={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
