/** Iconos de trazo (SVG en línea, sin dependencias). Siempre acompañan a un texto. */
import { FALLBACK_ICON, PATHS, type IconName } from './iconPaths'

export type { IconName } from './iconPaths'


export function Icon({ name, size = 20, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg
      className={['icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name as IconName] ?? PATHS[FALLBACK_ICON]} />
    </svg>
  )
}
