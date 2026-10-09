/**
 * Ajustes › Categorías (§7.6): pestañas gasto/ingreso, búsqueda, grupos con contador, crear y
 * editar (icono, color, grupo), archivar con reasignación, reordenar y grupos propios.
 * Las categorías de Clara se editan mediante preferencias; nada se borra.
 */
import { useMemo, useState } from 'react'
import { CATEGORY_COLOR_LIST, resolveCategories, resolveGroups, SYSTEM_GROUP_IDS } from '../../domain/categories'
import { categoryUsage, deleteCategoryGroup, moveCategory, saveCategoryGroup, saveCategoryV2, setCategoryArchivedV2 } from '../../domain/categoryOps'
import { newId } from '../../domain/ids'
import type { Category, CategoryColor, CategoryGroup } from '../../domain/types'
import type { Issue } from '../../domain/validation'
import { useT, type MessageKey } from '../../i18n'
import { useRun } from '../../state/hooks'
import { useData } from '../../state/store'
import { normalizeText } from '../../domain/rules'
import { CategoryChip, PrimaryButton, SearchBar, SecondaryButton, TextButton, Toggle } from '../components/base'
import { CategoryIcon } from '../components/CategoryIcon'
import { Alert, Badge, Card, PageHeader } from '../components/common'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { SelectField, Segmented, TextField } from '../components/fields'
import { Icon } from '../components/Icon'
import { CATEGORY_ICON_NAMES } from '../components/iconPaths'
import { useToast } from '../components/toastContext'
import { useFormat } from '../format'
import { href } from '../router'
import { categoryLabel, fieldError, issueMessage } from '../labels'

type Kind = 'expense' | 'income'

function groupName(t: ReturnType<typeof useT>['t'], g: CategoryGroup): string {
  return g.nameKey ? t(g.nameKey as MessageKey) : (g.name ?? g.id)
}

