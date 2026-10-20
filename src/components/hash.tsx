"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { shortHex } from "@/lib/format";

/**
 * A hash or address: shortened in the middle for the eye, complete for screen readers and the copy
 * button. `anchored` adds the gold node, reserved for values recorded on-chain.
 */
export function Hash({
  value,
  label,
  href,
  anchored = false,
  full = false,
}: {
  value: string;
  label: string;
  href?: string | undefined;
  anchored?: boolean;
  full?: boolean;
}) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied: the full value stays selectable.
    }
  }

  const text = (
    <span className={`figures ${full ? "break-all" : ""}`} title={value}>
      <span aria-hidden="true">{full ? value : shortHex(value)}</span>
      <span className="sr-only">{value}</span>
    </span>
  );

  return (
    <span className="inline-flex max-w-full items-center gap-2 align-middle">
      {anchored ? <AnchorNode label={t("anchoredHint")} /> : null}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:decoration-current">
          {text}
        </a>
      ) : (
        text
      )}
      <button
        type="button"
        onClick={copy}
        className="rounded-chip px-1.5 py-0.5 text-xs text-muted hover:bg-roots/50 hover:text-ink"
        aria-label={t("copyValue", { label })}
      >
        {copied ? t("copied") : t("copy")}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
    </span>
  );
}

/** The gold root node: this value is anchored on-chain. */
export function AnchorNode({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-block size-2.5 shrink-0 rounded-full bg-gold ring-2 ring-tide/80 dark:ring-paper"
    />
  );
}
