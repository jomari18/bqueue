"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RailItem } from "@/lib/nav";

/**
 * Donka's floating vertical icon rail on the right from 768 px, a bottom bar on phones (spec 11.1).
 * Targets are at least 48 px for senior citizens (spec 11.6).
 */
export function IconRail({ items, active }: { items: RailItem[]; active: string }) {
  const t = useTranslations("nav");
  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:inset-x-auto md:right-4 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-pill md:border md:p-2 md:shadow-card"
    >
      <ul className="flex justify-around md:flex-col md:gap-2">
        {items.map(({ href, labelKey, icon: Icon }) => {
          const current = active === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-pill px-3 py-1 text-xs font-medium md:size-14 md:px-0 ${
                  current ? "bg-accent text-on-accent" : "text-muted hover:bg-raised"
                }`}
              >
                <Icon aria-hidden size={22} />
                <span>{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
