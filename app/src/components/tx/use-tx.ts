"use client";

import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Hex, isAddressEqual, type TransactionReceipt, UserRejectedRequestError } from "viem";
import { usePublicClient } from "wagmi";
import { sponsoredTargets } from "./use-write";

export type TxPhase = "idle" | "preparing" | "wallet" | "pending" | "success" | "error";

export interface TxState {
  phase: TxPhase;
  hash?: Hex;
  /** Contract error name (e.g. "CellAlreadyClaimed"), "rejected", or "unknown". */
  error?: string;
}

/** Decodes a revert into the contract's custom error name, so the interface can explain it. */
export function errorCode(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "rejected";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.reason ?? "reverted";
  }
  if (/user rejected|denied/i.test(String((error as Error)?.message))) return "rejected";
  return "unknown";
}

/**
 * Runs one transaction: `send` asks the wallet (after its own simulation), then the receipt is
 * awaited. The phase drives an aria-live status so every step is announced.
 */
export function useTx() {
  const client = usePublicClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  const run = useCallback(
    async (send: () => Promise<Hex>, prepare?: () => Promise<void>): Promise<TransactionReceipt | null> => {
      try {
        if (prepare) {
          setState({ phase: "preparing" });
          await prepare();
        }
        setState({ phase: "wallet" });
        const hash = await send();
        setState({ phase: "pending", hash });
        const receipt = await client!.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (receipt.status !== "success") throw new Error("reverted");
        const target = sponsoredTargets.get(hash);
        sponsoredTargets.delete(hash);
        if (target && !receipt.logs.some((l) => isAddressEqual(l.address, target))) throw new Error("reverted");
        setState({ phase: "success", hash });
        return receipt;
      } catch (error) {
        setState((s) => ({ phase: "error", hash: s.hash, error: errorCode(error) }));
        return null;
      }
    },
    [client],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { ...state, run, reset, busy: state.phase === "preparing" || state.phase === "wallet" || state.phase === "pending" };
}
