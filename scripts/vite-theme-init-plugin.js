/**
 * Injects the pre-mount theme-detection script into each client's built
 * index.html, replacing an `<!-- THEME_INIT -->` placeholder.
 *
 * This must stay inline and synchronous in the final HTML - it runs during
 * head parsing, before either app's bundle (or any imported module) loads,
 * so the correct theme paints on the very first frame instead of flashing
 * light before React hydrates and corrects it. That's exactly what makes it
 * a build-time (not runtime) dedup: a shared JS module imported by the app
 * bundle would run too late. `transformIndexHtml` runs for both `vite build`
 * and `vite dev`, so this applies in both.
 *
 * Both apps read the theme from the cookie that
 * client/shared/hooks/useSettings.js writes for the settings they share.
 */
const SHARED_COOKIE = 'annotaitr-settings'

export function themeInitPlugin() {
  const script = `
    (function() {
      var m = document.cookie.match(/(?:^|; )${SHARED_COOKIE}=([^;]*)/);
      var theme = 'auto';
      try { theme = (m && JSON.parse(decodeURIComponent(m[1])).theme) || 'auto'; } catch (e) {}
      var dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    })();
  `.trim()

  return {
    name: 'theme-init',
    transformIndexHtml(html) {
      return html.replace('<!-- THEME_INIT -->', `<script>\n    ${script}\n  </script>`)
    }
  }
}
