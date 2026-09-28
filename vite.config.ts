import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Las pruebas unitarias cubren la lógica financiera pura (sin navegador).
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
