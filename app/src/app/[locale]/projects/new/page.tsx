import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegisterForm } from "@/components/project/register-form";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("register");
  return { title: `${t("title")} · BlueRoot` };
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("register");
  const { projects } = await getRegistryView();
  const zones = projects.filter((p) => p.status === "candidate").map((p) => ({ id: p.slug, name: p.name, cells: p.cells }));
  // Cells held by active projects, to warn before any transaction (F3); the contract enforces it.
  const taken: Record<string, number> = {};
  for (const p of projects) if (p.status === "active" && p.id !== null) for (const c of p.cells) taken[c] = p.id;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="measure mt-3 text-muted">{t("intro")}</p>
      <div className="mt-10">
        <RegisterForm zones={zones} taken={taken} />
      </div>
    </div>
  );
}
