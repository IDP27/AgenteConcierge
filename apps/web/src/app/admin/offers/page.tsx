"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OfferInput, OfferWithStats } from "@concierge/shared";
import { adminApi, formatBRL } from "@/lib/api";
import { OfferForm } from "./offer-form";

interface AdminResort {
  id: string;
  name: string;
}

export default function OffersPage() {
  const [resortId, setResortId] = useState<string | null>(null);
  const [offers, setOffers] = useState<OfferWithStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OfferWithStats | "new" | null>(null);

  const load = useCallback(async (rid: string) => {
    try {
      setOffers(await adminApi<OfferWithStats[]>(`/resorts/${rid}/offers`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ofertas");
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
        setError(err instanceof Error ? err.message : "Falha ao carregar ofertas");
      }
    })();
  }, [load]);

  // Melhor conversão: destaca a oferta que mais converte (com base mínima de dados).
  const bestOfferId = useMemo(() => {
    let best: { id: string; rate: number } | null = null;
    for (const o of offers) {
      if (o.suggestedCount < 3) continue;
      const rate = o.acceptedCount / o.suggestedCount;
      if (!best || rate > best.rate) best = { id: o.id, rate };
    }
    return best?.id ?? null;
  }, [offers]);

  const save = async (input: OfferInput) => {
    if (!resortId) return;
    const path =
      editing && editing !== "new"
        ? `/resorts/${resortId}/offers/${editing.id}`
        : `/resorts/${resortId}/offers`;
    await adminApi(path, {
      method: editing && editing !== "new" ? "PUT" : "POST",
      body: JSON.stringify(input),
    });
    setEditing(null);
    await load(resortId);
  };

  const remove = async (offer: OfferWithStats) => {
    if (!resortId || !window.confirm(`Excluir a oferta "${offer.title}"?`)) return;
    await adminApi(`/resorts/${resortId}/offers/${offer.id}`, { method: "DELETE" });
    await load(resortId);
  };

  const activeCount = offers.filter((o) => o.active).length;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-linework pb-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-600">
            Catálogo do agente
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">Ofertas</h1>
          <p className="text-sm text-neutral-500">
            {offers.length} ofertas · {activeCount} ativas no momento
          </p>
        </div>
        <button
          type="button"
          className="rounded-sm bg-vermilion px-4 py-2.5 text-sm font-bold text-white hover:bg-vermilion/90"
          onClick={() => setEditing("new")}
        >
          + Nova oferta
        </button>
      </div>

      {error && <p className="text-sm text-vermilion">{error}</p>}

      {offers.length === 0 && !error ? (
        <div className="rounded-sm border border-dashed border-linework bg-white p-10 text-center">
          <p className="text-sm text-neutral-600">
            O agente só sugere o que estiver no catálogo. Comece criando sua primeira oferta.
          </p>
          <button
            type="button"
            className="mt-4 rounded-sm bg-vermilion px-4 py-2.5 text-sm font-bold text-white hover:bg-vermilion/90"
            onClick={() => setEditing("new")}
          >
            Criar primeira oferta
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-sm border border-linework bg-white">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-linework px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-600">
            <span>Oferta</span>
            <span className="text-right">Preço</span>
            <span className="w-24">Tags</span>
            <span className="w-28 text-center">Sugerida / Aceita</span>
            <span className="w-32 text-right">Status</span>
          </div>
          {offers.map((offer) => {
            const isBest = offer.id === bestOfferId;
            const conv =
              offer.suggestedCount > 0
                ? `${Math.round((offer.acceptedCount / offer.suggestedCount) * 100)}%`
                : "—";
            return (
              <div
                key={offer.id}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-start gap-4 border-b border-linework px-5 py-4 last:border-b-0 ${
                  isBest ? "border-l-4 border-l-vermilion bg-vermilion/5" : ""
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-base font-extrabold leading-snug tracking-tight">
                    {offer.title}
                  </span>
                  {isBest && (
                    <span className="w-fit bg-vermilion px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white">
                      ★ Melhor conversão
                    </span>
                  )}
                  <span className="text-xs text-neutral-500">{offer.description}</span>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 hover:text-ink"
                      onClick={() => setEditing(offer)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-[11px] font-bold uppercase tracking-wide text-vermilion hover:opacity-80"
                      onClick={() => void remove(offer)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
                <span className="text-right text-base font-extrabold tracking-tight">
                  {formatBRL(offer.priceCents)}
                </span>
                <div className="flex w-24 flex-wrap gap-1">
                  {offer.tags.map((t) => (
                    <span key={t} className="bg-paper px-1.5 py-0.5 text-[10px] text-neutral-600">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="w-28 text-center text-sm">
                  <span className="font-extrabold">{offer.suggestedCount}</span>
                  <span className="text-neutral-600"> / </span>
                  <span className="font-extrabold">{offer.acceptedCount}</span>
                  <span className="block text-[11px] text-neutral-600">conversão {conv}</span>
                </div>
                <div className="w-32 text-right">
                  <span
                    className={
                      offer.active
                        ? "bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-800"
                        : "bg-neutral-200 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-neutral-500"
                    }
                  >
                    {offer.active ? "Ativa" : "Pausada"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <OfferForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
