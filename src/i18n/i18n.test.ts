import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS } from '../domain/categories'
import { SUPPORTED_CURRENCIES } from '../domain/money'
import { ACCOUNT_KINDS, FREQUENCIES, NUMBER_LOCALES } from '../domain/validation'
import { en } from './en'
import { es } from './es'

const keys = new Set(Object.keys(es))
const has = (k: string) => keys.has(k)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

describe('textos (i18n)', () => {
  it('tiene texto para cada valor dinámico', () => {
    const expected = [
      ...[...EXPENSE_CATEGORY_IDS, ...INCOME_CATEGORY_IDS].map((c) => `category.${c}`),
      ...FREQUENCIES.map((f) => `frequency.${f}`),
      ...['income', 'expense', 'transfer', 'refund'].map((k) => `txKind.${k}`),
      ...['income', 'expense', 'transfer', 'refund'].map((k) => `movementForm.kindHint.${k}`),
      ...['pending', 'overdue', 'paid', 'received', 'skipped'].map((s) => `state.${s}`),
      ...ACCOUNT_KINDS.map((k) => `accountKind.${k}`),
      ...SUPPORTED_CURRENCIES.map((c) => `currency.${c.code}`),
      ...NUMBER_LOCALES.map((l) => `settings.format.locale.${l}`),
      ...['fits', 'tight', 'onlyWithGoals', 'doesNotFit'].flatMap((v) => [`afford.verdict.${v}`, `afford.verdictText.${v}`]),
      ...['empty', 'invalid', 'tooManyDecimals', 'negativeNotAllowed', 'tooLarge', 'zero'].map((e) => `money.error.${e}`),
      ...['today', 'tomorrow', 'yesterday'].map((r) => `relative.${r}`),
    ]
    expect(expected.filter((k) => !has(k))).toEqual([])
  })

  it('tiene mensaje para cada código de validación', () => {
    const validation = readFileSync(join(__dirname, '../domain/validation.ts'), 'utf8')
    const union = validation.slice(validation.indexOf('export type IssueCode'), validation.indexOf('export interface Issue'))
    const codes = [...union.matchAll(/'(\w+)'/g)].map((m) => m[1])
    const backup = readFileSync(join(__dirname, '../storage/backup.ts'), 'utf8')
    const backupLine = backup.slice(backup.indexOf('export type BackupIssueCode'), backup.indexOf('\n', backup.indexOf('export type BackupIssueCode')))
    codes.push(...[...backupLine.matchAll(/'(\w+)'/g)].map((m) => m[1]))
    expect(codes.length).toBeGreaterThan(20)
    expect(codes.filter((c) => !has(`issue.${c}`))).toEqual([])
  })

  it('cada clave usada en el código existe (incluye singular y plural)', () => {
    const missing: string[] = []
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\bt\('([\w.-]+)'/g)) if (!has(m[1]!)) missing.push(`${file}: ${m[1]}`)
      for (const m of text.matchAll(/\btn\('([\w.-]+)'/g)) {
        for (const form of ['one', 'other']) if (!has(`${m[1]}_${form}`)) missing.push(`${file}: ${m[1]}_${form}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('el inglés solo usa claves existentes', () => {
    expect(Object.keys(en).filter((k) => !has(k))).toEqual([])
  })

  it('las variables {x} del inglés coinciden con las del español', () => {
    for (const [k, v] of Object.entries(en)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(vars(v!), k).toEqual(vars(es[k as keyof typeof es]))
    }
  })
})
