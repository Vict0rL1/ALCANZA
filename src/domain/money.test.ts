import { describe, expect, it } from 'vitest'
import { ceilDiv, floorDiv, formatMoney, groupAmountInput, minorToDecimalString, minorToInputString, mulDivFloor, parseMoney, sumMinor } from './money'

const ok = (input: string, locale = 'es-MX', currency = 'CAD', opts = {}) => {
  const r = parseMoney(input, currency, locale, opts)
  if (!r.ok) throw new Error(`esperaba ok para "${input}", obtuve ${r.error}`)
  return r.minor
}
const err = (input: string, locale = 'es-MX', currency = 'CAD', opts = {}) => {
  const r = parseMoney(input, currency, locale, opts)
  if (r.ok) throw new Error(`esperaba error para "${input}", obtuve ${r.minor}`)
  return r.error
}

describe('parseMoney', () => {
  it('acepta punto o coma como decimal', () => {
    expect(ok('12.50')).toBe(1250)
    expect(ok('12,50')).toBe(1250)
    expect(ok('12,5')).toBe(1250)
    expect(ok('0,1')).toBe(10)
    expect(ok('.5')).toBe(50)
    expect(ok('7')).toBe(700)
  })

  it('reconoce separadores de miles', () => {
    expect(ok('1,234.56')).toBe(123456)
    expect(ok('1.234,56')).toBe(123456)
    expect(ok('1,234,567')).toBe(123456700)
    expect(ok('1 234,56', 'fr-CA')).toBe(123456)
  })

  it('usa el formato elegido cuando hay 3 dígitos tras un único separador', () => {
    expect(ok('1,234', 'es-MX')).toBe(123400)
    expect(ok('1.234', 'es-ES')).toBe(123400)
    expect(err('1.234', 'es-MX')).toBe('tooManyDecimals')
    expect(err('1,234', 'es-ES')).toBe('tooManyDecimals')
  })

  it('ignora símbolos y códigos de moneda', () => {
    expect(ok('$ 45')).toBe(4500)
    expect(ok('CA$12.00')).toBe(1200)
    expect(ok('CAD 3')).toBe(300)
  })

  it('rechaza entradas inválidas', () => {
    expect(err('')).toBe('empty')
    expect(err('   ')).toBe('empty')
    expect(err('abc')).toBe('invalid')
    expect(err('12.3.4,5')).toBe('invalid')
    expect(err('1,2,3.4.5')).toBe('invalid')
    expect(err('12.345')).toBe('tooManyDecimals')
    expect(err('0')).toBe('zero')
    expect(err('999999999999999')).toBe('tooLarge')
  })

  it('negativos solo cuando se permiten (saldos en sobregiro)', () => {
    expect(err('-5')).toBe('negativeNotAllowed')
    expect(ok('-5', 'es-MX', 'CAD', { allowNegative: true })).toBe(-500)
    expect(ok('−12,30', 'es-MX', 'CAD', { allowNegative: true })).toBe(-1230)
    expect(ok('0', 'es-MX', 'CAD', { allowZero: true })).toBe(0)
  })

  it('respeta monedas sin decimales (CLP)', () => {
    expect(ok('1.234', 'es-MX', 'CLP')).toBe(1234)
    expect(ok('5000', 'es-MX', 'CLP')).toBe(5000)
    expect(err('12,5', 'es-MX', 'CLP')).toBe('tooManyDecimals')
  })
})

describe('aritmética entera', () => {
  it('suma sin errores de punto flotante', () => {
    // 0.10 + 0.20 en flotante da 0.30000000000000004; en centavos es exacto.
    expect(sumMinor([10, 20])).toBe(30)
    expect(sumMinor(Array(1000).fill(1))).toBe(1000)
  })

  it('rechaza importes no enteros', () => {
    expect(() => sumMinor([10.5])).toThrow()
  })

  it('floorDiv y ceilDiv redondean correctamente, también con negativos', () => {
    expect(floorDiv(1000, 3)).toBe(333)
    expect(floorDiv(-1000, 3)).toBe(-334)
    expect(ceilDiv(1000, 3)).toBe(334)
    expect(ceilDiv(999, 3)).toBe(333)
    expect(mulDivFloor(1000, 7, 3)).toBe(2333)
    expect(() => floorDiv(1, 0)).toThrow()
  })
})

