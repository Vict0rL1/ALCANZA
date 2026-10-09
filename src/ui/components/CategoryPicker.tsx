/**
 * Selector de categoría (D5): un campo que abre una hoja inferior con búsqueda (sin acentos ni
 * mayúsculas), «Recientes», los grupos con su color y cada categoría con su icono, y «+ Nueva
 * categoría» al final (se crea sin salir del formulario). Teclado: flechas para moverse, Enter
 * elige, Esc cierra. Sustituye a los <select> de categoría; en modo `multiple` marca varias.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CategoryIcon } from './CategoryIcon'
import { categoriesForKind, resolveCategories, resolveGroups, SYSTEM_GROUP_IDS } from '../../domain/categories'
import { saveCategoryV2 } from '../../domain/categoryOps'
import { recentCategories } from '../../domain/quickEntry'
import type { AppData, Category, CategoryColor, CategoryGroup } from '../../domain/types'
import { useT, type MessageKey } from '../../i18n'
import { useRun } from '../../state/hooks'
import { newId } from '../../domain/ids'
import { categoryLabel } from '../labels'
import { ColorPicker, IconPicker } from './categoryPickers'
import { BottomSheet, SearchBar } from './base'
import { FieldShell, SelectField, TextField } from './fields'
import { Icon } from './Icon'

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()

type Kind = 'expense' | 'income'

interface BaseProps {
  label: string
  kind: Kind
  data: Pick<AppData, 'categories' | 'categoryPrefs' | 'categoryGroups' | 'transactions'>
  hint?: ReactNode
  error?: string | null
  /** Permite crear una categoría desde la hoja. */
  allowNew?: boolean
  /** Categoría archivada en uso: se sigue ofreciendo. */
  keep?: string
  /** Incluye las archivadas (filtros: los movimientos antiguos las conservan). */
  includeArchived?: boolean
  /** Limita las opciones a estos ids (p. ej. categorías libres para un límite). */
  only?: readonly string[]
  className?: string
  testId?: string
  /** Texto del campo cuando no hay nada elegido (p. ej. «Todas las categorías» en filtros). */
  placeholder?: string
}

type SingleProps = BaseProps & { multiple?: false; value: string; onChange: (id: string) => void }
type MultiProps = BaseProps & { multiple: true; value: string[]; onChange: (ids: string[]) => void }
export type CategoryPickerProps = SingleProps | MultiProps

function groupName(t: ReturnType<typeof useT>['t'], g: CategoryGroup): string {
  return g.nameKey ? t(g.nameKey as MessageKey) : (g.name ?? g.id)
}

