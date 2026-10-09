/**
 * Selectores de icono y color de una categoría o etiqueta. Viven fuera de la pantalla de Categorías
 * para que el selector del formulario (D5), Metas y Etiquetas no arrastren esa pantalla a su
 * paquete: Ajustes › Categorías vuelve a cargarse solo al abrirla (E5).
 */
import { CATEGORY_COLOR_LIST } from '../../domain/categories'
import type { CategoryColor } from '../../domain/types'
import { useT, type MessageKey } from '../../i18n'
import { Icon } from './Icon'
import { CATEGORY_ICON_NAMES } from './iconPaths'

export function IconPicker({ value, onChange, label }: { value: string; onChange: (icon: string) => void; label: string }) {
  return (
    <div className="field">
      <p className="field__label">{label}</p>
      <div className="icon-picker" role="group" aria-label={label}>
        {CATEGORY_ICON_NAMES.map((name) => (
          <button key={name} type="button" className="icon-picker__item" aria-pressed={value === name} aria-label={name} title={name} onClick={() => onChange(name)}>
            <Icon name={name} size={20} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function ColorPicker({ value, onChange, label }: { value: CategoryColor; onChange: (c: CategoryColor) => void; label: string }) {
  const { t } = useT()
  return (
    <div className="field">
      <p className="field__label">{label}</p>
      <div className="color-picker" role="group" aria-label={label}>
        {CATEGORY_COLOR_LIST.map((c) => (
          <button key={c} type="button" className={`color-picker__item cat-dot--${c}`} aria-pressed={value === c} aria-label={t(`categories.colorName.${c}` as MessageKey)} title={t(`categories.colorName.${c}` as MessageKey)} onClick={() => onChange(c)}>
            <span className="color-picker__dot" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
