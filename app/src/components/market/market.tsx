"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { isAddressEqual } from "viem";
import { useWriteContract } from "wagmi";
import { useRouter } from "@/i18n/navigation";
import { marketplaceAbi, paymentTokenAbi } from "@/lib/chain/abi";
import { formatNumber, formatToken, shortHex, unitsToHaYears } from "@/lib/format";
import type { Listing } from "@/lib/registry/state";
import { useDeployment } from "../providers";
import { TxStatus } from "../tx/tx-status";
import { useTx } from "../tx/use-tx";
import { useSession } from "../wallet/session";
import { BuyForm } from "./buy-form";
import { type CreditToken, MyCredits } from "./my-credits";

export interface MarketListing extends Listing {
  projectName: string;
}

export function Market({ listings, tokens, testnet }: { listings: MarketListing[]; tokens: CreditToken[]; testnet: boolean }) {
  const t = useTranslations("market");
  const locale = useLocale();
  const router = useRouter();
  const d = useDeployment();
  const { address } = useSession();
  const [buying, setBuying] = useState<number | null>(null);
  const refresh = () => router.refresh();
  const open = listings.filter((l) => l.status === "open");

  return (
    <div className="space-y-16">
      <section aria-labelledby="listings-title">
        <h2 id="listings-title" className="text-xl">
          {t("listingsTitle")}
        </h2>
        {open.length === 0 ? (
          <p className="mt-4 rounded-panel border border-dashed border-line p-6 text-muted">{t("noListings")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-panel border border-line bg-surface">
            {open.map((l) => {
              const mine = address ? isAddressEqual(address, l.seller) : false;
              return (
                <li key={l.id} className="p-5">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div>
                      <p className="font-semibold">{l.projectName}</p>
                      <p className="figures text-sm text-muted">
                        {t("vintage", { year: l.vintage })}, {t("seller", { address: shortHex(l.seller) })}
                      </p>
                    </div>
                    <dl className="figures grid grid-cols-2 gap-x-6 text-sm sm:text-right">
                      <div className="flex flex-col-reverse">
                        <dt className="text-muted">{t("available")}</dt>
                        <dd className="font-semibold">{t("haYears", { value: formatNumber(locale, unitsToHaYears(l.amount), 2) })}</dd>
                      </div>
                      <div className="flex flex-col-reverse">
                        <dt className="text-muted">{t("unitPrice")}</dt>
                        <dd className="font-semibold">{formatToken(locale, l.unitPrice)}</dd>
                      </div>
                    </dl>
                    {mine ? (
                      <CancelButton listingId={l.id} onDone={refresh} />
                    ) : (
                      <button
                        type="button"
                        aria-expanded={buying === l.id}
                        disabled={!address || !d}
                        onClick={() => setBuying((b) => (b === l.id ? null : l.id))}
                        className="rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft disabled:cursor-not-allowed disabled:opacity-60 dark:bg-roots dark:text-tide"
                      >
                        {t("buy")}
                      </button>
                    )}
                  </div>
                  {buying === l.id && address ? (
                    <div className="mt-5 border-t border-line pt-5">
                      <BuyForm listing={l} buyer={address} locale={locale} onDone={refresh} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {!address ? <p className="mt-3 text-sm text-muted">{t("signInToBuy")}</p> : null}
        <p className="mt-3 text-sm text-muted">{t("splitNotice")}</p>
      </section>

      <section aria-labelledby="mine-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="mine-title" className="text-xl">
            {t("myCreditsTitle")}
          </h2>
          {testnet && address && d ? <FaucetButton /> : null}
        </div>
        <div className="mt-4">
          {address && d ? <MyCredits account={address} tokens={tokens} onChange={refresh} /> : <p className="rounded-panel border border-dashed border-line p-6 text-muted">{t("signInToSee")}</p>}
        </div>
      </section>
    </div>
  );
}

function CancelButton({ listingId, onDone }: { listingId: number; onDone: () => void }) {
  const t = useTranslations("market");
  const d = useDeployment()!;
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();
  return (
    <div>
      <button
        type="button"
        disabled={tx.busy}
        onClick={async () => {
          if (await tx.run(() => writeContractAsync({ address: d.marketplace, abi: marketplaceAbi, functionName: "cancel", args: [BigInt(listingId)] }))) onDone();
        }}
        className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold hover:bg-roots/40"
      >
        {t("cancel")}
      </button>
      <TxStatus state={tx} success={t("cancelled")} />
    </div>
  );
}

/** Test stablecoin faucet (testnet only, rate-limited by the contract). */
function FaucetButton() {
  const t = useTranslations("market");
  const d = useDeployment()!;
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={tx.busy}
        onClick={() => void tx.run(() => writeContractAsync({ address: d.paymentToken, abi: paymentTokenAbi, functionName: "faucet" }))}
        className="rounded-control border border-line px-3 py-2 text-sm font-semibold hover:bg-roots/40"
      >
        {t("faucet")}
      </button>
      <TxStatus state={tx} success={t("faucetDone")} />
    </div>
  );
}
