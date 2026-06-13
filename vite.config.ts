import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project under /zoo2-personal-helper/ (project page).
// In dev we stay at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/zoo2-personal-helper/' : '/',
  plugins: [react()],
}))
