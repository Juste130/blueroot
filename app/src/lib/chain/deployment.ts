import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAIN_ID, type Deployment, DeploymentSchema } from "./config";

const DEPLOYMENTS_DIR = join(process.cwd(), "..", "contracts", "deployments");

let cached: { deployment: Deployment | null } | undefined;

/** Contract addresses written by the Foundry deploy script; null until the contracts are deployed. */
export function getDeployment(): Deployment | null {
  if (cached) return cached.deployment;
  const file = join(DEPLOYMENTS_DIR, `${CHAIN_ID}.json`);
  const deployment = existsSync(file) ? (DeploymentSchema.parse(JSON.parse(readFileSync(file, "utf8"))) as Deployment) : null;
  // A local Anvil deployment changes at every restart: never cache it.
  if (CHAIN_ID !== 31337) cached = { deployment };
  return deployment;
}
