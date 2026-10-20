import "server-only";

import { type Address, isAddressEqual } from "viem";
import { ApiError } from "../api";
import { projectRegistryAbi, verificationAbi } from "../chain/abi";
import { ROLES } from "../chain/config";
import { getDeployment } from "../chain/deployment";
import { getRegistry, publicClient } from "../registry/indexer";
import type { Project, RegistryState } from "../registry/state";

/** Authorization is decided from on-chain state at request time, never from the client. */
export async function requireLive(): Promise<{ state: RegistryState }> {
  const snapshot = await getRegistry();
  if (snapshot.status !== "live") throw new ApiError(503, snapshot.status === "not-deployed" ? "not_deployed" : "chain_unreachable");
  return { state: snapshot.state };
}

export function requireActiveProject(state: RegistryState, projectId: number): Project {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new ApiError(404, "unknown_project");
  if (project.status !== "active") throw new ApiError(409, "project_closed");
  return project;
}

/** Field agents allowed on every project (testnet allowlist managed by the administration). */
function fieldAgents(): Address[] {
  return (process.env.FIELD_AGENT_ADDRESSES ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) as Address[];
}

/** Evidence can be sent by the project's proponent, its community wallet or an allowlisted agent. */
export function canSubmitEvidence(address: Address, project: Project): boolean {
  return [project.owner, project.community, ...fieldAgents()].some((a) => isAddressEqual(a, address));
}

export async function hasRole(role: keyof typeof ROLES, address: Address): Promise<boolean> {
  const d = getDeployment();
  if (!d) return false;
  const [contract, abi] = role === "proponent" ? [d.projectRegistry, projectRegistryAbi] : [d.verification, verificationAbi];
  return publicClient.readContract({ address: contract, abi, functionName: "hasRole", args: [ROLES[role], address] }) as Promise<boolean>;
}
