function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function readableTarget(target) {
  try {
    const url = new URL(target)
    if (url.protocol === 'http:' || url.protocol === 'https:') { return `${url.host}${url.pathname}` }
  } catch {
    // Not a URL: a file path or a label such as "clipboard image".
  }
  return target.split('/').pop().replace(/\.[a-z0-9]+$/i, '')
}

/** A download name that says what was annotated, e.g. "annotated-typo3-org.png". */
export function exportFileName(target) {
  const name = target ? slug(readableTarget(target)) : ''
  return name ? `annotated-${name}.png` : 'annotated.png'
}
