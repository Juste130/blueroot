import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "./logo-mark";

const REPO = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Juste130/blueroot";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  return (
    <footer className="mt-24 border-t print:hidden border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex gap-4">
          <LogoMark className="h-12 w-auto shrink-0" />
          <div>
            <p className="font-semibold">{t("tagline")}</p>
            <p className="mt-2 text-sm text-muted">{t("hackathon")}</p>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("data")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>{t("copernicus")}</li>
            <li>{t("osm")}</li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("code")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a className="text-muted underline decoration-line underline-offset-4 hover:text-ink" href={`${REPO}/blob/main/docs/satellite.md`}>
                {t("method")}
              </a>
            </li>
            <li>
              <a className="text-muted underline decoration-line underline-offset-4 hover:text-ink" href={`${REPO}/blob/main/docs/contracts.md`}>
                {t("contracts")}
              </a>
            </li>
            <li>
              <Link className="text-muted underline decoration-line underline-offset-4 hover:text-ink" href="/certificates">
                {nav("verify")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
