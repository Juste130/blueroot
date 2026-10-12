"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Address } from "viem";
import { useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { marketplaceAbi, paymentTokenAbi } from "@/lib/chain/abi";
import { formatNumber, formatToken, unitsToHaYears } from "@/lib/format";
import type { Listing } from "@/lib/registry/state";
import { useDeployment } from "../providers";
import { TxStatus } from "../tx/tx-status";
import { useTx } from "../tx/use-tx";

/** Buys from one listing: shows the exact split computed by the contract before anything is signed. */
export function BuyForm({ listing, buyer, locale, onDone }: { listing: Listing; buyer: Address; locale: string; onDone: () => void }) {
  const t = useTranslations("market");
  const d = useDeployment()!;
  const amountId = useId();
  const [amount, setAmount] = useState(Math.min(listing.amount, 100));
  const valid = Number.isInteger(amount) && amount > 0 && amount <= listing.amount;
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();

  const { data: quote } = useReadContract({
    address: d.marketplace,
    abi: marketplaceAbi,
    functionName: "quote",
    args: [BigInt(listing.unitPrice), BigInt(valid ? amount : 0)],
    query: { enabled: valid },
  });
  const { data: token, refetch } = useReadContracts({
    contracts: [
      { address: d.paymentToken, abi: paymentTokenAbi, functionName: "balanceOf", args: [buyer] },
      { address: d.paymentToken, abi: paymentTokenAbi, functionName: "allowance", args: [buyer, d.marketplace] },
    ],
  });
  const [total, community, fee, seller] = quote ?? [0n, 0n, 0n, 0n];
  const balance = token?.[0]?.result ?? 0n;
  const allowance = token?.[1]?.result ?? 0n;
  const enough = balance >= total;

  // Exact allowance for this purchase only: no unlimited approval left behind.
  async function buy() {
    if (allowance < total) {
      const ok = await tx.run(() => writeContractAsync({ address: d.paymentToken, abi: paymentTokenAbi, functionName: "approve", args: [d.marketplace, total] }));
      if (!ok) return;
      await refetch();
    }
    const receipt = await tx.run(() =>
      writeContractAsync({ address: d.marketplace, abi: marketplaceAbi, functionName: "buy", args: [BigInt(listing.id), BigInt(amount), BigInt(listing.unitPrice)] }),
    );
    if (receipt) onDone();
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={amountId} className="block text-sm font-semibold">
          {t("amountLabel")}
        </label>
        <p className="text-xs text-muted">{t("amountHint", { max: formatNumber(locale, listing.amount) })}</p>
        <input
          id={amountId}
          type="number"
          inputMode="numeric"
          min={1}
          max={listing.amount}
          step={1}
          value={Number.isFinite(amount) ? amount : ""}
          onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
          aria-invalid={!valid || undefined}
          className="figures mt-1 w-40 rounded-control border border-line bg-surface px-3 py-2 aria-invalid:border-bad"
        />
        <span className="ml-3 text-sm text-muted">{t("haYears", { value: formatNumber(locale, unitsToHaYears(valid ? amount : 0), 2) })}</span>
      </div>
      {valid && quote ? (
        <dl className="figures grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">{t("split.community")}</dt>
          <dd className="text-right font-semibold text-ok">{formatToken(locale, community)}</dd>
          <dt className="text-muted">{t("split.fee")}</dt>
          <dd className="text-right">{formatToken(locale, fee)}</dd>
          <dt className="text-muted">{t("split.seller")}</dt>
          <dd className="text-right">{formatToken(locale, seller)}</dd>
          <dt className="border-t border-line pt-1 font-semibold">{t("split.total")}</dt>
          <dd className="border-t border-line pt-1 text-right font-semibold">{formatToken(locale, total)}</dd>
        </dl>
      ) : null}
      {!enough && valid ? <p className="text-sm text-bad">{t("notEnough", { balance: formatToken(locale, balance) })}</p> : null}
      <button
        type="button"
        disabled={!valid || !enough || tx.busy}
        onClick={() => void buy()}
        className="rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft disabled:cursor-not-allowed disabled:opacity-60 dark:bg-roots dark:text-tide"
      >
        {allowance < total ? t("approveAndBuy") : t("buy")}
      </button>
      <TxStatus state={tx} success={t("bought")} />
    </div>
  );
}
