"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, formatDateTime } from "@/lib/api";

interface AdminResort {
  id: string;
  name: string;
}
interface AdminReservation {
  id: string;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  status: "confirmed" | "checked_in_digital" | "checked_in" | "checked_out" | "cancelled";
  plan: string;
  guest: { name: string };
}

const STATUS_LABEL: Record<AdminReservation["status"], string> = {
  confirmed: "Confirmada",
  checked_in_digital: "Check-in digital",
  checked_in: "Hospedado",
  checked_out: "Check-out feito",
  cancelled: "Cancelada",
};

const STATUS_TONE: Record<AdminReservation["status"], string> = {
  confirmed: "bg-neutral-200 text-neutral-600",
  checked_in_digital: "bg-amber-200 text-ink",
  checked_in: "bg-emerald-100 text-emerald-800",
  checked_out: "bg-neutral-200 text-neutral-600",
  cancelled: "bg-neutral-200 text-neutral-400",
};

/** Transições oferecidas por estado atual (espelham a máquina de estados do back). */
function actionsFor(status: AdminReservation["status"]): Array<{ to: string; label: string }> {
  switch (status) {
    case "confirmed":
      return [
        { to: "checked_in", label: "Marcar chegada" },
        { to: "cancelled", label: "Cancelar" },
      ];
    case "checked_in_digital":
      return [
        { to: "checked_in", label: "Marcar chegada" },
        { to: "cancelled", label: "Cancelar" },
      ];
    case "checked_in":
      return [{ to: "checked_out", label: "Fazer check-out" }];
    default:
      return [];
  }
}

export default function ReservationsPage() {
  const [resortId, setResortId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (rid: string) => {
    try {
      setReservations(await adminApi<AdminReservation[]>(`/resorts/${rid}/reservations`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar reservas");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resorts = await adminApi<AdminResort[]>("/resorts");
        const rid = resorts[0]?.id ?? null;
        setResortId(rid);
        if (rid) await load(rid);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar reservas");
      }
    })();
  }, [load]);

  const transition = async (r: AdminReservation, to: string, label: string) => {
    if (!resortId) return;
    if (to === "cancelled" && !window.confirm(`Cancelar a reserva de ${r.guest.name}?`)) return;
    setBusyId(r.id);
    try {
      await adminApi(`/resorts/${resortId}/reservations/${r.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      await load(resortId);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Falha ao ${label.toLowerCase()}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">
          Ciclo de vida da estadia
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">Reservas</h1>
      </div>

      {error && <p className="text-sm text-vermilion">{error}</p>}

      <div className="overflow-hidden rounded-sm border border-linework bg-white">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-linework px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">
          <span>Hóspede</span>
          <span className="w-40">Estadia</span>
          <span className="w-32">Status</span>
          <span className="w-56 text-right">Ações</span>
        </div>
        {reservations.length === 0 && !error && (
          <p className="px-5 py-6 text-center text-sm text-neutral-500">Nenhuma reserva.</p>
        )}
        {reservations.map((r) => {
          const actions = actionsFor(r.status);
          return (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-linework px-5 py-3 last:border-b-0"
            >
              <div>
                <span className="font-bold">{r.guest.name}</span>
                <span className="block text-xs text-neutral-500">
                  {r.roomNumber ? `Quarto ${r.roomNumber}` : "Sem quarto"} · {r.plan}
                </span>
              </div>
              <span className="w-40 text-xs text-neutral-600">
                {formatDateTime(r.checkIn).slice(0, 10)} → {formatDateTime(r.checkOut).slice(0, 10)}
              </span>
              <span className="w-32">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${STATUS_TONE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </span>
              <div className="flex w-56 justify-end gap-2">
                {actions.length === 0 ? (
                  <span className="text-xs text-neutral-300">—</span>
                ) : (
                  actions.map((a) => (
                    <button
                      key={a.to}
                      type="button"
                      className={
                        a.to === "cancelled"
                          ? "rounded-sm border border-linework px-3 py-1.5 text-xs font-bold hover:border-ink"
                          : "rounded-sm bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-ink/85"
                      }
                      disabled={busyId === r.id}
                      onClick={() => void transition(r, a.to, a.label)}
                    >
                      {a.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
