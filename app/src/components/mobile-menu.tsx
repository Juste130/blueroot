"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { NavLinks } from "./nav-links";

export function MobileMenu() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex size-10 items-center justify-center rounded-control border border-line text-ink hover:bg-roots/40"
      >
        <span className="sr-only">{t("menu")}</span>
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        aria-label={t("primary")}
        className="m-0 ml-auto h-dvh max-h-none w-[min(20rem,88vw)] max-w-none bg-surface p-0 text-ink backdrop:bg-tide/50"
      >
        <div className="flex h-full flex-col gap-6 p-5">
          <div className="flex items-center justify-between">
            <LocaleSwitcher />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-10 items-center justify-center rounded-control text-muted hover:bg-roots/40 hover:text-ink"
            >
              <span className="sr-only">{t("close")}</span>
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label={t("primary")}>
            <NavLinks orientation="column" onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      </dialog>
    </div>
  );
}
