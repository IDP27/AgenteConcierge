"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/admin/badges";
import { adminApi, formatBRL, formatDateTime } from "@/lib/api";
import type { AdminOrder } from "@/lib/admin-types";

export default function ApprovalsPage() {
  const [pending, setPending] = useState<AdminOrder[]>([]);
  const [recent, setRecent] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pendingOrders, allOrders] = await Promise.all([
        adminApi<AdminOrder[]>("/orders?status=pending_approval"),
        adminApi<AdminOrder[]>("/orders?limit=20"),
      ]);
      setPending(pendingOrders);
      setRecent(allOrders.filter((o) => o.status !== "pending_approval"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar pedidos");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const act = async (id: string, action: "approve" | "cancel") => {
    setBusyId(id);
    try {
      await adminApi(`/orders/${id}/${action}`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Fila de aprovações</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido aguardando aprovação. ✅</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((order) => (
            <Card key={order.id} className="border-amber-300">
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{order.reservation.guest.name}</span>
                    {order.reservation.roomNumber && (
                      <span className="text-xs text-muted-foreground">
                        Quarto {order.reservation.roomNumber}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </span>
                  </div>
                  <ul className="text-sm text-muted-foreground">
                    {order.items.map((item, i) => (
                      <li key={i}>
                        {item.qty}× {item.title}
                        {item.priceCents > 0 && ` — ${formatBRL(item.priceCents * item.qty)}`}
                      </li>
                    ))}
                  </ul>
                  <span className="text-sm font-bold">Total: {formatBRL(order.totalCents)}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={busyId === order.id}
                    onClick={() => act(order.id, "approve")}
                  >
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    disabled={busyId === order.id}
                    onClick={() => act(order.id, "cancel")}
                  >
                    Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Pedidos recentes</h2>
        {recent.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between rounded-md border bg-white px-4 py-2 text-sm"
          >
            <span>
              {order.reservation.guest.name} — {order.items.map((i) => `${i.qty}× ${i.title}`).join(", ")}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatBRL(order.totalCents)}</span>
              <OrderStatusBadge status={order.status} />
            </div>
          </div>
        ))}
        {recent.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        )}
      </div>
    </div>
  );
}
