/**
 * Campos de formulario con etiqueta, ayuda y error asociados (aria-describedby).
 */
import { useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useT } from '../../i18n'
import type { Formatter } from '../format'

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
  className?: string
}

export function FieldShell({ label, hint, error, children, className }: FieldShellProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={['field', error ? 'field--invalid' : null, className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      {children({ inputId, describedBy, invalid: !!error })}
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId}>
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  )
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null }

export function TextField({ label, hint, error, className, ...rest }: InputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ inputId, describedBy, invalid }) => (
        <input id={inputId} className="input" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest} />
      )}
    </FieldShell>
  )
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string
  hint?: ReactNode
  error?: string | null
}

/** Texto de varias líneas con la misma cáscara (etiqueta, ayuda y error asociados) que `TextField`. */
export function TextAreaField({ label, hint, error, className, ...rest }: TextAreaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ inputId, describedBy, invalid }) => (
        <textarea id={inputId} className="input textarea" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest} />
      )}
    </FieldShell>
  )
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string
  hint?: ReactNode
  error?: string | null
  options: { value: string; label: string }[]
}

export function SelectField({ label, hint, error, options, className, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {({ inputId, describedBy, invalid }) => (
        <select id={inputId} className="input select" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  )
}

export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
  name,
  disabled,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  name?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="check">
      <input id={id} type="checkbox" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <div>
        <label htmlFor={id}>{label}</label>
        {hint && (
          <p className="field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

/** Grupo de opciones (radio) con aspecto de botones segmentados. */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
  hint,
}: {
  legend: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  name: string
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <fieldset className="segmented" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="field__label">{legend}</legend>
      <div className="segmented__options">
        {options.map((o) => (
          <label key={o.value} className={`segmented__option${o.value === value ? ' is-selected' : ''}`}>
            <input type="radio" name={`${name}-${id}`} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </fieldset>
  )
}

export function MoneyField({
  label,
  hint,
  value,
  onChange,
  error,
  fmt,
  big,
  autoFocus,
  name,
}: {
  label: string
  hint?: ReactNode
  value: string
  onChange: (text: string) => void
  error?: string | null
  fmt: Formatter
  big?: boolean
  autoFocus?: boolean
  name?: string
}) {
  const { t } = useT()
  return (
    <FieldShell label={label} hint={hint} error={error} className={big ? 'field--money-big' : undefined}>
      {({ inputId, describedBy, invalid }) => (
        <div className="money-input">
          <span className="money-input__currency" aria-hidden="true">
            {fmt.currency}
          </span>
          <input
            id={inputId}
            name={name}
            className="input money-input__field"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={t('money.placeholder', { sep: fmt.decimalSeparator })}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            autoFocus={autoFocus}
          />
        </div>
      )}
    </FieldShell>
  )
}
