import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProjectList } from "@/components/project-list";
import { Link } from "@/i18n/navigation";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return { title: `${t("title")} · BlueRoot` };
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projects");
  const { snapshot, projects } = await getRegistryView();
  const registered = projects.filter((p) => p.status !== "candidate");
  const candidates = projects.filter((p) => p.status === "candidate");

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
          <p className="measure mt-3 text-muted">{t("intro")}</p>
        </div>
        {snapshot.status === "live" ? (
          <Link href="/projects/new" className="rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft dark:bg-roots dark:text-tide">
            {t("register")}
          </Link>
        ) : null}
      </header>

      <section aria-labelledby="registered-title" className="mt-12">
        <h2 id="registered-title" className="mb-4 text-xl">
          {t("registered")}
        </h2>
        {registered.length > 0 ? <ProjectList projects={registered} /> : <p className="rounded-panel border border-dashed border-line p-6 text-muted">{t("noRegistered")}</p>}
      </section>

      {candidates.length > 0 ? (
        <section aria-labelledby="candidates-title" className="mt-14">
          <h2 id="candidates-title" className="text-xl">
            {t("candidates")}
          </h2>
          <p className="measure mb-4 mt-2 text-sm text-muted">{t("candidatesIntro")}</p>
          <ProjectList projects={candidates} />
        </section>
      ) : null}
    </div>
  );
}
