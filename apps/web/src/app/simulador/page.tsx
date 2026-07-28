"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { prepareImageForUpload } from "@/lib/image";

interface SimGuest {
  name: string;
  phone: string;
  roomNumber: string | null;
  reservationStatus: string | null;
  reachable: boolean;
}

type Outbound =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: Array<{ id: string; title: string }> };

interface SendResponse {
  status: "handled" | "unknown_guest" | "ignored";
  messages: Outbound[];
}

type Bubble =
  | { id: string; from: "guest"; text: string; hasPhoto?: boolean }
  | { id: string; from: "agent"; message: Outbound };

const uid = () => crypto.randomUUID();

/** Atalhos que cobrem os momentos da jornada — testar cenário em um clique. */
const SCENARIOS = [
  { label: "Pedir a chave", text: "Oi! Pode me mandar a chave do meu quarto?" },
  { label: "Ver o extrato", text: "Quanto eu já gastei até agora?" },
  { label: "O que tem hoje", text: "O que tem para fazer hoje no resort?" },
  { label: "Reclamar", text: "O chuveiro do meu quarto está pingando sem parar" },
  { label: "Sugerir algo", text: "Estou com fome, o que você recomenda?" },
  { label: "Fazer check-out", text: "Quero fazer o meu check-out" },
  { label: "Falar com humano", text: "Quero falar com um atendente agora" },
];

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in_digital: "Check-in digital",
  checked_in: "Hospedado",
  checked_out: "Check-out feito",
  cancelled: "Cancelada",
};

