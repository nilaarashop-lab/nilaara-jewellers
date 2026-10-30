import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Static catalogue: products and homepage settings are bundled from
// src/content/*.json. There is no API proxy or runtime backend.
export default defineConfig({
  plugins: [react()],
})
