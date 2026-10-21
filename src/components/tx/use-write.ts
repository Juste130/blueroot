"use client";

import { createContext, useCallback, useContext } from "react";
import { type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, encodeFunctionData, type Hex } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { MIN_PRIORITY_FEE } from "@/lib/chain/config";

/**
 * Sends a transaction whose gas the platform pays (Privy native sponsorship, embedded wallets only).
 * Provided by the Privy bridge when Privy is configured; `null` means "use the wallet as is".
 */
export type SponsoredSender = (account: Address, tx: { to: Address; data: Hex }) => Promise<Hex>;

export const SponsorContext = createContext<{ canSponsor: (account: Address) => boolean; send: SponsoredSender } | null>(null);

/**
 * Sponsored transactions run through an EIP-7702 delegate and a paymaster: the outer transaction can
 * succeed while the call to our contract reverted. useTx checks the receipt for a log from `to` (every
 * BlueRoot write emits an event) before reporting success.
 */
export const sponsoredTargets = new Map<Hex, Address>();

/** Fees from our RPC, priority fee raised to the chain floor; empty where the wallet's own choice is fine. */
async function walletFees(client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }> {
  if (!MIN_PRIORITY_FEE) return {};
  const { maxFeePerGas, maxPriorityFeePerGas } = await client.estimateFeesPerGas();
  if (maxPriorityFeePerGas >= MIN_PRIORITY_FEE) return { maxFeePerGas, maxPriorityFeePerGas };
  return { maxFeePerGas: maxFeePerGas - maxPriorityFeePerGas + MIN_PRIORITY_FEE, maxPriorityFeePerGas: MIN_PRIORITY_FEE };
}

type WriteRequest<abi extends Abi, name extends ContractFunctionName<abi, "nonpayable" | "payable">> = {
  address: Address;
  abi: abi;
  functionName: name;
  args?: ContractFunctionArgs<abi, "nonpayable" | "payable", name>;
};

/**
 * Drop-in replacement for wagmi's writeContractAsync. The call is simulated first, so a revert surfaces
 * with the contract's error name before anything is signed.
 */
export function useWrite() {
  const { address: account } = useConnection();
  const client = usePublicClient();
  const sponsor = useContext(SponsorContext);
  const { mutateAsync: writeContractAsync } = useWriteContract();

  return useCallback(
    async <const abi extends Abi, name extends ContractFunctionName<abi, "nonpayable" | "payable">>(req: WriteRequest<abi, name>): Promise<Hex> => {
      if (!account || !client) throw new Error("not connected");
      // Loosely typed past this point: the generic request is already checked at the call site.
      const call = req as unknown as { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
      await client.simulateContract({ ...call, account });
      if (sponsor?.canSponsor(account)) {
        const hash = await sponsor.send(account, { to: call.address, data: encodeFunctionData(call) });
        sponsoredTargets.set(hash, call.address);
        return hash;
      }
      return writeContractAsync({ ...call, ...(await walletFees(client)) } as Parameters<typeof writeContractAsync>[0]);
    },
    [account, client, sponsor, writeContractAsync],
  );
}
