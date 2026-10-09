/** Ajustes › Etiquetas (§7.7): lista con color y usos, crear/editar, borrar con deshacer. */
import { useState } from 'react'
import { CategoryIcon } from '../../components/CategoryIcon'
import { newId } from '../../../domain/ids'
import { deleteTag, restoreTag, saveTag, tagUsage } from '../../../domain/tagOps'
import type { CategoryColor, Tag } from '../../../domain/types'
import type { Issue } from '../../../domain/validation'
import { useT } from '../../../i18n'
import { useRun } from '../../../state/hooks'
import { useData } from '../../../state/store'
import { Card, EmptyState } from '../../components/common'
import { Dialog } from '../../components/Dialog'
import { TextField } from '../../components/fields'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/toastContext'
import { useFormat } from '../../format'
import { fieldError } from '../../labels'
import { href, withQuery } from '../../router'
import { ColorPicker } from '../../components/categoryPickers'

export function TagsSection() {
  const { t, tn } = useT()
  const data = useData()
  const run = useRun()
  const toast = useToast()
  const [editing, setEditing] = useState<Tag | 'new' | null>(null)

  const remove = async (tag: Tag) => {
    const { result, saved } = await run((d, c) => deleteTag(d, tag.id, c))
    if (!result.ok) return
    toast({ message: saved ? t('tags.deleted') : t('save.error.generic'), tone: saved ? 'good' : 'critical', action: { label: t('common.undo'), onClick: () => void run((d, c) => restoreTag(d, tag, c)) } })
  }

  return (
    <Card labelledBy="tags-title">
      <h2 id="etiquetas" className="card__title">
        <span id="tags-title">{t('tags.title')}</span>
      </h2>
      <p className="note">{t('tags.intro')}</p>
      {data.tags.length === 0 ? (
        <EmptyState compact icon="tag" title={t('tags.empty')} />
      ) : (
        <ul className="item-list" data-testid="tag-list">
          {data.tags.map((tag) => {
            const usage = tagUsage(data, tag.id)
            return (
              <li key={tag.id} className="item">
                <CategoryIcon icon="tag" color={tag.color} />
                <span className="item__main">
                  <a className="item__title" href={href(withQuery('/movimientos', { etiqueta: tag.id }))}>
                    {tag.name}
                  </a>
                  <span className="item__meta">{tn('tags.count', usage.transactions)}</span>
                </span>
                <span className="item__actions">
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(tag)}>
                    <Icon name="edit" size={16} />
                    {t('common.edit')}
                    <span className="sr-only">: {tag.name}</span>
                  </button>
                  <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => void remove(tag)}>
                    {t('common.delete')}
                    <span className="sr-only">: {tag.name}</span>
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" className="btn btn--secondary" onClick={() => setEditing('new')}>
        <Icon name="plus" />
        {t('tags.new')}
      </button>
      {editing && <TagDialog key={editing === 'new' ? 'new' : editing.id} tag={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function TagDialog({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const { t } = useT()
  const fmt = useFormat()
  const run = useRun()
  const toast = useToast()
  const [id] = useState(() => tag?.id ?? newId())
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState<CategoryColor>(tag?.color ?? 'blue')
  const [issues, setIssues] = useState<Issue[]>([])
  const submit = async () => {
    const { result, saved } = await run((d, c) => saveTag(d, { id, name, color }, c))
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    toast({ message: saved ? t('tags.saved') : t('save.error.generic'), tone: saved ? 'good' : 'critical' })
    onClose()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={tag ? t('tags.editTitle') : t('tags.newTitle')}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </>
      }
    >
      <TextField label={t('fields.name')} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} error={fieldError(t, fmt, issues, 'name')} required autoFocus />
      <ColorPicker value={color} onChange={setColor} label={t('categories.color')} />
    </Dialog>
  )
}
