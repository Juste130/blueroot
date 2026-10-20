"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export const NAV = [
  { href: "/", key: "home" },
  { href: "/projects", key: "projects" },
  { href: "/market", key: "market" },
  { href: "/validate", key: "validate" },
  { href: "/field", key: "field" },
] as const;

export function NavLinks({ orientation = "row", onNavigate }: { orientation?: "row" | "column"; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <ul className={orientation === "row" ? "flex items-center gap-1" : "flex flex-col gap-1"}>
      {NAV.map(({ href, key }) => {
        const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={`block rounded-control px-3 py-2 text-sm font-medium transition-colors ${
                current ? "bg-roots/60 text-tide dark:bg-tide-soft dark:text-paper" : "text-muted hover:bg-roots/40 hover:text-ink"
              }`}
            >
              {t(key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
