"use client";

import { useTranslations } from "next-intl";
import type { Address } from "viem";
import { useDeployment } from "../providers";
import { useSession } from "./session";
import { type Roles, useRoles } from "./use-roles";

/**
 * Explains why an action is unavailable instead of hiding it: contracts not deployed, wallet not
 * signed in, or missing on-chain role. The contracts enforce the same rules regardless.
 */
export function AccessGate({ role, children }: { role?: keyof Roles; children: (address: Address, roles: Roles) => React.ReactNode }) {
  const t = useTranslations("gate");
  const deployment = useDeployment();
  const session = useSession();
  const { roles, isLoading } = useRoles(session.address);

  let message: string | null = null;
  if (!deployment) message = t("notDeployed");
  else if (session.status === "loading" || (session.address && isLoading)) message = null;
  else if (!session.address) message = t("signIn");
  else if (role && !roles[role]) message = t(`missingRole.${role}`);

  if (message) {
    return (
      <p role="note" className="rounded-panel border border-dashed border-line p-6 text-muted">
        {message}
      </p>
    );
  }
  if (!session.address || (role && !roles[role])) return <p className="text-muted">{t("loading")}</p>;
  return <>{children(session.address, roles)}</>;
}
