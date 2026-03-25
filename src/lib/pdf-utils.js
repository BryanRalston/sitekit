import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

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
    let lastY = null;
    let lineText = '';

    for (const item of textContent.items) {
      const y = Math.round(item.transform[5]); // Y position
      if (lastY !== null && Math.abs(y - lastY) > 3) {
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