export function CategoryPicker(props: CategoryPickerProps) {
  const { label, kind, data, hint, error, allowNew, keep, includeArchived, only, className, testId, placeholder } = props
  const { t, tn } = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = useMemo(() => new Set(props.multiple ? props.value : props.value ? [props.value] : []), [props.multiple, props.value])

  const allowed = useMemo(() => {
    const ids = new Set(categoriesForKind(kind, data.categories, { prefs: data.categoryPrefs, includeArchived }).filter((id) => !only || only.includes(id)))
    if (keep) ids.add(keep)
    for (const id of selected) ids.add(id)
    return ids
  }, [kind, data.categories, data.categoryPrefs, keep, includeArchived, only, selected])
  const categories = useMemo(() => resolveCategories(data).filter((c) => allowed.has(c.id)), [data, allowed])
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const groups = useMemo(() => resolveGroups(data), [data])
  const recent = useMemo(() => recentCategories(data, kind, 6).filter((id) => byId.has(id)), [data, kind, byId])
  const q = fold(query.trim())
  const matches = (c: Category) => !q || fold(name(c)).includes(q)
  const name = (c: Category) => (c.isCustom ? (c.name ?? c.id) : (c.name ?? categoryLabel(t, c.id)))

  const pick = (id: string) => {
    if (props.multiple) {
      const next = new Set(props.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      props.onChange([...next])
      return
    }
    props.onChange(id)
    close()
  }
  const close = () => {
    setOpen(false)
    setQuery('')
    setCreating(false)
  }

  // Teclado: flechas entre las opciones de la hoja; Enter es el clic nativo del botón. Esc cierra
  // siempre la hoja (en un <input type="search"> el navegador lo usaría para vaciar el texto).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-option]') ?? [])
    if (options.length === 0) return
    const i = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % options.length : (i - 1 + options.length) % options.length
    options[next]?.focus()
    e.preventDefault()
  }

  const summary = props.multiple
    ? props.value.length === 0
      ? (placeholder ?? t('picker.all'))
      : props.value.length <= 2
        ? props.value.map((id) => (byId.get(id) ? name(byId.get(id)!) : categoryLabel(t, id))).join(', ')
        : tn('picker.selectedCount', props.value.length)
    : props.value && byId.get(props.value)
      ? name(byId.get(props.value)!)
      : props.value
        ? categoryLabel(t, props.value)
        : (placeholder ?? t('picker.choose'))
  const current = !props.multiple && props.value ? byId.get(props.value) : undefined
  const currentValue = props.multiple ? props.value.join(',') : props.value

  const option = (c: Category) => (
    <button key={c.id} type="button" className={`cat-chip picker__option${selected.has(c.id) ? ' is-selected' : ''}`} aria-pressed={selected.has(c.id)} onClick={() => pick(c.id)} data-option={c.id} role="option" aria-selected={selected.has(c.id)}>
      <CategoryIcon icon={c.icon} color={c.color} />
      <span className="cat-chip__label">{name(c)}</span>
      {selected.has(c.id) && <Icon name="check" size={14} className="cat-chip__check" />}
    </button>
  )

  const grouped = groups.map((g) => ({ g, items: categories.filter((c) => c.groupId === g.id && matches(c)) })).filter((x) => x.items.length > 0)
  const ungrouped = categories.filter((c) => !groups.some((g) => g.id === c.groupId) && matches(c))
  const recentItems = q ? [] : recent.map((id) => byId.get(id)!).filter(Boolean)
  const total = grouped.reduce((n, x) => n + x.items.length, 0) + ungrouped.length

  return (
    <>
      <FieldShell label={label} hint={hint} error={error} className={className}>
        {({ inputId, describedBy, invalid }) => (
          <button type="button" id={inputId} className="input picker-field" aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} data-testid={testId} data-value={currentValue}>
            {current && (
              <CategoryIcon icon={current.icon} color={current.color} />
            )}
            <span className="picker-field__text">{summary}</span>
            <Icon name="down" size={16} className="picker-field__chevron" />
          </button>
        )}
      </FieldShell>
      <BottomSheet
        open={open}
        onClose={close}
        title={label}
        footer={
          props.multiple ? (
            <button type="button" className="btn btn--primary btn--large" onClick={close}>
              {t('picker.done')}
            </button>
          ) : undefined
        }
      >
        {creating ? (
          <NewCategoryForm kind={kind} groups={groups} onCancel={() => setCreating(false)} onCreated={(id) => pick(id)} />
        ) : (
          <div className="stack picker" onKeyDown={onKeyDown} ref={listRef} data-testid="category-picker">
            <SearchBar value={query} onChange={setQuery} label={t('picker.search')} placeholder={t('picker.search')} clearLabel={t('common.clear')} autoFocus />
            <p className="sr-only">{t('picker.keyboardHint')}</p>
            {recentItems.length > 0 && (
              <section className="picker__group" aria-label={t('picker.recent')}>
                <h3 className="picker__group-title">{t('picker.recent')}</h3>
                <div className="chip-wrap" role="listbox" aria-label={t('picker.recent')} aria-multiselectable={props.multiple || undefined}>
                  {recentItems.map(option)}
                </div>
              </section>
            )}
            {grouped.map(({ g, items }) => (
              <section key={g.id} className="picker__group" aria-label={groupName(t, g)}>
                <h3 className="picker__group-title">
                  <span className={`cat-swatch cat-dot--${g.color} picker__group-dot`} aria-hidden="true" />
                  {groupName(t, g)}
                </h3>
                <div className="chip-wrap" role="listbox" aria-label={groupName(t, g)} aria-multiselectable={props.multiple || undefined}>
                  {items.map(option)}
                </div>
              </section>
            ))}
            {ungrouped.length > 0 && (
              <div className="chip-wrap" role="listbox" aria-label={label}>
                {ungrouped.map(option)}
              </div>
            )}
            {total === 0 && (
              <p className="note" role="status">
                {t('picker.empty', { q: query.trim() })}
              </p>
            )}
            {allowNew && (
              <button type="button" className="btn btn--secondary" onClick={() => setCreating(true)} data-testid="picker-new">
                {t('picker.new')}
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  )
}

/** Alta mínima (nombre, icono, color, grupo) sin salir del formulario; guarda con `saveCategoryV2`. */
function NewCategoryForm({ kind, groups, onCancel, onCreated }: { kind: Kind; groups: CategoryGroup[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const { t } = useT()
  const run = useRun()
  const id = useId()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('tag')
  const [color, setColor] = useState<CategoryColor>('teal')
  const [groupId, setGroupId] = useState(kind === 'income' ? 'income' : 'other')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const groupOptions = groups.filter((g) => (kind === 'income' ? g.id === 'income' || !(SYSTEM_GROUP_IDS as readonly string[]).includes(g.id) : g.id !== 'income'))
  const [newIdValue] = useState(() => `c_${newId()}`)

  const submit = async () => {
    if (!name.trim()) {
      setError(t('issue.required'))
      return
    }
    setBusy(true)
    const { result, saved } = await run((d, c) => saveCategoryV2(d, { id: newIdValue, name: name.trim(), kind, groupId, icon, color }, c))
    setBusy(false)
    if (!result.ok) {
      setError(result.issues.map((i) => t(`issue.${i.code}` as MessageKey)).join(' '))
      return
    }
    if (saved) onCreated(result.value.id)
  }

  // Sin <form> anidado: el selector vive dentro del formulario de la pantalla y un envío aquí
  // dispararía también el de fuera. Enter en el nombre crea la categoría.
  return (
    <div className="stack picker__new" role="group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="section-title">
        {t('picker.newTitle')}
      </h3>
      <TextField
        label={t('picker.newName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            void submit()
          }
        }}
        maxLength={40}
        error={error}
        autoFocus
        data-testid="picker-new-name"
      />
      <IconPicker value={icon} onChange={setIcon} label={t('categories.icon')} />
      <ColorPicker value={color} onChange={setColor} label={t('categories.color')} />
      <SelectField label={t('categories.group')} value={groupId} onChange={(e) => setGroupId(e.target.value)} options={groupOptions.map((g) => ({ value: g.id, label: groupName(t, g) }))} />
      <div className="button-row">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void submit()} data-testid="picker-new-save">
          {t('picker.newSave')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
