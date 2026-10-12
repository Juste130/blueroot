import { getLocale, getTranslations } from "next-intl/server";
import { txUrl } from "@/lib/chain/config";
import { formatDate, formatNumber, shortHex } from "@/lib/format";
import { type RegistryEvent, type RegistryState, projectIdOf } from "@/lib/registry/state";

/**
 * The project's lifecycle as one root line (F12). Every node is an on-chain event, hence gold, and
 * links to its transaction: the whole history can be replayed from the chain alone.
 */
export async function ProjectHistory({ projectId, state }: { projectId: number; state: RegistryState }) {
  const t = await getTranslations("project");
  const locale = await getLocale();
  const claims = new Map(state.claims.map((c) => [c.id, c]));
  const listingIds = new Set(state.listings.filter((l) => l.projectId === projectId).map((l) => l.id));
  const events = state.events
    .filter((e) => projectIdOf(e, claims) === projectId || (e.kind === "Cancelled" && listingIds.has(e.listingId)))
    .reverse();

  if (events.length === 0) return <p className="text-muted">{t("noHistory")}</p>;

  const label = (e: RegistryEvent): string => {
    switch (e.kind) {
      case "CellsAdded":
        return t("event.CellsAdded", { count: e.cells.length });
      case "ReportAnchored":
        return t("event.ReportAnchored", { claim: e.claimId, score: e.score });
      case "Attested":
        return t("event.Attested", { validator: shortHex(e.validator), vote: t(e.approve ? "claim.approve" : "claim.reject"), claim: e.claimId });
      case "ClaimApproved":
      case "ClaimRejected":
        return t(`event.${e.kind}`, { claim: e.claimId });
      case "ClaimFinalized":
        return t("event.ClaimFinalized", { amount: formatNumber(locale, e.net + e.buffer), buffer: formatNumber(locale, e.buffer) });
      case "CreditsRetired":
      case "Listed":
      case "Purchased":
        return t(`event.${e.kind}`, { amount: formatNumber(locale, e.amount) });
      default:
        return t(`event.${e.kind}`);
    }
  };

  return (
    <ol className="relative ml-1.5 border-l-2 border-roots dark:border-tide-soft">
      {events.map((e) => {
        const href = txUrl(e.txHash);
        return (
          <li key={`${e.txHash}-${e.logIndex}`} className="relative pb-6 pl-7 last:pb-0">
            <span aria-hidden="true" className="absolute -left-[7px] top-1.5 size-3 rounded-full bg-gold ring-4 ring-paper" />
            <p className="font-medium">{label(e)}</p>
            <p className="figures mt-0.5 text-sm text-muted">
              <time dateTime={new Date(e.timestamp * 1000).toISOString()}>{formatDate(locale, e.timestamp)}</time>
              {", "}
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:text-ink">
                  {shortHex(e.txHash)}
                </a>
              ) : (
                shortHex(e.txHash)
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
