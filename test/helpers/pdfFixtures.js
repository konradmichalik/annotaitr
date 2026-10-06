import { PDFDocument, PDFNumber, PDFOperator, StandardFonts, popGraphicsState, pushGraphicsState } from 'pdf-lib'

/**
 * PDFs for tests, generated in-memory so no binary fixture file needs to
 * live in the repo. Helvetica is one of the standard 14 fonts and is not
 * embedded, which also exercises pdf.js' standard font data.
 */

const PAGE_SIZES = {
  slide: [960, 540],
  portrait: [595, 842],
  landscape: [842, 595]
}

/** One page per entry; each page carries its title as text. */
export async function makePdf(pages = [{ size: 'slide', title: 'Revenue by region' }]) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const { size = 'slide', title = '' } of pages) {
    const [width, height] = PAGE_SIZES[size]
    const page = doc.addPage([width, height])
    if (title) {
      page.drawText(title, { x: 60, y: height - 90, size: 40, font })
    }
  }
  return Buffer.from(await doc.save())
}

/**
 * A first page with `count` overlapping filled rectangles, slow enough to
 * exercise render timeouts, and an empty second page that renders at once.
 */
export async function makeHeavyPdf(count = 100_000) {
  const doc = await PDFDocument.create()
  const page = doc.addPage(PAGE_SIZES.slide)
  doc.addPage(PAGE_SIZES.slide)
  const num = (n) => PDFNumber.of(n)
  page.pushOperators(pushGraphicsState())
  const batch = []
  for (let i = 0; i < count; i++) {
    batch.push(
      PDFOperator.of('rg', [num((i % 7) / 7), num((i % 11) / 11), num((i % 13) / 13)]),
      PDFOperator.of('re', [num((i * 37) % 900), num((i * 53) % 500), num(400), num(300)]),
      PDFOperator.of('f')
    )
    // pushOperators spreads its arguments, so feed it in chunks.
    if (batch.length >= 9000) { page.pushOperators(...batch.splice(0)) }
  }
  page.pushOperators(...batch, popGraphicsState())
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

/**
 * A PDF with a standard security handler whose user password is not empty,
 * so opening it without a password fails. pdf-lib cannot encrypt, and the
 * page content does not matter, so the file is assembled by hand.
 */
export function makeEncryptedPdf() {
  const hex = (byte, length) => byte.repeat(length)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${hex('ab', 32)}> /U <${hex('cd', 32)}> /P -4 >>`
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = body.length
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xrefOffset = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 4 0 R /ID [<${hex('01', 16)}> <${hex('01', 16)}>] >>\n`
  body += `startxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}
