import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ValidatorBoard } from "@/components/validate/validator-board";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("validate");
  return { title: `${t("title")} · BlueRoot` };
}

export default async function ValidatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("validate");
  const { state, projects } = await getRegistryView();
  const claims = state.claims
    .filter((c) => c.status === "pending" || c.status === "approved")
    .flatMap((c) => {
      const p = projects.find((x) => x.id === c.projectId);
      return p?.chain ? [{ ...c, projectName: p.name, owner: p.chain.owner, community: p.chain.community }] : [];
    });

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="measure mt-3 text-muted">{t("intro")}</p>
      <div className="mt-10">
        <ValidatorBoard claims={claims} />
      </div>
    </div>
  );
}
