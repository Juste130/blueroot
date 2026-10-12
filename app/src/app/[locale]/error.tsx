"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  return (
    <div role="alert" className="mx-auto max-w-2xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl">{t("genericTitle")}</h1>
      <p className="mt-3 text-muted">{t("genericBody")}</p>
      <button type="button" onClick={reset} className="mt-8 rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft">
        {common("retry")}
      </button>
    </div>
  );
}
