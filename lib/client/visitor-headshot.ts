/** Browser-only helpers for 自拍證件照 compression (desk + formal registration). */

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Image file could not be read."));
    };
    reader.onerror = () => reject(new Error("Image file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Compact JPEG for storage / upload (max 720×960). */
export function createCompactHeadshotDataUrl(dataUrl: string) {
  return resizeImageDataUrl(dataUrl, { maxWidth: 720, maxHeight: 960, quality: 0.62 });
}

/** Cropped 3:4 preview for UI (240×320). */
export function createLocalHeadshotPreview(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 320;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is not available."));
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const sourceRatio = image.width / image.height;
      const targetRatio = canvas.width / canvas.height;
      const sourceWidth = sourceRatio > targetRatio ? image.height * targetRatio : image.width;
      const sourceHeight = sourceRatio > targetRatio ? image.height : image.width / targetRatio;
      const sourceX = (image.width - sourceWidth) / 2;
      const sourceY = (image.height - sourceHeight) / 2;

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      resolve(canvas.toDataURL("image/jpeg", 0.62));
    };
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = dataUrl;
  });
}

function resizeImageDataUrl(
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality: number },
) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        options.maxWidth / image.width,
        options.maxHeight / image.height,
        1,
      );
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

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", options.quality));
    };
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = dataUrl;
  });
}
