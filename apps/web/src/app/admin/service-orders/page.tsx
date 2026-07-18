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
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Ordens de serviço</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border bg-white">
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
                <TableRow key={so.id} className={overdue ? "bg-red-50" : undefined}>
                  <TableCell className="font-medium">
                    {so.reservation.guest.name}
                    {so.reservation.roomNumber && (
                      <span className="block text-xs text-muted-foreground">
                        Quarto {so.reservation.roomNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{CATEGORY_LABEL[so.category] ?? so.category}</TableCell>
                  <TableCell className="max-w-64 text-sm text-muted-foreground">
                    {so.description}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={so.priority} />
                  </TableCell>
                  <TableCell className={overdue ? "text-sm font-medium text-red-600" : "text-sm"}>
                    {formatDateTime(so.slaDueAt)}
                    {overdue && " ⚠️"}
                  </TableCell>
                  <TableCell>
                    <ServiceOrderStatusBadge status={so.status} />
                  </TableCell>
                  <TableCell>
                    {(so.status === "open" || so.status === "in_progress") && (
                      <Button size="sm" disabled={busyId === so.id} onClick={() => resolve(so.id)}>
                        Resolver
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
