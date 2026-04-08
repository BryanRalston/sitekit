import * as pdfjsLib from 'pdfjs-dist';

// Use locally vendored worker (public/vendor/pdf.worker.min.mjs) — no CDN dependency
pdfjsLib.GlobalWorkerOptions.workerSrc = import.meta.env.BASE_URL + 'vendor/pdf.worker.min.mjs';

/**
 * Extract text from a PDF file, reconstructing line structure from text spans.
 * @param {File} file - A File object (from <input type="file"> or drag-and-drop)
 * @returns {Promise<string>} The extracted text with lines reconstructed
 */
export async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group items by Y position to reconstruct lines
    // Use tight threshold (1px) to preserve line structure matching pdf-parse format
    let lastY = null;
    let lineText = '';

    for (const item of textContent.items) {
      const y = Math.round(item.transform[5]); // Y position
      if (lastY !== null && Math.abs(y - lastY) > 1) {
        // New line
        fullText += lineText.trim() + '\n';
        lineText = '';
      }
      lineText += item.str;
      lastY = y;
    }
    if (lineText.trim()) {
      fullText += lineText.trim() + '\n';
    }
    fullText += '\n'; // Page break
  }

  return fullText;
}
