"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { type Address, decodeEventLog, parseUnits } from "viem";
import { useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { useRouter } from "@/i18n/navigation";
import { carbonCreditAbi, marketplaceAbi } from "@/lib/chain/abi";
import { PAYMENT_DECIMALS } from "@/lib/chain/config";
import { formatNumber, unitsToHaYears } from "@/lib/format";
import { useDeployment } from "../providers";
import { TxStatus } from "../tx/tx-status";
import { useTx } from "../tx/use-tx";

export interface CreditToken {
  tokenId: string;
  projectId: number;
  projectName: string;
  vintage: number;
}

const input = "rounded-control border border-line bg-surface px-3 py-2 aria-invalid:border-bad";
const primary =
  "rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft disabled:cursor-not-allowed disabled:opacity-60 dark:bg-roots dark:text-tide";

/** Credits held by the signed-in wallet, with the two things one can do with them: sell or retire. */
export function MyCredits({ account, tokens, onChange }: { account: Address; tokens: CreditToken[]; onChange: () => void }) {
  const t = useTranslations("market");
  const locale = useLocale();
  const d = useDeployment()!;
  const { data, refetch } = useReadContracts({
    contracts: tokens.map((tk) => ({ address: d.carbonCredit, abi: carbonCreditAbi, functionName: "balanceOf", args: [account, BigInt(tk.tokenId)] }) as const),
  });
  const held = tokens.map((tk, i) => ({ ...tk, balance: Number((data?.[i]?.result as bigint | undefined) ?? 0n) })).filter((tk) => tk.balance > 0);
  const [action, setAction] = useState<{ tokenId: string; kind: "sell" | "retire" } | null>(null);

  if (held.length === 0) return <p className="rounded-panel border border-dashed border-line p-6 text-muted">{t("noCredits")}</p>;

  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {held.map((tk) => (
        <li key={tk.tokenId} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold">{tk.projectName}</p>
              <p className="figures text-sm text-muted">
                {t("vintage", { year: tk.vintage })}, {t("balance", { amount: formatNumber(locale, tk.balance), ha: formatNumber(locale, unitsToHaYears(tk.balance), 2) })}
              </p>
            </div>
            <div className="flex gap-2">
              {(["sell", "retire"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-expanded={action?.tokenId === tk.tokenId && action.kind === kind}
                  onClick={() => setAction((a) => (a?.tokenId === tk.tokenId && a.kind === kind ? null : { tokenId: tk.tokenId, kind }))}
                  className="rounded-control border border-line px-3 py-2 text-sm font-semibold hover:bg-roots/40 aria-expanded:bg-roots/60"
                >
                  {t(kind)}
                </button>
              ))}
            </div>
          </div>
          {action?.tokenId === tk.tokenId ? (
            <div className="mt-5 border-t border-line pt-5">
              {action.kind === "sell" ? (
                <SellForm token={tk} max={tk.balance} account={account} onDone={() => { void refetch(); onChange(); }} />
              ) : (
                <RetireForm token={tk} max={tk.balance} account={account} />
              )}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SellForm({ token, max, account, onDone }: { token: CreditToken; max: number; account: Address; onDone: () => void }) {
  const t = useTranslations("market");
  const d = useDeployment()!;
  const ids = { amount: useId(), price: useId() };
  const [amount, setAmount] = useState(max);
  const [price, setPrice] = useState("1.00");
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();
  const { data: approved, refetch } = useReadContract({ address: d.carbonCredit, abi: carbonCreditAbi, functionName: "isApprovedForAll", args: [account, d.marketplace] });

  let unitPrice = 0n;
  try {
    unitPrice = parseUnits(price, PAYMENT_DECIMALS);
  } catch {
    unitPrice = 0n;
  }
  const valid = Number.isInteger(amount) && amount > 0 && amount <= max && unitPrice > 0n;

  async function sell() {
    if (!approved) {
      // The marketplace escrows the credits it lists; it can only move them through list/buy/cancel.
      const ok = await tx.run(() => writeContractAsync({ address: d.carbonCredit, abi: carbonCreditAbi, functionName: "setApprovalForAll", args: [d.marketplace, true] }));
      if (!ok) return;
      await refetch();
    }
    const receipt = await tx.run(() => writeContractAsync({ address: d.marketplace, abi: marketplaceAbi, functionName: "list", args: [BigInt(token.tokenId), BigInt(amount), unitPrice] }));
    if (receipt) onDone();
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void sell();
      }}
    >
      <div>
        <label htmlFor={ids.amount} className="block text-sm font-semibold">{t("amountLabel")}</label>
        <input id={ids.amount} type="number" inputMode="numeric" min={1} max={max} step={1} value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} className={`figures mt-1 w-full ${input}`} />
      </div>
      <div>
        <label htmlFor={ids.price} className="block text-sm font-semibold">{t("priceLabel")}</label>
        <input id={ids.price} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={unitPrice === 0n || undefined} aria-describedby={`${ids.price}-hint`} className={`figures mt-1 w-full ${input}`} />
        <p id={`${ids.price}-hint`} className="mt-1 text-xs text-muted">{t("priceHint")}</p>
      </div>
      <p className="text-sm text-muted sm:col-span-2">{t("sellNotice")}</p>
      <div className="sm:col-span-2">
        <button type="submit" disabled={!valid || tx.busy} className={primary}>
          {approved ? t("list") : t("approveAndList")}
        </button>
        <TxStatus state={tx} success={t("listed")} />
      </div>
    </form>
  );
}

function RetireForm({ token, max, account }: { token: CreditToken; max: number; account: Address }) {
  const t = useTranslations("market");
  const locale = useLocale();
  const router = useRouter();
  const d = useDeployment()!;
  const ids = { amount: useId(), name: useId(), reason: useId() };
  const [amount, setAmount] = useState(max);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [publishError, setPublishError] = useState(false);
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();
  const valid = Number.isInteger(amount) && amount > 0 && amount <= max && name.trim().length > 0 && reason.trim().length > 0;

  async function retire() {
    setPublishError(false);
    let reasonHash: `0x${string}` | undefined;
    const receipt = await tx.run(
      () => writeContractAsync({ address: d.carbonCredit, abi: carbonCreditAbi, functionName: "retire", args: [BigInt(token.tokenId), BigInt(amount), account, reasonHash!] }),
      async () => {
        // The reason is public and permanent: it is published first, and only its hash goes on-chain.
        const res = await fetch("/api/documents/retirement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beneficiaryName: name.trim(), reason: reason.trim(), language: locale === "en" ? "en" : "fr" }),
        });
        if (!res.ok) {
          setPublishError(true);
          throw new Error("publish");
        }
        reasonHash = ((await res.json()) as { hash: `0x${string}` }).hash;
      },
    );
    const log = receipt?.logs.find((l) => {
      try {
        return decodeEventLog({ abi: carbonCreditAbi, data: l.data, topics: l.topics }).eventName === "CreditsRetired";
      } catch {
        return false;
      }
    });
    if (receipt && log) router.push(`/certificates/${receipt.transactionHash}`);
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void retire();
      }}
    >
      <div>
        <label htmlFor={ids.amount} className="block text-sm font-semibold">{t("amountLabel")}</label>
        <input id={ids.amount} type="number" inputMode="numeric" min={1} max={max} step={1} value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} className={`figures mt-1 w-40 ${input}`} />
      </div>
      <div>
        <label htmlFor={ids.name} className="block text-sm font-semibold">{t("beneficiaryLabel")}</label>
        <input id={ids.name} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-describedby={`${ids.name}-hint`} className={`mt-1 w-full ${input}`} />
        <p id={`${ids.name}-hint`} className="mt-1 text-xs text-muted">{t("beneficiaryHint")}</p>
      </div>
      <div>
        <label htmlFor={ids.reason} className="block text-sm font-semibold">{t("reasonLabel")}</label>
        <textarea id={ids.reason} value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className={`mt-1 w-full ${input}`} />
      </div>
      <p className="text-sm text-muted">{t("retireNotice")}</p>
      {publishError ? <p role="alert" className="text-sm text-bad">{t("publishError")}</p> : null}
      <div>
        <button type="submit" disabled={!valid || tx.busy} className={primary}>
          {t("retireConfirm", { amount: formatNumber(locale, valid ? amount : 0) })}
        </button>
        <TxStatus state={tx} success={t("retired")} />
      </div>
    </form>
  );
}
