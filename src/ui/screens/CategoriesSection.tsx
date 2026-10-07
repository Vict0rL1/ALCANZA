/** Ajustes › Categorías: resumen y acceso a la gestión completa (`#/ajustes/categorias`). */
import { resolveCategories } from '../../domain/categories'
import { useT } from '../../i18n'
import { useData } from '../../state/store'
import { Card } from '../components/common'
import { Icon } from '../components/Icon'
import { href } from '../router'

export function CategoriesSection() {
  const { t, tn } = useT()
  const data = useData()
  const all = resolveCategories(data)
  const active = all.filter((c) => !c.archived).length
  const archived = all.length - active
  return (
    <Card labelledBy="categories-title">
      <h2 id="categorias" className="card__title">
        <span id="categories-title">{t('categories.title')}</span>
      </h2>
      <p className="note">{t('categories.manageHint')}</p>
      <p>
        {tn('categories.summary', active)}
        {archived > 0 ? ` · ${tn('categories.archivedCount', archived)}` : ''}
      </p>
      <a className="btn btn--secondary" href={href('/ajustes/categorias')}>
        <Icon name="tag" />
        {t('categories.manage')}
      </a>
    </Card>
  )
}
