import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { themeInitPlugin } from './scripts/vite-theme-init-plugin.js'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  root: './client/image',
  plugins: [react(), viteSingleFile(), themeInitPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir: '../dist/image',
    emptyOutDir: true
  }
})
