/**
 * Hoja «¿Qué quieres registrar?»: la única entrada para registrar (pestaña «+» en celular y botón
 * «Agregar» del lateral en escritorio). Gasto, ingreso, transferencia, asistente y entradas comunes.
 * «Pegar del atajo» (L3) lee lo que copió un atajo de iPhone y abre la vista previa del asistente:
 * nunca crea nada por sí solo.
 */
import { useState } from 'react'
import { clipboardEntryText } from '../../domain/shortcutLink'
import { useT } from '../../i18n'
import { useToday } from '../../state/hooks'
import { useData } from '../../state/store'
import { FavoriteChips } from '../favoritesUi'
import { href, navigate, withQuery } from '../router'
import { BottomSheet, ListRow } from './base'

export function AddSheet({ open, onClose, returnTo }: { open: boolean; onClose: () => void; returnTo: string }) {
  const { t, language } = useT()
  const data = useData()
  const today = useToday()
  const [pasteNote, setPasteNote] = useState<string | null>(null)
  // Leer el portapapeles exige un toque de la persona; sin la función, no se ofrece el botón.
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'
  const pasteFromShortcut = async () => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      return setPasteNote(t('fab.pasteDenied'))
    }
    const entry = clipboardEntryText(text, { today, currency: data.settings.currency, language })
    if (!entry) return setPasteNote(t('fab.pasteNoAmount'))
    setPasteNote(null)
    onClose()
    navigate(withQuery('/asistente', { texto: entry, analizar: '1', origen: 'atajo', returnTo }))
  }
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setPasteNote(null)
        onClose()
      }}
      title={t('fab.title')}
    >
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
        {canPaste && <ListRow icon="phone" color="teal" title={t('fab.paste')} subtitle={t('fab.pasteHint')} onClick={() => void pasteFromShortcut()} chevron />}
        {pasteNote && (
          <p className="note" role="status" data-testid="paste-note">
            {pasteNote}
          </p>
        )}
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
