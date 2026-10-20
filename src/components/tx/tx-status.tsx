"use client";

import { useTranslations } from "next-intl";
import { txUrl } from "@/lib/chain/config";
import { AnchorNode } from "../hash";
import type { TxState } from "./use-tx";

/** Announces each step of a transaction (aria-live) and explains failures in plain words. */
export function TxStatus({ state, success }: { state: TxState; success?: string }) {
  const t = useTranslations("tx");
  const common = useTranslations("common");
  if (state.phase === "idle") return <p aria-live="polite" className="sr-only" />;
  const href = state.hash ? txUrl(state.hash) : undefined;
  const errorKey = state.error && t.has(`errors.${state.error}`) ? `errors.${state.error}` : "errors.unknown";

  return (
    <div
      aria-live="polite"
      role={state.phase === "error" ? "alert" : "status"}
      className={`mt-4 rounded-control border p-3 text-sm ${
        state.phase === "error" ? "border-bad/30 bg-bad/10" : state.phase === "success" ? "border-mangrove/40 bg-mangrove/10" : "border-line bg-surface"
      }`}
    >
      <p className="flex items-center gap-2 font-medium">
        {state.phase === "success" ? <AnchorNode label={common("anchored")} /> : null}
        {state.phase === "error" ? t(errorKey) : state.phase === "success" ? (success ?? t("success")) : t(state.phase)}
      </p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="mt-1 inline-block underline decoration-line underline-offset-4">
          {common("viewTx")}
        </a>
      ) : null}
    </div>
  );
}
