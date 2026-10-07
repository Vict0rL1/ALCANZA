/**
 * Pseudo-locale para detectar texto sin traducir y problemas de ancho (§10 del master prompt).
 * Transforma cada texto del diccionario base: acentúa las letras, alarga ~30 % y lo envuelve en
 * «[ ]». Las variables `{nombre}` y los signos se conservan tal cual, así la interpolación sigue
 * funcionando. Un texto que aparezca sin corchetes en la interfaz no pasa por i18n.
 */
const MAP: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', c: 'ç', n: 'ñ', s: 'š', y: 'ý', z: 'ž',
  A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', C: 'Ç', N: 'Ñ', S: 'Š', Y: 'Ý', Z: 'Ž',
}

export function pseudoLocalize(text: string): string {
  const parts = text.split(/(\{\w+\})/g)
  const body = parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(/\p{L}/gu, (ch) => MAP[ch] ?? ch)
    })
    .join('')
  const letters = (text.replace(/\{\w+\}/g, '').match(/\p{L}/gu) ?? []).length
  const pad = '~'.repeat(Math.ceil(letters * 0.3))
  return `[${body}${pad}]`
}

export function pseudoDictionary<K extends string>(base: Record<K, string>): Record<K, string> {
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, pseudoLocalize(v as string)])) as Record<K, string>
}
