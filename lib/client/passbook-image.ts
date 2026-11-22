/** Browser-only helpers for passbook cover compression (grayscale JPEG). */

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Shrink + high-contrast grayscale JPEG for remittance passbook photos. */
export function createCompactPassbookDataUrl(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 900;
      const maxHeight = 600;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is not available."));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const gray = Math.round(
          pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114,
        );
        const highContrast = gray > 220 ? 255 : gray < 60 ? 0 : gray;
        pixels[index] = highContrast;
        pixels[index + 1] = highContrast;
        pixels[index + 2] = highContrast;
      }
      context.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.46));
    };
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = dataUrl;
  });
}
