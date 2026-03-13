// src/lib/health/pdf.ts
// PDF text extraction for health document ingestion.
// Uses pdfjs-dist (pure JavaScript, no native binaries, Vercel-compatible).
//
// Design: text extraction is preferred over image rendering because:
//   - Digital health PDFs (lab portals, MyChart exports, ICD cloud reports) are
//     text-based — extraction is lossless and more accurate than OCR on a rendered image
//   - No canvas/native dependency required
//   - Faster and cheaper (no Vision API call)
//
// Limitation: scanned PDFs (image-only, no text layer) will return empty text.
// In that case the OCR route falls back to advising the user to photograph the
// document directly. For this use case (personal digital health records),
// scanned PDFs are rare — lab portals and MyChart always produce text PDFs.
//
// Called by: src/app/api/health/upload/ocr/route.ts
export const runtime = 'nodejs'

export interface PdfExtractResult {
  text:      string    // full concatenated text, pages separated by marker
  pageCount: number
  hasText:   boolean   // false if all pages returned empty text (scanned PDF)
}

/**
 * Extract text content from a PDF buffer.
 * Returns all pages concatenated with page-break markers.
 * Never throws — returns { hasText: false } on failure or empty PDFs.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    // Dynamic import keeps this out of the module graph for non-PDF requests
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as {
      getDocument: (params: { data: Uint8Array; useWorkerFetch?: boolean; isEvalSupported?: boolean; useSystemFonts?: boolean }) => { promise: Promise<PDFDocumentProxy> }
    }

    interface PDFDocumentProxy {
      numPages: number
      getPage(n: number): Promise<PDFPageProxy>
    }
    interface PDFPageProxy {
      getTextContent(): Promise<{ items: Array<{ str?: string }> }>
    }

    const data = new Uint8Array(buffer)
    const doc  = await pdfjs.getDocument({
      data,
      useWorkerFetch:  false,
      isEvalSupported: false,
      useSystemFonts:  true,
    }).promise

    const pageCount = doc.numPages
    const pages: string[] = []

    for (let i = 1; i <= pageCount; i++) {
      const page    = await doc.getPage(i)
      const content = await page.getTextContent()

      // getTextContent returns items — each has a `str` field for text tokens
      const pageText = content.items
        .map(item => item.str ?? '')
        .join(' ')
        .replace(/\s{3,}/g, '\n')  // collapse excessive whitespace into newlines
        .trim()

      if (pageText) pages.push(pageText)
    }

    const text    = pages.join('\n\n--- Page Break ---\n\n')
    const hasText = text.trim().length > 50  // meaningful content threshold

    return { text, pageCount, hasText }
  } catch {
    return { text: '', pageCount: 0, hasText: false }
  }
}
