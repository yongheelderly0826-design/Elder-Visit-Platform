"use client";

export function PrintButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => window.print()}
    >
      列印 / 另存 PDF
    </button>
  );
}
