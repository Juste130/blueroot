"use client";

import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { projectRegistryAbi, verificationAbi } from "@/lib/chain/abi";
import { ROLES } from "@/lib/chain/config";
import { useDeployment } from "../providers";

const DEFAULT_ADMIN = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export interface Roles {
  proponent: boolean;
  validator: boolean;
  anchor: boolean;
  admin: boolean;
}

/** Roles are always read from the contracts (F1): the interface never decides who may do what. */
export function useRoles(address: Address | null | undefined) {
  const d = useDeployment();
  const enabled = Boolean(d && address);
  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    query: { enabled },
    contracts: d && address
      ? [
          { address: d.projectRegistry, abi: projectRegistryAbi, functionName: "hasRole", args: [ROLES.proponent, address] },
          { address: d.verification, abi: verificationAbi, functionName: "hasRole", args: [ROLES.validator, address] },
          { address: d.verification, abi: verificationAbi, functionName: "hasRole", args: [ROLES.anchor, address] },
          { address: d.projectRegistry, abi: projectRegistryAbi, functionName: "hasRole", args: [DEFAULT_ADMIN, address] },
        ]
      : [],
  });
  const ok = (i: number) => data?.[i]?.status === "success" && data[i]!.result === true;
  const roles: Roles = { proponent: ok(0), validator: ok(1), anchor: ok(2), admin: ok(3) };
  return { roles, isLoading: enabled && isLoading };
}
