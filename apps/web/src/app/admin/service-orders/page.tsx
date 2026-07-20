"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PriorityBadge, ServiceOrderStatusBadge } from "@/components/admin/badges";
import { adminApi, formatDateTime } from "@/lib/api";
import type { AdminServiceOrder } from "@/lib/admin-types";

const CATEGORY_LABEL: Record<string, string> = {
  maintenance: "Manutenção",
  housekeeping: "Limpeza",
  noise: "Barulho",
  amenities: "Itens",
  other: "Outros",
};

export default function ServiceOrdersPage() {
  const [serviceOrders, setServiceOrders] = useState<AdminServiceOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setServiceOrders(await adminApi<AdminServiceOrder[]>("/service-orders"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar OS");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const resolve = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi(`/service-orders/${id}/resolve`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Ordens de serviço</h1>
      {error && <p className="text-sm text-vermilion">{error}</p>}

      <div className="rounded-sm border border-linework bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hóspede</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {serviceOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Nenhuma OS registrada.
                </TableCell>
              </TableRow>
            )}
            {serviceOrders.map((so) => {
              const overdue = so.status === "open" && new Date(so.slaDueAt) < new Date();
              return (
                <TableRow key={so.id} className={overdue ? "bg-vermilion/5" : undefined}>
                  <TableCell className="font-bold">
                    {so.reservation.guest.name}
                    {so.reservation.roomNumber && (
                      <span className="block text-xs font-normal text-neutral-500">
                        Quarto {so.reservation.roomNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{CATEGORY_LABEL[so.category] ?? so.category}</TableCell>
                  <TableCell className="max-w-64">
                    <div className="truncate text-sm text-neutral-600" title={so.description}>
                      {so.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={so.priority} />
                  </TableCell>
                  <TableCell
                    className={overdue ? "text-sm font-extrabold text-vermilion" : "text-sm"}
                  >
                    {formatDateTime(so.slaDueAt)}
                    {overdue && " ⚠️"}
                  </TableCell>
                  <TableCell>
                    <ServiceOrderStatusBadge status={so.status} />
                  </TableCell>
                  <TableCell>
                    {(so.status === "open" || so.status === "in_progress") && (
                      <Button
                        size="sm"
                        className="rounded-sm bg-ink font-bold text-white hover:bg-ink/85"
                        disabled={busyId === so.id}
                        onClick={() => resolve(so.id)}
                      >
                        Marcar resolvida
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
