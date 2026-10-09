export declare const TOLERANCE: number
export declare function initialScripts(html: string): string[]
export declare function compareToBaseline(
  current: { bytes: number },
  baseline: { bytes: number },
): { ok: boolean; limit: number; percent: number }
export declare function measure(distDir: URL): {
  files: { path: string; bytes: number; gzipBytes: number }[]
  bytes: number
  gzipBytes: number
}
