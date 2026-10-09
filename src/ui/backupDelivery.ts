/**
 * Entrega del archivo de copia (K1): en el iPhone (y donde el navegador lo permita) abre la hoja
 * de compartir del sistema con el archivo, para «Guardar en Archivos» o iCloud Drive en un paso;
 * si no, la descarga de siempre. Quien llama registra «exportada» solo con 'shared' o 'downloaded'.
 */
type ShareNavigator = {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

export type Delivery = 'shared' | 'downloaded' | 'cancelled'

export function canShareFile(nav: ShareNavigator | undefined, file: File): boolean {
  if (!nav?.share || !nav.canShare) return false
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

export async function deliverFile(
  filename: string,
  text: string,
  env: { nav: ShareNavigator | undefined; download: (filename: string, text: string) => void },
): Promise<Delivery> {
  const file = new File([text], filename, { type: 'application/json' })
  if (canShareFile(env.nav, file)) {
    try {
      await env.nav!.share!({ files: [file], title: filename })
      return 'shared'
    } catch (error) {
      // Cerrar la hoja sin elegir destino: no se exportó y no es un error.
      if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled'
      // Cualquier otro fallo (p. ej. el navegador no deja compartir ahora): descarga normal.
    }
  }
  env.download(filename, text)
  return 'downloaded'
}
