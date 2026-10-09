import type { CategoryColor } from '../../domain/types'
import { Icon } from './Icon'

/**
 * E1: el único dibujo de una categoría en toda la app (fichas de configuración, selector,
 * filtros, filas del historial, Ajustes › Categorías y leyendas): círculo con el tinte de la
 * categoría y su icono. `md` = 32 px con icono de 16; `lg` = 40 px con icono de 20 (fichas).
 */
export function CategoryIcon({ icon, color, size = 'md', className }: { icon: string; color?: CategoryColor; size?: 'md' | 'lg'; className?: string }) {
  const classes = ['cat-dot', color ? `cat-dot--${color}` : '', size === 'lg' ? 'cat-dot--lg' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <span className={classes} aria-hidden="true">
      <Icon name={icon} size={size === 'lg' ? 20 : 16} />
    </span>
  )
}
