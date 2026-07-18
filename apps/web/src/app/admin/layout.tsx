"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clearAdminKey, getAdminKey, setAdminKey } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/conversations", label: "Conversas" },
  { href: "/admin/approvals", label: "Aprovações" },
  { href: "/admin/service-orders", label: "Ordens de serviço" },
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

  useEffect(() => {
    setHasKey(Boolean(getAdminKey()));
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!hasKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Painel do Resort</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
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
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={!draft.trim()}>
                Entrar
              </Button>
              <p className="text-xs text-muted-foreground">
                Ambiente de desenvolvimento: use o valor de <code>ADMIN_API_KEY</code> do .env.
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-white">
        <div className="border-b px-4 py-4">
          <span className="text-sm font-bold">🏝️ Resort Paraíso</span>
          <p className="text-[11px] text-muted-foreground">Painel do concierge</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  active ? "bg-cyan-800 font-medium text-white" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => {
              clearAdminKey();
              setHasKey(false);
            }}
          >
            Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
