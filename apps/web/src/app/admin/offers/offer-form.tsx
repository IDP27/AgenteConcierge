"use client";

import { useMemo, useState } from "react";
import { OFFER_TAGS, type OfferInput, type OfferWithStats } from "@concierge/shared";

/** Painel lateral de criação/edição de oferta (sistema Modernist). */
export function OfferForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: OfferWithStats | null;
  onSave: (input: OfferInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceReais, setPriceReais] = useState(
    initial ? (initial.priceCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [customTag, setCustomTag] = useState("");
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // Atalhos canônicos + quaisquer tags customizadas já na oferta (preservadas).
  const suggestedTags = useMemo(
    () => [...new Set<string>([...OFFER_TAGS, ...tags])],
    [tags],
  );

  const addCustomTag = () => {
    const t = customTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setCustomTag("");
  };

  const priceCents = Math.round(Number(priceReais.replace(/\./g, "").replace(",", ".")) * 100);
  const valid = title.trim().length >= 2 && description.trim().length >= 2 && priceCents >= 0 && !Number.isNaN(priceCents);

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: description.trim(), priceCents, tags, active });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onCancel}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-linework bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
          {initial ? "Editar oferta" : "Nova oferta"}
        </span>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight">
          {initial ? initial.title : "Criar oferta"}
        </h2>

        <div className="flex flex-col gap-4">
          <Field label="Título">
            <input
              className="w-full rounded-sm border border-linework px-3 py-2 text-sm outline-none focus:border-ink"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </Field>

          <Field label="Descrição">
            <textarea
              className="w-full resize-none rounded-sm border border-linework px-3 py-2 text-sm outline-none focus:border-ink"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={400}
            />
          </Field>

          <Field label="Preço (R$)">
            <input
              className="w-full rounded-sm border border-linework px-3 py-2 text-sm outline-none focus:border-ink"
              inputMode="decimal"
              placeholder="280,00"
              value={priceReais}
              onChange={(e) => setPriceReais(e.target.value)}
            />
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {suggestedTags.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={
                      on
                        ? "rounded-sm bg-ink px-2 py-1 text-xs font-bold text-white"
                        : "rounded-sm border border-linework px-2 py-1 text-xs hover:border-ink"
                    }
                    onClick={() => toggleTag(t)}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 rounded-sm border border-linework px-3 py-1.5 text-xs outline-none focus:border-ink"
                placeholder="nova tag…"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
              />
              <button
                type="button"
                className="rounded-sm border border-linework px-3 py-1.5 text-xs font-bold hover:border-ink"
                onClick={addCustomTag}
              >
                Adicionar
              </button>
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Oferta ativa
          </label>
          <p className="-mt-2 text-xs text-neutral-500">
            Ofertas pausadas não são sugeridas pelo agente.
          </p>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className="rounded-sm bg-vermilion px-4 py-2.5 text-sm font-bold text-white hover:bg-vermilion/90 disabled:bg-neutral-200 disabled:text-neutral-400"
            disabled={!valid || saving}
            onClick={() => void submit()}
          >
            Salvar oferta
          </button>
          <button
            type="button"
            className="rounded-sm border border-linework px-4 py-2.5 text-sm font-bold hover:border-ink"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        {label}
      </label>
      {children}
    </div>
  );
}
