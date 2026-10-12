"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAMES = { fr: "Français", en: "English" } as const;

export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label={t("language")}>
      <ul className="flex items-center rounded-control border border-line p-0.5 text-xs font-semibold">
        {routing.locales.map((l) => (
          <li key={l}>
            <Link
              href={pathname}
              locale={l}
              lang={l}
              hrefLang={l}
              aria-current={l === locale ? "true" : undefined}
              aria-label={NAMES[l]}
              className={`block rounded-[6px] px-2 py-1 uppercase ${l === locale ? "bg-tide text-paper dark:bg-roots dark:text-tide" : "text-muted hover:text-ink"}`}
            >
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
