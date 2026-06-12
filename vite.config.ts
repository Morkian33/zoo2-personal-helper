import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sert ce projet sous /zoo2-personal-helper/ (project page).
// En dev on reste à la racine.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/zoo2-personal-helper/' : '/',
  plugins: [react()],
}))
