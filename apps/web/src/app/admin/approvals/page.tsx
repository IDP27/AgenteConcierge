"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Aprovações</h1>
      {error && <p className="text-sm text-vermilion">{error}</p>}

      {pending.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum pedido aguardando aprovação. ✅</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((order) => (
            <div
              key={order.id}
              className="rounded-sm border border-linework border-t-4 border-t-amber-400 bg-white p-5"
            >
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
                Aguardando aprovação · {formatDateTime(order.createdAt)}
              </span>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-extrabold tracking-tight">
                    {order.reservation.guest.name}
                    {order.reservation.roomNumber && (
                      <span className="ml-2 text-sm font-medium text-neutral-500">
                        Quarto {order.reservation.roomNumber}
                      </span>
                    )}
                  </span>
                  <ul className="text-sm text-neutral-600">
                    {order.items.map((item, i) => (
                      <li key={i}>
                        {item.qty}× {item.title}
                        {item.priceCents > 0 && ` — ${formatBRL(item.priceCents * item.qty)}`}
                      </li>
                    ))}
                  </ul>
                  <span className="text-xl font-extrabold tracking-tight">
                    {formatBRL(order.totalCents)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-sm bg-vermilion font-bold text-white hover:bg-vermilion/90"
                    disabled={busyId === order.id}
                    onClick={() => act(order.id, "approve")}
                  >
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-sm border-linework font-bold hover:border-ink"
                    disabled={busyId === order.id}
                    onClick={() => act(order.id, "cancel")}
                  >
                    Rejeitar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-600">
          Pedidos recentes
        </h2>
        {recent.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between gap-3 rounded-sm border border-linework bg-white px-4 py-2.5 text-sm"
          >
            <span>
              <strong className="font-bold">{order.reservation.guest.name}</strong> —{" "}
              {order.items.map((i) => `${i.qty}× ${i.title}`).join(", ")}
            </span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-extrabold tracking-tight">{formatBRL(order.totalCents)}</span>
              <OrderStatusBadge status={order.status} />
            </div>
          </div>
        ))}
        {recent.length === 0 && <p className="text-sm text-neutral-500">Nenhum pedido ainda.</p>}
      </div>
    </div>
  );
}
