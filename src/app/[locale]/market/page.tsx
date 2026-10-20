import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Market } from "@/components/market/market";
import { CHAIN_ID } from "@/lib/chain/config";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("market");
  return { title: `${t("title")} · BlueRoot` };
}

export default async function MarketPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("market");
  const { state, projects } = await getRegistryView();
  const name = (id: number) => projects.find((p) => p.id === id)?.name ?? `#${id}`;
  const tokens = [...new Map(state.claims.filter((c) => c.tokenId).map((c) => [c.tokenId!, c])).values()].map((c) => {
    const vintage = Number(BigInt(c.tokenId!) & 0xffffn);
    return { tokenId: c.tokenId!, projectId: c.projectId, projectName: name(c.projectId), vintage };
  });

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="measure mt-3 text-muted">{t("intro")}</p>
      <div className="mt-10">
        <Market listings={state.listings.map((l) => ({ ...l, projectName: name(l.projectId) }))} tokens={tokens} testnet={CHAIN_ID !== 8453} />
      </div>
    </div>
  );
}
