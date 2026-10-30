/** The lines of a file as it is shown: the break at its end does not start another line. */
export function splitLines(content) {
  const lines = content.split(/\r\n|\r|\n/)
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines
}