export function Categories() {
  const { t, tn } = useT()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const fmt = useFormat()
  const [kind, setKind] = useState<Kind>('expense')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [archiving, setArchiving] = useState<Category | null>(null)
  const [groupEditing, setGroupEditing] = useState<CategoryGroup | 'new' | null>(null)
  const [groupDeleting, setGroupDeleting] = useState<CategoryGroup | null>(null)
  const [error, setError] = useState<Issue | null>(null)

  const all = useMemo(() => resolveCategories(data), [data])
  const groups = useMemo(() => resolveGroups(data), [data])
  const label = (c: Category) => c.name ?? categoryLabel(t, c.id)
  const ofKind = all.filter((c) => c.kind === kind)
  const q = normalizeText(query)
  const visible = ofKind.filter((c) => (showArchived || !c.archived) && (!q || normalizeText(label(c)).includes(q)))
  const active = ofKind.filter((c) => !c.archived).length
  const archived = ofKind.length - active
  const byGroup = groups.map((g) => ({ group: g, items: visible.filter((c) => c.groupId === g.id) })).filter((x) => x.items.length > 0)
  const orphan = visible.filter((c) => !groups.some((g) => g.id === c.groupId))

  const move = async (c: Category, dir: -1 | 1) => {
    const { result, saved } = await run((d, ctx) => moveCategory(d, c.id, dir, ctx))
    if (!result.ok) setError(result.issues[0] ?? null)
    else if (!saved && !result.unchanged) toast({ message: t('save.error.generic'), tone: 'critical' })
  }

  const restore = async (c: Category) => {
    const { result, saved } = await run((d, ctx) => setCategoryArchivedV2(d, c.id, false, ctx))
    if (!result.ok) setError(result.issues[0] ?? null)
    else toast({ message: saved ? t('categories.unarchivedDone') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
  }

  const row = (c: Category) => (
    <li key={c.id} className="list-row" data-testid={`category-${c.id}`}>
      <CategoryIcon icon={c.icon} color={c.color} />
      <span className="list-row__main">
        <span className="list-row__title">{label(c)}</span>
        <span className="item__badges">
          <Badge>{t(c.isCustom ? 'categories.custom' : 'categories.builtIn')}</Badge>
          {c.archived && <Badge icon="lock">{t('categories.archived')}</Badge>}
          <Badge>{tn('categories.usageShort', categoryUsage(data, c.id))}</Badge>
        </span>
      </span>
      <span className="cat-row__actions">
        {!c.archived && (
          <>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => void move(c, -1)} aria-label={t('categories.moveUp', { name: label(c) })}>
              <Icon name="up" size={16} />
            </button>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => void move(c, 1)} aria-label={t('categories.moveDown', { name: label(c) })}>
              <Icon name="down" size={16} />
            </button>
          </>
        )}
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => setEditing(c)} aria-label={`${t('common.edit')}: ${label(c)}`}>
          <Icon name="edit" size={16} />
        </button>
        {c.archived ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => void restore(c)}>
            {t('categories.unarchive')}
            <span className="sr-only">: {label(c)}</span>
          </button>
        ) : (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setArchiving(c)}>
            {t('categories.archive')}
            <span className="sr-only">: {label(c)}</span>
          </button>
        )}
      </span>
    </li>
  )

  return (
    <div className="stack">
      <PageHeader title={t('categories.title')} back={{ href: href('/ajustes'), label: t('settings.title') }}>
        <PrimaryButton icon="plus" onClick={() => setEditing('new')}>
          {t('categories.add')}
        </PrimaryButton>
      </PageHeader>
      <p className="muted">{t('categories.text')}</p>
      <Card>
        <Segmented legend={t('categories.tabsAria')} name="catkind" value={kind} onChange={setKind} options={[{ value: 'expense', label: `${t('categories.kindExpense')} (${all.filter((c) => c.kind === 'expense' && !c.archived).length})` }, { value: 'income', label: `${t('categories.kindIncome')} (${all.filter((c) => c.kind === 'income' && !c.archived).length})` }]} />
        <SearchBar value={query} onChange={setQuery} label={t('categories.search')} placeholder={t('categories.search')} clearLabel={t('gallery.clear')} />
        <p className="muted">
          {tn('categories.summary', active)}
          {archived > 0 ? ` · ${tn('categories.archivedCount', archived)}` : ''}
        </p>
        {archived > 0 && <Toggle checked={showArchived} onChange={setShowArchived} label={t('categories.showArchived')} />}
        {error && <Alert tone="critical" title={issueMessage(t, fmt, error)} role="alert" />}
        {visible.length === 0 && q && <p>{t('categories.noMatch', { query })}</p>}
        {byGroup.map(({ group, items }) => (
          <section key={group.id} className="cat-group" aria-label={groupName(t, group)}>
            <p className="cat-group__title">
              <span className={`cat-swatch cat-swatch--lg cat-dot--${group.color}`} aria-hidden="true" />
              {groupName(t, group)} · {tn('categories.groupCount', items.length)}
            </p>
            <ul className="plain-list">{items.map(row)}</ul>
          </section>
        ))}
        {orphan.length > 0 && <ul className="plain-list">{orphan.map(row)}</ul>}
      </Card>

      <Card labelledBy="groups-title">
        <h2 id="groups-title" className="card__title">
          {t('categories.groups')}
        </h2>
        <p className="note">{t('categories.groupsText')}</p>
        <ul className="plain-list">
          {groups.map((g) => {
            const members = all.filter((c) => c.groupId === g.id && !c.archived)
            const system = (SYSTEM_GROUP_IDS as readonly string[]).includes(g.id)
            return (
              <li key={g.id} className="list-row">
                <CategoryIcon icon="folder" color={g.color} />
                <span className="list-row__main">
                  <span className="list-row__title">{groupName(t, g)}</span>
                  <span className="list-row__subtitle">{tn('categories.groupCount', members.length)}</span>
                </span>
                {!system && (
                  <span className="cat-row__actions">
                    <button type="button" className="btn btn--ghost btn--icon" onClick={() => setGroupEditing(g)} aria-label={`${t('categories.editGroup')}: ${groupName(t, g)}`}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button type="button" className="btn btn--ghost btn--icon" onClick={() => setGroupDeleting(g)} aria-label={`${t('categories.deleteGroup')}: ${groupName(t, g)}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <SecondaryButton icon="plus" onClick={() => setGroupEditing('new')}>
          {t('categories.newGroup')}
        </SecondaryButton>
      </Card>

      {editing && <CategoryDialog category={editing === 'new' ? null : editing} defaultKind={kind} groups={groups} onClose={() => setEditing(null)} />}
      {archiving && <ArchiveDialog category={archiving} all={all} onClose={() => setArchiving(null)} />}
      {groupEditing && <GroupDialog group={groupEditing === 'new' ? null : groupEditing} onClose={() => setGroupEditing(null)} />}
      {groupDeleting && (
        <ConfirmDialog
          open
          title={t('categories.deleteGroupTitle', { name: groupName(t, groupDeleting) })}
          confirmLabel={t('categories.deleteGroup')}
          destructive
          onCancel={() => setGroupDeleting(null)}
          onConfirm={() => {
            const g = groupDeleting
            setGroupDeleting(null)
            void run((d, ctx) => deleteCategoryGroup(d, g.id, ctx)).then(({ saved }) => toast({ message: saved ? t('categories.groupDeleted') : t('save.error.generic'), tone: saved ? 'good' : 'critical' }))
          }}
        >
          <p>{t('categories.deleteGroupText')}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

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

function CategoryDialog({ category, defaultKind, groups, onClose }: { category: Category | null; defaultKind: Kind; groups: CategoryGroup[]; onClose: () => void }) {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  const [id] = useState(() => category?.id ?? `c_${newId()}`)
  const [name, setName] = useState(category ? (category.isCustom ? category.name ?? '' : (category.name ?? '')) : '')
  const [kind, setKind] = useState<Kind>(category?.kind ?? defaultKind)
  const [groupId, setGroupId] = useState(category?.groupId ?? (defaultKind === 'income' ? 'income' : 'other'))
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const [color, setColor] = useState<CategoryColor>(category?.color ?? 'teal')
  const [issues, setIssues] = useState<Issue[]>([])
  const groupOptions = groups.filter((g) => (kind === 'income' ? g.id === 'income' || !(SYSTEM_GROUP_IDS as readonly string[]).includes(g.id) : g.id !== 'income'))

  const submit = async () => {
    const { result, saved } = await run((d, c) => saveCategoryV2(d, { id, name, kind, groupId, icon, color }, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('categories.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? t('categories.editTitle') : t('categories.newTitle')}
      onSubmit={() => void submit()}
      footer={
        <>
          <TextButton onClick={onClose}>{t('common.cancel')}</TextButton>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="gallery__row">
        <CategoryChip label={name.trim() || (category ? categoryLabel(t, category.id) : t('fields.name'))} icon={icon} color={color} />
      </div>
      <TextField label={t('fields.name')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} error={fieldError(t, fmt, issues, 'name')} required={!category || category.isCustom} hint={category && !category.isCustom ? t('categories.nameHint') : undefined} placeholder={category && !category.isCustom ? categoryLabel(t, category.id) : undefined} autoFocus />
      {category ? (
        <p className="note">
          {t(category.kind === 'income' ? 'categories.kindIncome' : 'categories.kindExpense')} · {t('categories.kindFixed')}
        </p>
      ) : (
        <Segmented
          legend={t('categories.kind')}
          name="newcatkind"
          value={kind}
          onChange={(k) => {
            setKind(k)
            setGroupId(k === 'income' ? 'income' : 'other')
          }}
          options={[
            { value: 'expense', label: t('categories.kindExpense') },
            { value: 'income', label: t('categories.kindIncome') },
          ]}
          hint={t('categories.kindFixed')}
        />
      )}
      <SelectField label={t('categories.group')} value={groupId} onChange={(e) => setGroupId(e.target.value)} options={groupOptions.map((g) => ({ value: g.id, label: groupName(t, g) }))} error={fieldError(t, fmt, issues, 'groupId')} />
      <ColorPicker value={color} onChange={setColor} label={t('categories.color')} />
      <IconPicker value={icon} onChange={setIcon} label={t('categories.icon')} />
    </Dialog>
  )
}

function ArchiveDialog({ category, all, onClose }: { category: Category; all: Category[]; onClose: () => void }) {
  const { t, tn } = useT()
  const fmt = useFormat()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [target, setTarget] = useState('')
  const [issue, setIssue] = useState<Issue | null>(null)
  const label = (c: Category) => c.name ?? categoryLabel(t, c.id)
  const uses = categoryUsage(data, category.id)
  const targets = all.filter((c) => c.kind === category.kind && !c.archived && c.id !== category.id)

  const submit = async () => {
    const { result, saved } = await run((d, ctx) => setCategoryArchivedV2(d, category.id, true, ctx, target ? { reassignTo: target } : {}))
    if (!result.ok) {
      setIssue(result.issues[0] ?? null)
      return
    }
    toast({ message: saved ? (target ? tn('categories.archivedWithMoves', uses) : t('categories.archivedDone')) : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('categories.archiveTitle', { name: label(category) })}
      onSubmit={() => void submit()}
      footer={
        <>
          <TextButton onClick={onClose}>{t('common.cancel')}</TextButton>
          <button type="submit" className="btn btn--primary">
            {t('categories.archive')}
          </button>
        </>
      }
    >
      <p>{t('categories.archiveText')}</p>
      {uses > 0 && (
        <>
          <p>{tn('categories.archiveUsage', uses)}</p>
          <SelectField label={t('categories.reassign')} value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: '', label: t('categories.reassignNone') }, ...targets.map((c) => ({ value: c.id, label: label(c) }))]} hint={t('categories.reassignHint')} />
        </>
      )}
      {issue && <Alert tone="critical" title={issueMessage(t, fmt, issue)} role="alert" />}
    </Dialog>
  )
}

function GroupDialog({ group, onClose }: { group: CategoryGroup | null; onClose: () => void }) {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  const [id] = useState(() => group?.id ?? `g_${newId()}`)
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState<CategoryColor>(group?.color ?? 'teal')
  const [issues, setIssues] = useState<Issue[]>([])

  const submit = async () => {
    const { result, saved } = await run((d, c) => saveCategoryGroup(d, { id, name, color }, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('categories.groupSaved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? t('categories.editGroup') : t('categories.newGroup')}
      onSubmit={() => void submit()}
      footer={
        <>
          <TextButton onClick={onClose}>{t('common.cancel')}</TextButton>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <TextField label={t('fields.name')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} error={fieldError(t, fmt, issues, 'name')} required autoFocus />
      <ColorPicker value={color} onChange={setColor} label={t('categories.color')} />
    </Dialog>
  )
}
