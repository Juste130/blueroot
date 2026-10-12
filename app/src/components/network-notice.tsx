import { getTranslations } from "next-intl/server";
import { chain } from "@/lib/chain/config";
import type { RegistrySnapshot } from "@/lib/registry/indexer";

/** States plainly what the data on screen is: testnet, not deployed yet, or unreachable. */
export async function NetworkNotice({ status }: { status: RegistrySnapshot["status"] }) {
  const t = await getTranslations("network");
  const message = t(status === "live" ? "testnet" : status === "not-deployed" ? "notDeployed" : "unreachable", { network: chain.name });
  return (
    <div role={status === "unreachable" ? "alert" : "note"} className={`border-b text-sm print:hidden ${status === "unreachable" ? "border-bad/30 bg-bad/10" : "border-line bg-roots/35 dark:bg-tide-soft/40"}`}>
      <p className="mx-auto max-w-6xl px-4 py-2 sm:px-6">{message}</p>
    </div>
  );
}
