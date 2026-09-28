/** Textos derivados de datos (categorías, nombres, mensajes de validación). */
import type { PlanItem } from '../domain/planItems'
import type { Account, Frequency, Transaction } from '../domain/types'
import type { Issue } from '../domain/validation'
import type { ImportIssue } from '../storage/backup'
import type { MessageKey, Translator } from '../i18n'
import type { Formatter } from './format'

export function categoryLabel(t: Translator['t'], id: string | undefined): string {
  if (!id) return ''
  return t(`category.${id}` as MessageKey)
}

export function frequencyLabel(t: Translator['t'], f: Frequency): string {
  return t(`frequency.${f}` as MessageKey)
}

export function accountName(accounts: Account[], id: string | undefined, t: Translator['t']): string {
  return accounts.find((a) => a.id === id)?.name ?? t('common.unknownAccount')
}

export function planItemName(item: PlanItem, t: Translator['t']): string {
  return item.name || categoryLabel(t, item.categoryId) || t(`txKind.${item.direction}` as MessageKey)
}

export function transactionTitle(tx: Transaction, accounts: Account[], t: Translator['t']): string {
  if (tx.note) return tx.note
  if (tx.kind === 'transfer') {
    return t('movements.transferTitle', { from: accountName(accounts, tx.accountId, t), to: accountName(accounts, tx.toAccountId, t) })
  }
  return categoryLabel(t, tx.categoryId) || t(`txKind.${tx.kind}` as MessageKey)
}

/** Mensaje legible para un problema de validación; los importes se formatean. */
export function issueMessage(t: Translator['t'], fmt: Formatter | null, issue: Issue | ImportIssue): string {
  const params: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(issue.params ?? {})) {
    params[k] = k.endsWith('Minor') && typeof v === 'number' && fmt ? fmt.money(v) : v
  }
  return t(`issue.${issue.code}` as MessageKey, params)
}

/** Mensaje para el primer problema de un campo concreto. */
export function fieldError(t: Translator['t'], fmt: Formatter | null, issues: Issue[], path: string): string | null {
  const issue = issues.find((i) => i.path === path)
  return issue ? issueMessage(t, fmt, issue) : null
}

/** Problemas que no corresponden a ningún campo visible. */
export function otherIssues(issues: Issue[], knownPaths: string[]): Issue[] {
  return issues.filter((i) => !knownPaths.includes(i.path))
}
