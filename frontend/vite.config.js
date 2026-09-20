import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Tailwind is scoped to the landing page: only src/landing/landing.css opts in (see the note there).
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
