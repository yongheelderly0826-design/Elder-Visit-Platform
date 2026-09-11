"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";

const MAX_SIGNATURE_BYTES = 750_000;

export function SignaturePad({
  value,
  onChange,
  label = "請在框內手寫簽名",
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const inkLengthRef = useRef(value ? Number.POSITIVE_INFINITY : 0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    inkLengthRef.current = value ? Number.POSITIVE_INFINITY : 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, rect.width, rect.height);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#0f172a";
      context.lineWidth = 3.5;
      if (value) {
        const image = new Image();
        image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
        image.src = value;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point(event);
    setError("");
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    inkLengthRef.current += Math.hypot(
      next.x - lastPointRef.current.x,
      next.y - lastPointRef.current.y,
    );
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPointRef.current = next;
  }

  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    if (inkLengthRef.current < 12) {
      setError("簽名板仍為空白，請寫下清楚的簽名後再送出。");
      onChange("");
      return;
    }
    const dataUrl = event.currentTarget.toDataURL("image/jpeg", 0.82);
    const bytes = Math.ceil(((dataUrl.split(",", 2)[1] ?? "").length * 3) / 4);
    if (bytes > MAX_SIGNATURE_BYTES) {
      setError("簽名圖檔過大，請清除後以較短筆畫重新簽名。");
      onChange("");
      return;
    }
    onChange(dataUrl);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    inkLengthRef.current = 0;
    setError("");
    onChange("");
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="h-4 w-4 text-primary" />
          {label}
        </p>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium"
          onClick={clear}
        >
          <Eraser className="h-4 w-4" />
          清除重簽
        </button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label={label}
        className="h-48 w-full rounded-lg border-2 border-dashed border-primary/40 bg-white shadow-inner"
        style={{ touchAction: "none" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <p className="mt-2 text-sm text-muted-foreground">可用手指或觸控筆書寫；送出前請確認筆跡清楚。</p>
      {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
