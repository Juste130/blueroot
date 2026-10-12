import { type Address, type Chain, defineChain, keccak256, toHex } from "viem";
import { baseSepolia, foundry } from "viem/chains";
import { z } from "zod";

/** Addresses written by contracts/script/Deploy.s.sol into deployments/<chainId>.json. */
export const DeploymentSchema = z.object({
  chainId: z.number().int().positive(),
  startBlock: z.number().int().nonnegative(),
  admin: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  projectRegistry: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  verification: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  carbonCredit: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  marketplace: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  paymentToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export type Deployment = {
  [K in keyof z.infer<typeof DeploymentSchema>]: K extends "chainId" | "startBlock" ? number : Address;
};

const SUPPORTED: Record<number, Chain> = { [baseSepolia.id]: baseSepolia, [foundry.id]: foundry };

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? baseSepolia.id);

export const chain: Chain = (() => {
  const known = SUPPORTED[CHAIN_ID];
  if (!known) throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID ${CHAIN_ID} (use 84532 or 31337)`);
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  return rpc ? defineChain({ ...known, rpcUrls: { default: { http: [rpc] } } }) : known;
})();

export const explorerUrl = chain.blockExplorers?.default.url;

export function txUrl(hash: string): string | undefined {
  return explorerUrl ? `${explorerUrl}/tx/${hash}` : undefined;
}

export function addressUrl(address: string): string | undefined {
  return explorerUrl ? `${explorerUrl}/address/${address}` : undefined;
}

export const ROLES = {
  proponent: keccak256(toHex("PROPONENT_ROLE")),
  validator: keccak256(toHex("VALIDATOR_ROLE")),
  anchor: keccak256(toHex("ANCHOR_ROLE")),
} as const;

/** Payment token decimals (MockUSDC and USDC both use 6). */
export const PAYMENT_DECIMALS = 6;

/** Credits are counted in units of 0.01 verified hectare-year. */
export const UNITS_PER_HA_YEAR = 100;

/** tokenId = projectId << 16 | vintage (CarbonCredit.encodeTokenId). */
export function decodeTokenId(tokenId: bigint): { projectId: bigint; vintage: number } {
  return { projectId: tokenId >> 16n, vintage: Number(tokenId & 0xffffn) };
}
