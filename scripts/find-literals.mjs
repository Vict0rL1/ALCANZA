#!/usr/bin/env node
/**
 * Detecta texto visible escrito directamente en componentes (`src/ui`), fuera de i18n.
 *
 * Recorre el AST con el compilador de TypeScript (ya es dependencia del proyecto) y señala:
 *   - nodos de texto JSX (`<p>Hola</p>`),
 *   - literales de cadena en atributos visibles (`placeholder`, `title`, `aria-label`,
 *     `aria-description`, `alt`, `label`, `hint`, `legend`, `caption`),
 * siempre que contengan al menos 3 letras seguidas. Se ignoran:
 *   - líneas con el comentario `i18n-ignore` (misma línea o anterior),
 *   - cadenas sin letras (símbolos, números, «•••», «—», «→»),
 *   - palabras de la lista blanca (nombre del producto y nombres propios de tecnologías).
 *
 * Uso: `node scripts/find-literals.mjs` (sale con código 1 si encuentra literales).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const ROOT = new URL('../src/ui', import.meta.url).pathname
const ALLOW = new Set(['Clara', 'Margen', 'IndexedDB', 'CSV', 'JSON', 'PDF', 'PWA', 'Mac', 'Cmd', 'Ctrl', 'Shift', 'Alt', 'Enter', 'Esc', 'ISO', 'UTC', 'MB', 'kB', 'https', 'localhost'])
const VISIBLE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'label', 'hint', 'legend', 'caption', 'description'])
const LETTERS = /\p{L}{3,}/u

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : []
  })
}

function isAllowed(text) {
  if (!LETTERS.test(text)) return true
  const words = text.match(/\p{L}+/gu) ?? []
  return words.every((w) => ALLOW.has(w) || w.length < 3)
}

const findings = []
for (const file of files(ROOT)) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const ignored = (line) => (lines[line - 1] ?? '').includes('i18n-ignore') || (lines[line - 2] ?? '').includes('i18n-ignore')
  const report = (node, text, shown = text) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    if (!ignored(line) && !isAllowed(text)) findings.push({ file, line, text: shown.trim() })
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf)
      if (VISIBLE_ATTRS.has(name)) report(node, node.initializer.text, `${name}="${node.initializer.text}"`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (findings.length === 0) {
  console.log('find-literals: sin texto visible fuera de i18n en src/ui.')
  process.exit(0)
}
for (const f of findings) console.log(`${relative(process.cwd(), f.file)}:${f.line}: ${f.text}`)
console.log(`\nfind-literals: ${findings.length} literal(es). Mueve el texto a src/i18n/*.ts o marca la línea con // i18n-ignore.`)
process.exit(1)
