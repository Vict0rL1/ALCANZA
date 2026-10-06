/**
 * Lee un archivo local como texto informando del progreso REAL (bytes leídos) y permitiendo
 * cancelar. El archivo nunca sale del dispositivo.
 */
export class ReadCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'ReadCancelled'
  }
}

export function readFileWithProgress(file: Blob, onProgress: (loaded: number, total: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ReadCancelled())
    const reader = new FileReader()
    const onAbort = () => reader.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    reader.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size)
    reader.onload = () => {
      signal.removeEventListener('abort', onAbort)
      onProgress(file.size, file.size)
      resolve(String(reader.result ?? ''))
    }
    reader.onabort = () => reject(new ReadCancelled())
    reader.onerror = () => reject(reader.error ?? new Error('read'))
    reader.readAsText(file)
  })
}

/** Cede un turno al navegador para que pinte el estado antes de un cálculo largo. */
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))
