/**
 * Versión de la app (la de package.json) y hash corto del commit, inyectados por Vite al compilar
 * (`define` en vite.config.ts, H1). Se muestran en Ajustes › Acerca de y viajan en las copias.
 */
export const APP_VERSION: string = __APP_VERSION__
export const BUILD_HASH: string = __BUILD_HASH__
