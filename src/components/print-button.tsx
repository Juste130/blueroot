"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold hover:bg-roots/40">
      {label}
    </button>
  );
}
