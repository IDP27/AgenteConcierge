"use client";

import { useCallback, useEffect, useState } from "react";
import type { Metrics, ResortSettings } from "@concierge/shared";
import { adminApi, formatBRL } from "@/lib/api";

interface AdminResort {
  id: string;
  name: string;
  settings: ResortSettings;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [resorts, setResorts] = useState<AdminResort[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        adminApi<Metrics>("/metrics"),
        adminApi<AdminResort[]>("/resorts"),
      ]);
      setMetrics(m);
      setResorts(r);
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar métricas");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleKillSwitch = useCallback(
    async (resort: AdminResort) => {
      const enabled = !resort.settings.financialKillSwitch;
      const label = enabled
        ? `Suspender TODOS os pedidos feitos pelo agente no ${resort.name}?`
        : `Reativar os pedidos pelo agente no ${resort.name}?`;
      if (!window.confirm(label)) return;
      await adminApi(`/resorts/${resort.id}/kill-switch`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      await load();
    },
    [load],
  );

  if (error) return <p className="text-sm text-vermilion">{error}</p>;
  if (!metrics)
    return <p className="text-sm text-neutral-500">Carregando métricas…</p>;

  const rate =
    metrics.resolutionWithoutHumanRate === null
      ? "—"
      : `${Math.round(metrics.resolutionWithoutHumanRate * 100)}%`;
  const upsellPct =
    metrics.upsellSuggested > 0
      ? Math.round((metrics.upsellConverted / metrics.upsellSuggested) * 100)
      : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
        {updatedAt && (
          <span className="text-sm text-neutral-500">
            Hoje, {updatedAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} ·
            atualizado às{" "}
            {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard eyebrow="Resolução sem humano" value={rate} hint="conversas resolvidas só pelo agente" />
        <MetricCard
          eyebrow="Conversas"
          value={String(metrics.conversationsTotal)}
          chip={
            metrics.conversationsNeedsHuman > 0
              ? { label: `${metrics.conversationsNeedsHuman} aguardando humano`, tone: "amber" }
              : undefined
          }
          alert={metrics.conversationsNeedsHuman > 0}
        />
        <MetricCard
          eyebrow="Pedidos"
          value={String(metrics.ordersCreated)}
          chip={
            metrics.ordersPendingApproval > 0
              ? { label: `${metrics.ordersPendingApproval} pendentes de aprovação`, tone: "red" }
              : undefined
          }
        />
        <MetricCard
          eyebrow="Ordens de serviço"
          value={String(metrics.serviceOrdersOpen)}
          hint={`abertas · ${metrics.serviceOrdersResolved} resolvidas`}
        />
        <MetricCard
          eyebrow="Conversão de upsell"
          value={`${metrics.upsellConverted}/${metrics.upsellSuggested}`}
          hint={`${upsellPct}% das ofertas aceitas`}
          progress={upsellPct}
        />
      </div>

      <div className="border-t border-linework" />

      {resorts.map((resort) => {
        const suspended = resort.settings.financialKillSwitch;
        const limit = formatBRL(resort.settings.orderAutoApproveLimitCents);
        return (
          <div key={resort.id} className="rounded-sm border border-linework bg-neutral-100 p-5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
              Controle de emergência
            </span>
            <h2 className="mt-1 text-xl font-extrabold leading-tight tracking-tight">
              Ações financeiras do agente
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-sm text-sm text-neutral-600">
                {suspended
                  ? "Pedidos pelo agente estão suspensos — a equipe assume qualquer solicitação."
                  : `O agente pode confirmar pedidos de até ${limit}; acima disso, aprovação humana.`}
              </p>
              <div className="flex items-center gap-3">
                <span
                  className={
                    suspended
                      ? "bg-vermilion/5 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-vermilion"
                      : "bg-emerald-100 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-emerald-800"
                  }
                >
                  {suspended ? "⊘ Suspenso" : "● Ativo"}
                </span>
                <button
                  type="button"
                  className={
                    suspended
                      ? "rounded-sm bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-ink/85"
                      : "rounded-sm bg-vermilion px-4 py-2 text-sm font-bold text-white hover:bg-vermilion/90"
                  }
                  onClick={() => void toggleKillSwitch(resort)}
                >
                  {suspended ? "Reativar pedidos" : "⊘ Suspender pedidos"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-neutral-600">Atualiza automaticamente a cada 30s.</p>
    </div>
  );
}

function MetricCard({
  eyebrow,
  value,
  hint,
  chip,
  alert,
  progress,
}: {
  eyebrow: string;
  value: string;
  hint?: string;
  chip?: { label: string; tone: "amber" | "red" };
  alert?: boolean;
  progress?: number;
}) {
  return (
    <div
      className={`rounded-sm border border-linework bg-neutral-100 p-5 ${alert ? "border-t-4 border-t-amber-400" : ""}`}
    >
      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
        {eyebrow}
      </span>
      <p className="mt-1 text-4xl font-extrabold tracking-tight">{value}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full bg-neutral-300">
          <div className="h-full bg-ink" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      {chip && (
        <span
          className={`mt-3 inline-block px-2 py-1 text-[11px] font-bold ${
            chip.tone === "amber" ? "bg-amber-200 text-ink" : "bg-vermilion/5 text-vermilion"
          }`}
        >
          {chip.label}
        </span>
      )}
      {hint && !chip && <p className="mt-2 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
