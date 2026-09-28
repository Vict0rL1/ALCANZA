/**
 * Componentes pequeños y accesibles: avisos, insignias, tarjetas de cifras,
 * barras de progreso, estados vacíos y explicaciones desplegables.
 */
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { Icon, type IconName } from './Icon'

export type Tone = 'info' | 'good' | 'warning' | 'critical' | 'neutral'

const TONE_ICON: Record<Tone, IconName> = {
  info: 'info',
  good: 'checkCircle',
  warning: 'alert',
  critical: 'alert',
  neutral: 'info',
}

/** Aviso con icono + título: nunca comunica solo con color. */
export function Alert({
  tone,
  title,
  children,
  actions,
  icon,
  role,
}: {
  tone: Tone
  title: string
  children?: ReactNode
  actions?: ReactNode
  icon?: IconName
  role?: 'status' | 'alert'
}) {
  return (
    <div className={`alert alert--${tone}`} role={role}>
      <Icon name={icon ?? TONE_ICON[tone]} className="alert__icon" />
      <div className="alert__body">
        <p className="alert__title">{title}</p>
        {children && <div className="alert__text">{children}</div>}
        {actions && <div className="alert__actions">{actions}</div>}
      </div>
    </div>
  )
}

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

export function Card({ children, className, labelledBy, as: As = 'section' }: { children: ReactNode; className?: string; labelledBy?: string; as?: 'section' | 'div' | 'article' }) {
  return (
    <As className={['card', className].filter(Boolean).join(' ')} aria-labelledby={labelledBy}>
      {children}
    </As>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value}</p>
      {hint && <p className="stat__hint">{hint}</p>}
    </div>
  )
}

/** Barra de progreso con texto visible (el color no es el único indicador). */
export function Meter({ fraction, label, valueText }: { fraction: number; label: string; valueText: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100)
  return (
    <div className="meter">
      <div
        className="meter__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={valueText}
      >
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} className="empty__icon" />
      <p className="empty__title">{title}</p>
      {children && <div className="empty__text">{children}</div>}
      {action}
    </div>
  )
}

/** "¿Cómo se calculó?": explicación desplegable nativa (accesible con teclado). */
export function Explain({ summary, children }: { summary?: string; children: ReactNode }) {
  const { t } = useT()
  return (
    <details className="explain">
      <summary>
        <Icon name="info" size={16} />
        {summary ?? t('common.howCalculated')}
      </summary>
      <div className="explain__body">{children}</div>
    </details>
  )
}

/** Fila "concepto → importe" para explicaciones de cálculos. */
export function CalcRow({ label, value, op, strong }: { label: ReactNode; value: string; op?: '+' | '−' | '='; strong?: boolean }) {
  return (
    <div className={`calc-row${strong ? ' calc-row--strong' : ''}`}>
      <span className="calc-row__op" aria-hidden={op ? undefined : true}>{op ?? ''}</span>
      <span className="calc-row__label">{label}</span>
      <span className="calc-row__value">{value}</span>
    </div>
  )
}

export function PageHeader({ title, children, back }: { title: string; children?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="page-header">
      {back && (
        <a className="btn btn--ghost btn--icon-left page-header__back" href={back.href}>
          <Icon name="back" size={18} />
          {back.label}
        </a>
      )}
      <div className="page-header__row">
        <h1 id="page-title" tabIndex={-1}>
          {title}
        </h1>
        {children && <div className="page-header__actions">{children}</div>}
      </div>
    </div>
  )
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
