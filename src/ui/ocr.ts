/**
 * Lectura de texto en fotos (§8 · Recibos) SIN enviar la imagen a ningún sitio. Se usa la API de
 * detección de texto del navegador (`TextDetector`, Shape Detection) cuando existe. Si no existe,
 * no se simula: la foto se puede adjuntar igual y el total se escribe a mano. Ver decisión 45
 * sobre por qué no se incluye Tesseract.js.
 */
export interface OcrResult {
  text: string
  lines: string[]
}

interface DetectedText {
  rawValue: string
  boundingBox?: { x: number; y: number; width: number; height: number }
}

type TextDetectorCtor = new () => { detect: (image: ImageBitmapSource) => Promise<DetectedText[]> }

export function ocrAvailable(): boolean {
  return typeof (globalThis as { TextDetector?: unknown }).TextDetector === 'function'
}

/** Reconoce el texto de una imagen en el dispositivo; `null` si el navegador no ofrece el detector. */
export async function recognizeText(image: Blob): Promise<OcrResult | null> {
  const Ctor = (globalThis as { TextDetector?: TextDetectorCtor }).TextDetector
  if (!Ctor) return null
  const bitmap = await createImageBitmap(image)
  try {
    const detected = await new Ctor().detect(bitmap)
    const lines = [...detected]
      .sort((a, b) => (a.boundingBox?.y ?? 0) - (b.boundingBox?.y ?? 0) || (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0))
      .map((d) => d.rawValue.trim())
      .filter(Boolean)
    return { text: lines.join('\n'), lines }
  } finally {
    bitmap.close()
  }
}

export const RECEIPT_MAX_BYTES = 200_000
const RECEIPT_MAX_SIDE = 1024

/**
 * Reduce la foto a un JPEG de ≤ 1024 px y ≈ ≤ 200 KB (data URL) para guardarla con el movimiento.
 * Las copias de seguridad crecen con cada recibo: la interfaz lo avisa.
 */
export async function compressReceipt(image: Blob): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const bitmap = await createImageBitmap(image)
  try {
    const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return null
    ctx2d.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.7, 0.5, 0.35, 0.2]) {
      const url = canvas.toDataURL('image/jpeg', quality)
      if (url.length <= RECEIPT_MAX_BYTES) return url
    }
    return null
  } finally {
    bitmap.close()
  }
}
