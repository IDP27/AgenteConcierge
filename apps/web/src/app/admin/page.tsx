"use client";

import { useCallback, useEffect, useState } from "react";
import type { Metrics, ResortSettings } from "@concierge/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api";

interface AdminResort {
  id: string;
  name: string;
  settings: ResortSettings;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [resorts, setResorts] = useState<AdminResort[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        adminApi<Metrics>("/metrics"),
        adminApi<AdminResort[]>("/resorts"),
      ]);
      setMetrics(m);
      setResorts(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar métricas");
    }
  }, []);

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

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!metrics) return <p className="text-sm text-muted-foreground">Carregando métricas…</p>;

  const rate =
    metrics.resolutionWithoutHumanRate === null
      ? "—"
      : `${Math.round(metrics.resolutionWithoutHumanRate * 100)}%`;
  const conversion =
    metrics.upsellSuggested > 0
      ? `${metrics.upsellConverted}/${metrics.upsellSuggested}`
      : "0/0";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Resolução sem humano"
          value={rate}
          hint="conversas fechadas resolvidas só pelo agente"
        />
        <MetricCard
          title="Conversas"
          value={String(metrics.conversationsTotal)}
          hint={`${metrics.conversationsNeedsHuman} aguardando humano`}
          alert={metrics.conversationsNeedsHuman > 0}
        />
        <MetricCard
          title="Pedidos"
          value={String(metrics.ordersCreated)}
          hint={`${metrics.ordersPendingApproval} pendentes de aprovação`}
          alert={metrics.ordersPendingApproval > 0}
        />
        <MetricCard
          title="Ordens de serviço"
          value={`${metrics.serviceOrdersOpen} abertas`}
          hint={`${metrics.serviceOrdersResolved} resolvidas`}
        />
        <MetricCard
          title="Conversão de upsell"
          value={conversion}
          hint="conversas com sugestão que geraram pedido"
        />
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ações financeiras do agente
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {resorts.map((resort) => {
            const suspended = resort.settings.financialKillSwitch;
            return (
              <div key={resort.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{resort.name}</p>
                  <p className={`text-xs ${suspended ? "text-destructive" : "text-muted-foreground"}`}>
                    {suspended
                      ? "Kill switch ATIVO — o agente não cria pedidos; a equipe assume."
                      : "Pedidos pelo agente ativos (com limite de aprovação humana)."}
                  </p>
                </div>
                <Button
                  variant={suspended ? "default" : "destructive"}
                  size="sm"
                  onClick={() => void toggleKillSwitch(resort)}
                >
                  {suspended ? "Reativar pedidos" : "Suspender pedidos"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Atualiza automaticamente a cada 30s.</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  alert,
}: {
  title: string;
  value: string;
  hint: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-amber-300" : undefined}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-bold">{value}</span>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
