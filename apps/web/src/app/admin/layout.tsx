"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Metrics } from "@concierge/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi, clearAdminKey, getAdminKey, setAdminKey } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/reservations", label: "Reservas", icon: "🗓️" },
  { href: "/admin/conversations", label: "Conversas", icon: "💬" },
  { href: "/admin/approvals", label: "Aprovações", icon: "☑" },
  { href: "/admin/service-orders", label: "Ordens de serviço", icon: "🔧" },
  { href: "/admin/offers", label: "Ofertas", icon: "🏷️" },
];

/**
 * Gate de acesso do MVP: pede a API key uma vez (sessionStorage) e envia como
 * x-admin-key. Estruturado para trocar por login real sem tocar nas páginas.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    setHasKey(Boolean(getAdminKey()));
    setReady(true);
  }, []);

  // Badges da sidebar (aguardando humano / pendentes) — mesmo endpoint do dashboard.
  const loadBadges = useCallback(async () => {
    try {
      setMetrics(await adminApi<Metrics>("/metrics"));
    } catch {
      // sem badge é melhor que quebrar a navegação
    }
  }, []);

  useEffect(() => {
    if (!hasKey) return;
    void loadBadges();
    const interval = setInterval(loadBadges, 30_000);
    return () => clearInterval(interval);
  }, [hasKey, loadBadges]);

  if (!ready) return null;

  if (!hasKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6 text-ink">
        <div className="w-full max-w-sm rounded-sm border border-linework bg-white p-6">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
            Acesso da equipe
          </span>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight">Painel do Resort</h1>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              setAdminKey(draft.trim());
              setHasKey(true);
            }}
          >
            <Input
              type="password"
              placeholder="API key de admin"
              className="rounded-sm border-linework"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <Button
              type="submit"
              className="rounded-sm bg-vermilion font-bold text-white hover:bg-vermilion/90"
              disabled={!draft.trim()}
            >
              Entrar
            </Button>
            <p className="text-xs text-neutral-500">
              Ambiente de desenvolvimento: use o valor de <code>ADMIN_API_KEY</code> do .env.
            </p>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-linework bg-white">
        <div className="px-4 py-5">
          <span className="flex size-9 items-center justify-center border border-linework text-lg">
            🏝️
          </span>
          <p className="mt-3 text-base font-extrabold leading-tight tracking-tight">
            Resort Paraíso
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
            Painel do concierge
          </p>
        </div>
        <div className="mx-4 border-t border-linework" />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const badge =
              item.href === "/admin/conversations"
                ? metrics?.conversationsNeedsHuman
                : item.href === "/admin/approvals"
                  ? metrics?.ordersPendingApproval
                  : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-sm px-3 py-2 text-sm font-medium",
                  active ? "bg-ink text-white" : "text-neutral-700 hover:bg-paper",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="w-4 text-center text-xs">{item.icon}</span>
                  {item.label}
                </span>
                {badge !== undefined && badge > 0 && (
                  <span
                    className={cn(
                      "min-w-5 px-1 py-0.5 text-center text-[10px] font-extrabold",
                      item.href === "/admin/approvals"
                        ? "bg-vermilion text-white"
                        : "bg-amber-300 text-ink",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mx-4 border-t border-linework" />
        <div className="p-4">
          <p className="text-xs font-medium">Equipe do resort</p>
          <p className="text-[11px] text-neutral-500">Acesso via chave de admin</p>
          <button
            type="button"
            className="mt-3 w-full rounded-sm border border-linework px-3 py-2 text-left text-sm font-bold hover:border-ink"
            onClick={() => {
              clearAdminKey();
              setHasKey(false);
            }}
          >
            [→ Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
