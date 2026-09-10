"use client";

/**
 * Mobile-friendly QR scanning:
 * - Prefer BarcodeDetector when available (Chrome/Android)
 * - Fallback to jsQR frame decode (iOS Safari / LINE in-app)
 */

import jsQR from "jsqr";

export type QrScanHandle = {
  stop: () => void;
};

type StartQrScanOptions = {
  video: HTMLVideoElement;
  onCode: (rawValue: string) => void | Promise<void>;
  onError?: (message: string) => void;
  /** Prefer rear camera for posters / counter QR. */
  facingMode?: ConstrainDOMString;
};

function getBarcodeDetector() {
  const Detector = (
    window as Window & {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
      };
    }
  ).BarcodeDetector;
  return Detector ?? null;
}

async function openCamera(facingMode: ConstrainDOMString = { ideal: "environment" }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("此瀏覽器不支援相機，請改用 Safari 開啟本頁後再掃碼。");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch {
    // Some WebViews reject ideal constraints; retry with a looser request.
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
  }
}

export async function startQrScan(options: StartQrScanOptions): Promise<QrScanHandle> {
  const { video, onCode, onError, facingMode = { ideal: "environment" } } = options;
  let stream: MediaStream | null = null;
  let stopped = false;
  let handling = false;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const Detector = getBarcodeDetector();
  const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;

  try {
    stream = await openCamera(facingMode);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "無法開啟相機，請允許相機權限，或改用 Safari 開啟本頁。";
    onError?.(message);
    throw error instanceof Error ? error : new Error(message);
  }

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => undefined);

  const stop = () => {
    stopped = true;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  };

  const handleValue = async (raw: string) => {
    if (handling || stopped) return;
    handling = true;
    try {
      await onCode(raw);
    } finally {
      // Caller usually stops after a valid site code; allow continue otherwise.
      handling = false;
    }
  };

  const tick = async () => {
    if (stopped || !stream) return;
    if (video.readyState >= 2 && video.videoWidth > 0 && context) {
      try {
        if (detector) {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            await handleValue(value);
          }
        } else {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
          if (code?.data) {
            await handleValue(code.data);
          }
        }
      } catch {
        // keep scanning
      }
    }
    if (!stopped) {
      window.setTimeout(() => {
        void tick();
      }, detector ? 120 : 200);
    }
  };

  void tick();
  return { stop };
}

export function isLikelyInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Line\//i.test(ua) || /FBAN|FBAV/i.test(ua) || /Instagram/i.test(ua);
}
