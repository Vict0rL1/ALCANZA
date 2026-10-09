import { describe, expect, it, vi } from 'vitest'
import { canShareFile, deliverFile } from './backupDelivery'

const file = () => new File(['{}'], 'clara-copia.json', { type: 'application/json' })
const abort = () => Object.assign(new Error('cancelado'), { name: 'AbortError' })

describe('K1 · copia por la hoja de compartir o por descarga', () => {
  it('solo usa la hoja de compartir si el navegador dice que puede compartir ese archivo', () => {
    expect(canShareFile({ canShare: () => true, share: async () => {} }, file())).toBe(true)
    expect(canShareFile({ canShare: () => false, share: async () => {} }, file())).toBe(false)
    expect(canShareFile({ share: async () => {} }, file())).toBe(false)
    expect(canShareFile({ canShare: () => true }, file())).toBe(false)
    expect(canShareFile(undefined, file())).toBe(false)
    expect(
      canShareFile(
        {
          canShare: () => {
            throw new TypeError('no')
          },
          share: async () => {},
        },
        file(),
      ),
    ).toBe(false)
  })

  it('compartir: «exportada» solo cuando share() termina bien; sin descarga', async () => {
    const download = vi.fn()
    const share = vi.fn(async () => {})
    await expect(deliverFile('a.json', '{}', { nav: { canShare: () => true, share }, download })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledTimes(1)
    expect((share.mock.calls[0] as unknown as [ShareData])[0].files?.[0]?.name).toBe('a.json')
    expect(download).not.toHaveBeenCalled()
  })

  it('cerrar la hoja (AbortError) no es exportar, ni descarga, ni error', async () => {
    const download = vi.fn()
    await expect(deliverFile('a.json', '{}', { nav: { canShare: () => true, share: async () => Promise.reject(abort()) }, download })).resolves.toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })

  it('otro fallo al compartir: se descarga como siempre', async () => {
    const download = vi.fn()
    const nav = { canShare: () => true, share: async () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) }
    await expect(deliverFile('a.json', '{"x":1}', { nav, download })).resolves.toBe('downloaded')
    expect(download).toHaveBeenCalledWith('a.json', '{"x":1}')
  })

  it('sin hoja de compartir: descarga', async () => {
    const download = vi.fn()
    await expect(deliverFile('a.json', '{}', { nav: {}, download })).resolves.toBe('downloaded')
    expect(download).toHaveBeenCalledTimes(1)
  })
})
