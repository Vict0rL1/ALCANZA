/**
 * ¿Se puede volver (rollback) de un despliegue a otro? Solo si los dos tienen el mismo
 * SCHEMA_VERSION (ver docs/ROLLBACK.md). Cada despliegue lleva en su mensaje
 * `schemaVersion=N build=<hash>` (lo escribe deploy.yml).
 *
 *   node scripts/can-rollback.mjs <desde> <hacia>
 *     cada argumento: un número (10), el mensaje del despliegue («schemaVersion=10 build=…»)
 *     o un commit/etiqueta de git (HEAD, v1.0.0-beta.1, 0b99c4c)
 *   node scripts/can-rollback.mjs --schema     → imprime el SCHEMA_VERSION actual
 *   node scripts/can-rollback.mjs --message <sha> → mensaje para el despliegue de este commit
 *
 * Responde «Sí» (código 0) o «No» (código 1) y por qué.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TYPES = 'src/domain/types.ts'

export function parseSchemaVersion(source) {
  const match = /export const SCHEMA_VERSION = (\d+)/.exec(source ?? '')
  return match ? Number(match[1]) : null
}

/** Esquema de un argumento: número, mensaje de despliegue o commit de git (`readTypes(ref)`). */
export function schemaFrom(arg, readTypes) {
  const text = String(arg).trim()
  if (/^\d+$/.test(text)) return Number(text)
  const fromMessage = /schemaVersion=(\d+)/.exec(text)
  if (fromMessage) return Number(fromMessage[1])
  const fromGit = parseSchemaVersion(readTypes(text))
  if (fromGit !== null) return fromGit
  throw new Error(`No se reconoce «${text}»: usa un número, el mensaje del despliegue (schemaVersion=…) o un commit.`)
}

export function canRollback(from, to) {
  if (from === to) return { ok: true, reason: `los dos usan el esquema ${from}: los datos guardados sirven igual.` }
  if (to < from)
    return {
      ok: false,
      reason:
        `el destino usa el esquema ${to} y los datos ya están en el ${from}. Una versión anterior no los sabe leer ` +
        '(con main, esquema 8, se ve una página en blanco). Corrige hacia delante: revierte el commit y despliega una compilación nueva con el esquema actual.',
    }
  return { ok: false, reason: `el destino usa el esquema ${to}, mayor que ${from}: eso no es volver atrás, es un despliegue normal (por PR y CI).` }
}

export function deploymentMessage(schema, sha) {
  return `schemaVersion=${schema} build=${String(sha).slice(0, 7)}`
}

function readTypesAt(ref) {
  try {
    return execFileSync('git', ['show', `${ref}:${TYPES}`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch {
    return null
  }
}

function main(args) {
  if (args[0] === '--schema') {
    console.log(parseSchemaVersion(readFileSync(TYPES, 'utf8')))
    return 0
  }
  if (args[0] === '--message') {
    console.log(deploymentMessage(parseSchemaVersion(readFileSync(TYPES, 'utf8')), args[1] ?? 'dev'))
    return 0
  }
  if (args.length !== 2) {
    console.error('Uso: node scripts/can-rollback.mjs <desde> <hacia>   (p. ej. 10 10, o HEAD v1.0.0-beta.1)')
    return 2
  }
  const [from, to] = args.map((a) => schemaFrom(a, readTypesAt))
  const result = canRollback(from, to)
  console.log(`${result.ok ? 'Sí' : 'No'}: ${result.reason}`)
  return result.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(2)
  }
}