describe('formato', () => {
  it('convierte a decimal exacto', () => {
    expect(minorToDecimalString(5, 'CAD')).toBe('0.05')
    expect(minorToDecimalString(-5, 'CAD')).toBe('-0.05')
    expect(minorToDecimalString(123456, 'CAD')).toBe('1234.56')
    expect(minorToDecimalString(1234, 'CLP')).toBe('1234')
  })

  it('formatea según la configuración regional', () => {
    expect(formatMoney(123456, 'CAD', 'en-CA')).toBe('$1,234.56')
    expect(formatMoney(-500, 'CAD', 'en-CA')).toBe('-$5.00')
    expect(formatMoney(123456, 'CAD', 'es-ES').replace(/\s/g, ' ')).toBe('1234,56 $')
    expect(formatMoney(123456, 'CAD', 'es-MX')).toBe('$1,234.56')
    expect(formatMoney(1500, 'CAD', 'en-CA', { signDisplay: 'always' })).toBe('+$15.00')
    expect(formatMoney(1234, 'CLP', 'es-MX')).toBe('$1,234')
  })

  it('formatea cifras grandes sin perder precisión', () => {
    expect(formatMoney(999_999_999_999, 'CAD', 'en-CA')).toBe('$9,999,999,999.99')
  })

  it('prepara texto editable con el separador del usuario', () => {
    expect(minorToInputString(123456, 'CAD', 'es-ES')).toBe('1234,56')
    expect(minorToInputString(123456, 'CAD', 'es-MX')).toBe('1234.56')
  })
})

describe('groupAmountInput (E2): miles mientras se escribe', () => {
  it('agrupa por el formato elegido y conserva lo escrito tras el decimal', () => {
    expect(groupAmountInput('1234567', 'es-MX', 'CAD')).toEqual({ text: '1,234,567', caret: 9 })
    expect(groupAmountInput('1234.5', 'es-MX', 'CAD')).toEqual({ text: '1,234.5', caret: 7 })
    expect(groupAmountInput('1234,5', 'es-CO', 'USD')).toEqual({ text: '1.234,5', caret: 7 })
    expect(groupAmountInput('1234,5', 'es-CO', 'COP')).toEqual({ text: '1.234', caret: 5 }) // COP no tiene decimales
    expect(groupAmountInput('1.234.567', 'es-CO', 'COP').text).toBe('1.234.567')
  })

  it('reagrupa un texto ya agrupado y respeta el separador decimal escrito con el otro signo', () => {
    expect(groupAmountInput('1,2345', 'es-MX', 'CAD').text).toBe('12,345')
    expect(groupAmountInput('12,5', 'es-MX', 'CAD').text).toBe('12.5')
    expect(groupAmountInput('12,', 'es-MX', 'CAD').text).toBe('12,') // a medio escribir: no se toca
  })

  it('no toca símbolos, negativos ni textos ambiguos y limita los decimales de la moneda', () => {
    expect(groupAmountInput('$ 45', 'es-MX', 'CAD').text).toBe('$ 45')
    expect(groupAmountInput('-1234', 'es-MX', 'CAD').text).toBe('-1,234')
    expect(groupAmountInput('1234.567', 'es-MX', 'CAD').text).toBe('1,234.56')
    expect(groupAmountInput('1234', 'es-CL', 'CLP').text).toBe('1.234')
    expect(groupAmountInput('', 'es-MX', 'CAD')).toEqual({ text: '', caret: 0 })
  })

  it('mantiene el cursor sobre el mismo dígito', () => {
    // «12|34» → «1,2|34»: el cursor sigue tras el 2.
    expect(groupAmountInput('1234', 'es-MX', 'CAD', 2)).toEqual({ text: '1,234', caret: 3 })
    expect(groupAmountInput('1234567', 'es-MX', 'CAD', 4)).toEqual({ text: '1,234,567', caret: 5 })
  })
})
