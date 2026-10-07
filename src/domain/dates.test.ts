import { describe, expect, it } from 'vitest'
import { addDays, addMonthsClamped, daysBetween, isValidLocalDate, todayInTimeZone, wholeMonthsBetween, weekday } from './dates'
import { nthOccurrence, occurrencesBetween } from './recurrence'

describe('fechas de calendario', () => {
  it('valida fechas reales', () => {
    expect(isValidLocalDate('2026-02-28')).toBe(true)
    expect(isValidLocalDate('2026-02-29')).toBe(false)
    expect(isValidLocalDate('2028-02-29')).toBe(true)
    expect(isValidLocalDate('2026-13-01')).toBe(false)
    expect(isValidLocalDate('2026-9-1')).toBe(false)
    expect(isValidLocalDate(20260901)).toBe(false)
  })

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('cuenta días sin verse afectado por el horario de verano', () => {
    // En Toronto el horario cambia el 8-mar-2026 y el 1-nov-2026.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(daysBetween('2026-09-28', '2026-09-28')).toBe(0)
    expect(daysBetween('2026-10-03', '2026-09-28')).toBe(-5)
  })

  it('suma meses usando el último día cuando el mes es más corto', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31')
  })

  it('calcula "hoy" en la zona horaria del usuario', () => {
    const instant = new Date('2026-10-01T03:30:00Z')
    expect(todayInTimeZone('America/Toronto', instant)).toBe('2026-09-30')
    expect(todayInTimeZone('America/Vancouver', instant)).toBe('2026-09-30')
    expect(todayInTimeZone('UTC', instant)).toBe('2026-10-01')
    expect(todayInTimeZone('Asia/Tokyo', instant)).toBe('2026-10-01')
  })

  it('meses completos y día de la semana', () => {
    expect(wholeMonthsBetween('2026-09-28', '2026-12-28')).toBe(3)
    expect(wholeMonthsBetween('2026-09-28', '2026-12-27')).toBe(2)
    expect(wholeMonthsBetween('2026-01-31', '2026-02-28')).toBe(1)
    expect(weekday('2026-09-28')).toBe(1) // lunes
  })
})

describe('recurrencias', () => {
  it('mensual el día 31: usa el último día de meses cortos y vuelve al 31', () => {
    const s = { frequency: 'monthly' as const, startDate: '2026-01-31' }
    expect(occurrencesBetween(s, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
  })

  it('mensual el día 29 y 30 en febrero bisiesto y no bisiesto', () => {
    expect(nthOccurrence({ frequency: 'monthly', startDate: '2027-01-29' }, 1)).toBe('2027-02-28')
    expect(nthOccurrence({ frequency: 'monthly', startDate: '2028-01-29' }, 1)).toBe('2028-02-29')
    expect(nthOccurrence({ frequency: 'monthly', startDate: '2026-01-30' }, 1)).toBe('2026-02-28')
    expect(nthOccurrence({ frequency: 'monthly', startDate: '2026-01-30' }, 2)).toBe('2026-03-30')
  })

  it('anual el 29 de febrero', () => {
    const s = { frequency: 'yearly' as const, startDate: '2028-02-29' }
    expect(occurrencesBetween(s, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })

  it('quincenal desde una fecha y dentro de una ventana', () => {
    const s = { frequency: 'biweekly' as const, startDate: '2026-09-04' }
    expect(occurrencesBetween(s, '2026-09-20', '2026-10-31')).toEqual(['2026-10-02', '2026-10-16', '2026-10-30'])
  })

  it('diaria, trimestral y personalizada (cada N días) — v9', () => {
    expect(occurrencesBetween({ frequency: 'daily', startDate: '2026-10-01' }, '2026-10-03', '2026-10-05')).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
    // Trimestral el 31: último día de los meses cortos y vuelta al 31.
    expect(occurrencesBetween({ frequency: 'quarterly', startDate: '2026-01-31' }, '2026-01-01', '2026-12-31')).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'])
    expect(occurrencesBetween({ frequency: 'custom', startDate: '2026-10-01', intervalDays: 10 }, '2026-10-05', '2026-11-05')).toEqual(['2026-10-11', '2026-10-21', '2026-10-31'])
    // Lejos: el salto inicial no se pierde ninguna ocurrencia.
    expect(occurrencesBetween({ frequency: 'custom', startDate: '2026-01-01', intervalDays: 3 }, '2026-12-30', '2027-01-05')).toEqual(['2026-12-30', '2027-01-02', '2027-01-05'])
    expect(nthOccurrence({ frequency: 'daily', startDate: '2026-02-27' }, 2)).toBe('2026-03-01')
  })

  it('respeta la fecha final y el pago único', () => {
    expect(occurrencesBetween({ frequency: 'weekly', startDate: '2026-09-01', endDate: '2026-09-15' }, '2026-09-01', '2026-12-31')).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
    ])
    expect(occurrencesBetween({ frequency: 'once', startDate: '2026-10-01' }, '2026-09-01', '2026-12-31')).toEqual(['2026-10-01'])
    expect(occurrencesBetween({ frequency: 'once', startDate: '2026-10-01' }, '2026-10-02', '2026-12-31')).toEqual([])
  })

  it('encuentra ocurrencias lejanas sin recorrer desde el principio', () => {
    const s = { frequency: 'monthly' as const, startDate: '2020-01-31' }
    expect(occurrencesBetween(s, '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-31'])
  })
})
