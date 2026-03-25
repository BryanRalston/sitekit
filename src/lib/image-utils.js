/**
 * Compress an image file to a JPEG data URL.
 * @param {File} file - Image file to compress
 * @param {number} maxSize - Maximum dimension (width or height) in pixels
 * @param {number} quality - JPEG quality (0.0 to 1.0)
 * @returns {Promise<string>} Base64 data URL of the compressed image
 */
export function compressImage(file, maxSize = 1400, quality = 0.80) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compress a receipt image with lower quality for smaller file size.
 * @param {File} file - Image file to compress
 * @returns {Promise<string>} Base64 data URL of the compressed image
 */
export function compressReceiptImage(file) {
  return compressImage(file, 1200, 0.70);
}