export default function SimuladorPage() {
  const [guests, setGuests] = useState<SimGuest[]>([]);
  const [phone, setPhone] = useState<string>("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const guest = guests.find((g) => g.phone === phone) ?? null;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/simulator/guests`);
        if (!res.ok) throw new Error("Simulador indisponível — a API está rodando?");
        const list = (await res.json()) as SimGuest[];
        setGuests(list);
        setPhone(list.find((g) => g.reachable)?.phone ?? list[0]?.phone ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar hóspedes");
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, busy]);

  const send = useCallback(
    async (payload: {
      text?: string;
      button?: { id: string; title: string };
      image?: { base64: string; mediaType: string; caption?: string };
    }) => {
      if (!phone || busy) return;
      const shown = payload.text ?? payload.button?.title ?? payload.image?.caption ?? "📷 Foto";
      setBubbles((prev) => [
        ...prev,
        { id: uid(), from: "guest", text: shown, hasPhoto: Boolean(payload.image) },
      ]);
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/simulator/whatsapp/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from: phone, ...payload }),
        });
        if (!res.ok) throw new Error(`Erro ${res.status} ao enviar`);
        const data = (await res.json()) as SendResponse;
        setBubbles((prev) => [
          ...prev,
          ...data.messages.map((m) => ({ id: uid(), from: "agent" as const, message: m })),
        ]);
        if (data.status === "unknown_guest" && data.messages.length === 0) {
          setError("Telefone sem reserva ativa — o agente não respondeu.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar");
      } finally {
        setBusy(false);
      }
    },
    [phone, busy],
  );

  const reset = async () => {
    if (!phone) return;
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/simulator/whatsapp/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: phone }),
      });
      setBubbles([]);
      setError(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linework pb-5">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
            Ferramenta de teste
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">Simulador de WhatsApp</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-600">
            A mensagem percorre o mesmo caminho do webhook real — identificação pelo telefone,
            agente e renderização do canal. Só a entrega à Meta é substituída, então o que aparece
            aqui é o que o hóspede receberia no aparelho.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reset()}
          disabled={busy || !phone}
          className="rounded-sm border border-linework px-3 py-2 text-xs font-bold hover:border-ink disabled:opacity-40"
        >
          Reiniciar conversa
        </button>
      </header>

      {error && <p className="text-sm font-medium text-vermilion">{error}</p>}

      <div className="grid gap-8 md:grid-cols-[1fr_auto]">
        {/* Controles */}
        <section className="flex flex-col gap-5">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">
              Conversando como
            </span>
            <div className="mt-2 flex flex-col gap-2">
              {guests.map((g) => (
                <button
                  key={g.phone}
                  type="button"
                  onClick={() => {
                    setPhone(g.phone);
                    setBubbles([]);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-sm border px-4 py-3 text-left text-sm transition-colors ${
                    g.phone === phone
                      ? "border-ink bg-white"
                      : "border-linework bg-white hover:border-neutral-400"
                  }`}
                >
                  <span>
                    <span className="font-bold">{g.name}</span>
                    <span className="block text-xs text-neutral-500">
                      {g.phone}
                      {g.roomNumber ? ` · Quarto ${g.roomNumber}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-widest">
                    {g.reachable ? (
                      <span className="bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                        {STATUS_LABEL[g.reservationStatus ?? ""] ?? g.reservationStatus}
                      </span>
                    ) : (
                      <span className="bg-neutral-200 px-1.5 py-0.5 text-neutral-500">
                        sem consentimento
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {guests.length === 0 && !error && (
                <p className="text-sm text-neutral-500">Carregando hóspedes…</p>
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-400">
              Cenários
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={busy || !phone}
                  onClick={() => void send({ text: s.text })}
                  className="rounded-sm border border-linework bg-white px-3 py-2 text-xs font-bold hover:border-ink disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Telefone */}
        <section className="mx-auto w-full max-w-[380px]">
          <div className="flex h-[640px] flex-col overflow-hidden rounded-xl border border-linework shadow-sm">
            {/* Barra do WhatsApp */}
            <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
              <span className="flex size-9 items-center justify-center rounded-full bg-white/20 text-lg">
                🏝️
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Resort Paraíso</p>
                <p className="text-[11px] text-white/70">
                  {busy ? "digitando…" : guest ? `você é ${guest.name}` : "selecione um hóspede"}
                </p>
              </div>
              <span className="rounded-sm bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest">
                Simulador
              </span>
            </div>

            {/* Thread */}
            <div className="flex-1 space-y-2 overflow-y-auto bg-[#ECE5DD] px-3 py-4">
              {bubbles.length === 0 && (
                <p className="mx-auto max-w-[80%] rounded-sm bg-[#FFF6D5] px-3 py-2 text-center text-[11px] text-neutral-600">
                  Escolha um cenário ou escreva uma mensagem para começar.
                </p>
              )}
              {bubbles.map((b) =>
                b.from === "guest" ? (
                  <div key={b.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 text-sm shadow-sm">
                      {b.hasPhoto && (
                        <span className="mb-1 block rounded bg-black/5 px-2 py-4 text-center text-xs text-neutral-500">
                          📷 foto enviada
                        </span>
                      )}
                      {b.text}
                    </div>
                  </div>
                ) : (
                  <div key={b.id} className="flex justify-start">
                    <div className="max-w-[85%] overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm">
                      <p className="whitespace-pre-wrap px-3 py-2 text-sm">
                        {renderWhatsAppText(b.message.body)}
                      </p>
                      {b.message.kind === "buttons" && (
                        <div className="border-t border-neutral-200">
                          {b.message.buttons.map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              disabled={busy}
                              onClick={() => void send({ button: btn })}
                              className="block w-full border-b border-neutral-200 px-3 py-2 text-center text-sm font-medium text-[#00A5F4] last:border-b-0 hover:bg-neutral-50 disabled:opacity-50"
                            >
                              {btn.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-white px-3 py-2 text-xs text-neutral-400 shadow-sm">
                    digitando…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Caixa de envio */}
            <form
              className="flex items-center gap-2 bg-[#F0F0F0] px-2 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = input.trim();
                if (!value) return;
                setInput("");
                void send({ text: value });
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const img = await prepareImageForUpload(file);
                    await send({
                      image: { ...img, caption: input.trim() || undefined },
                    });
                    setInput("");
                  } catch {
                    setError("Não consegui processar essa imagem.");
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !phone}
                onClick={() => fileRef.current?.click()}
                aria-label="Anexar foto"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 disabled:opacity-40"
              >
                📎
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Mensagem"
                disabled={busy || !phone}
                className="min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-sm outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !input.trim() || !phone}
                aria-label="Enviar"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white disabled:opacity-40"
              >
                ➤
              </button>
            </form>
          </div>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-neutral-500">
            Nada é enviado à Meta. Os cortes da Cloud API (botões truncados em 20 caracteres,
            máximo de 3) são aplicados aqui igual ao envio real.
          </p>
        </section>
      </div>
    </main>
  );
}

/** *negrito* do WhatsApp → <strong>, para o texto sair como no aparelho. */
function renderWhatsAppText(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
      <strong key={i} className="font-semibold">
        {part.slice(1, -1)}
      </strong>
    ) : (
      part
    ),
  );
}
