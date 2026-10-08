/**
 * Hoja «¿Qué quieres registrar?»: la única entrada para registrar (pestaña «+» en celular y botón
 * «Agregar» del lateral en escritorio). Gasto, ingreso, transferencia, asistente y entradas comunes.
 */
import { useT } from '../../i18n'
import { useData } from '../../state/store'
import { FavoriteChips } from '../favoritesUi'
import { href, withQuery } from '../router'
import { BottomSheet, ListRow } from './base'

export function AddSheet({ open, onClose, returnTo }: { open: boolean; onClose: () => void; returnTo: string }) {
  const { t } = useT()
  const data = useData()
  return (
    <BottomSheet open={open} onClose={onClose} title={t('fab.title')}>
      {/* Al elegir una opción se navega: la hoja se cierra sola para no quedar abierta sobre el formulario. */}
      <div
        data-testid="fab-sheet"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) onClose()
        }}
      >
        <ListRow icon="arrowDown" color="red" title={t('fab.expense')} href={href(withQuery('/movimientos/nuevo', { kind: 'expense', returnTo }))} chevron />
        <ListRow icon="arrowUp" color="emerald" title={t('fab.income')} href={href(withQuery('/movimientos/nuevo', { kind: 'income', returnTo }))} chevron />
        <ListRow icon="transfer" color="blue" title={t('fab.transfer')} href={href(withQuery('/movimientos/nuevo', { kind: 'transfer', returnTo }))} chevron />
        <ListRow icon="sparkles" color="violet" title={t('fab.assistant')} subtitle={t('assistant.placeholder')} href={href(withQuery('/asistente', { returnTo }))} chevron />
        {data.favorites.length > 0 && (
          <>
            <p className="cat-group__title">{t('fab.common')}</p>
            <FavoriteChips returnTo={returnTo} limit={6} />
          </>
        )}
      </div>
    </BottomSheet>
  )
}
