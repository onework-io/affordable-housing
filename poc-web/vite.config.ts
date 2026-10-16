import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: Number(process.env.PORT) || 5180, host: true },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: { map: ['maplibre-gl'], deck: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/mapbox', '@deck.gl/mesh-layers'] },
      },
    },
  },
})
