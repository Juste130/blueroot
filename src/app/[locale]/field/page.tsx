import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FieldForm } from "@/components/field/field-form";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("field");
  return { title: `${t("title")} · BlueRoot` };
}

export default async function FieldPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("field");
  const { projects } = await getRegistryView();
  const active = projects.filter((p) => p.status === "active" && p.id !== null).map((p) => ({ id: p.id!, name: p.name, place: p.place, cells: p.cells }));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="measure mt-3 text-muted">{t("intro")}</p>
      <ul className="measure mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>{t("rules.gps")}</li>
        <li>{t("rules.private")}</li>
        <li>{t("rules.offline")}</li>
      </ul>
      <div className="mt-10">
        <FieldForm projects={active} />
      </div>
    </div>
  );
}
