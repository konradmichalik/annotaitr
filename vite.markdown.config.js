import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { themeInitPlugin } from './scripts/vite-theme-init-plugin.js'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// KaTeX declares woff2 + woff + ttf per face. Every referenced font gets inlined
// as a data URI in the single-file build, so keeping the legacy fallbacks would
// triple the font payload (~1.4 MB) for formats no current browser needs.
const katexWoff2Only = {
  name: 'katex-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('katex') || !id.endsWith('.css')) { return null }
    return {
      code: code.replace(
        /,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g,
        ''
      ),
      map: null
    }
  }
}

export default defineConfig({
  root: './client/markdown',
  plugins: [react(), viteSingleFile(), katexWoff2Only, themeInitPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir: '../dist/markdown',
    emptyOutDir: true,
    // KaTeX ships 20 woff2 faces; the single-file build has to inline them as
    // data URIs or math would silently fall back to system fonts offline.
    assetsInlineLimit: 256 * 1024
  }
})
