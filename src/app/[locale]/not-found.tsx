import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl">{t("notFoundTitle")}</h1>
      <p className="mt-3 text-muted">{t("notFoundBody")}</p>
      <Link href="/" className="mt-8 inline-block rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft">
        {t("backHome")}
      </Link>
    </div>
  );
}
