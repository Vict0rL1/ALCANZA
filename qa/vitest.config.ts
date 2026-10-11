import { defineConfig } from 'vitest/config'

// Suite independiente de auditoría. Los fallos son criterios de aceptación pendientes,
// no expectativas ajustadas al comportamiento defectuoso de producción.
export default defineConfig({ test: { include: ['qa/**/*.test.ts'], environment: 'node' } })
