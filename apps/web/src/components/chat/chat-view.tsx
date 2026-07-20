"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guestApi } from "@/lib/api";
import { streamAgentEvents, type OutgoingImage } from "@/lib/sse";
import { prepareImageForUpload } from "@/lib/image";
import {
  OfferListCard,
  OrderStatusCard,
  ServiceOrderCard,
  type OfferCardData,
  type OrderCardData,
  type ServiceOrderCardData,
} from "./cards";
import { FormattedText } from "./format-text";
import {
  ReviewLinkCard,
  ReviewPromptCard,
  type ReviewLinkCardData,
  type ReviewPromptCardData,
} from "./review-card";

type ChatItem =
  | { id: string; kind: "text"; role: "guest" | "agent" | "human_agent" | "system"; content: string }
  | { id: string; kind: "card"; cardKind: "offer"; data: OfferCardData }
  | { id: string; kind: "card"; cardKind: "order"; data: OrderCardData }
  | { id: string; kind: "card"; cardKind: "service_order"; data: ServiceOrderCardData }
  | { id: string; kind: "card"; cardKind: "review_prompt"; data: ReviewPromptCardData }
  | { id: string; kind: "card"; cardKind: "review_link"; data: ReviewLinkCardData }
  | { id: string; kind: "handoff"; reason: string };

interface ApiMessage {
  id: string;
  role: "guest" | "agent" | "human_agent" | "system";
  content: string;
}

const uid = () => crypto.randomUUID();

export function ChatView() {
  const token = useSearchParams().get("token");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<OutgoingImage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bootstrap: cria/retoma a conversa e carrega o histórico.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const conversation = await guestApi<{ id: string; status: string }>(
          "/api/conversations",
          token,
          { method: "POST", body: JSON.stringify({ channel: "web" }) },
        );
        setConversationId(conversation.id);
        setNeedsHuman(conversation.status === "needs_human");
        const detail = await guestApi<{ messages: ApiMessage[] }>(
          `/api/conversations/${conversation.id}`,
          token,
        );
        setItems(
          detail.messages.map((m) => ({ id: m.id, kind: "text", role: m.role, content: m.content })),
        );
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "Não foi possível iniciar a conversa");
      }
    })();
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, typing]);

  const send = useCallback(
    async (content: string, image?: OutgoingImage) => {
      if (!token || !conversationId || streaming || !content.trim()) return;
      setStreaming(true);
      setTyping(true);
      setAttachedImage(null);
      setItems((prev) => [
        ...prev,
        { id: uid(), kind: "text", role: "guest", content: image ? `📎 ${content}` : content },
      ]);

      const agentItemId = uid();
      let agentStarted = false;

      try {
        for await (const event of streamAgentEvents(conversationId, token, content, image)) {
          switch (event.type) {
            case "text_delta":
              setTyping(false);
              if (!agentStarted) {
                agentStarted = true;
                setItems((prev) => [
                  ...prev,
                  { id: agentItemId, kind: "text", role: "agent", content: event.text },
                ]);
              } else {
                setItems((prev) =>
                  prev.map((item) =>
                    item.id === agentItemId && item.kind === "text"
                      ? { ...item, content: item.content + event.text }
                      : item,
                  ),
                );
              }
              break;
            case "tool_started":
              setToolStatus(TOOL_STATUS[event.toolName] ?? "Consultando informações…");
              break;
            case "card":
              setItems((prev) => [
                ...prev,
                { id: uid(), kind: "card", cardKind: event.kind, data: event.data } as ChatItem,
              ]);
              break;
            case "handoff":
              setNeedsHuman(true);
              setItems((prev) => [...prev, { id: uid(), kind: "handoff", reason: event.reason }]);
              break;
            case "error":
              setItems((prev) => [
                ...prev,
                { id: uid(), kind: "text", role: "system", content: event.message },
              ]);
              break;
          }
        }
      } catch {
        setItems((prev) => [
          ...prev,
          {
            id: uid(),
            kind: "text",
            role: "system",
            content: "Falha de conexão — verifique sua internet e tente novamente.",
          },
        ]);
      } finally {
        setStreaming(false);
        setTyping(false);
        setToolStatus(null);
      }
    },
    [token, conversationId, streaming],
  );

  if (!token) {
    return (
      <Shell>
        <p className="p-6 text-center text-sm text-muted-foreground">
          Link inválido: falta o token de acesso. Use o link enviado pelo resort
          (ex.: <code>/chat?token=…</code>).
        </p>
      </Shell>
    );
  }
  if (fatal) {
    return (
      <Shell>
        <p className="p-6 text-center text-sm text-destructive">{fatal}</p>
      </Shell>
    );
  }

  return (
    <Shell status={needsHuman ? "Atendimento humano" : "Online agora"}>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {items.length === 0 && (
          <div className="flex flex-col gap-4 pt-8">
            <div>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight">
                Oi! Eu sou o concierge virtual do resort 🌴
              </h1>
              <p className="mt-2 border-b border-linework pb-4 text-sm text-neutral-600">
                Posso ajudar com horários, pedidos, check-in e o que mais você precisar durante
                a sua estadia.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {["O que tem hoje?", "Fazer meu check-in", "Pedir toalhas no quarto"].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-sm border border-linework bg-white px-4 py-3 text-left text-sm font-medium hover:border-ink disabled:opacity-50"
                  disabled={streaming || !conversationId}
                  onClick={() => void send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((item) => (
          <ChatItemView
            key={item.id}
            item={item}
            onAcceptOffer={(t) => send(`Quero aceitar a oferta "${t}"`)}
            onSubmitReview={(rating, comment) =>
              send(
                comment
                  ? `Minha nota é ${rating} de 5. Comentário: ${comment}`
                  : `Minha nota é ${rating} de 5.`,
              )
            }
            streaming={streaming}
          />
        ))}
        {typing && <TypingIndicator label={toolStatus} />}
        {!typing && toolStatus && <TypingIndicator label={toolStatus} />}
        <div ref={bottomRef} />
      </div>

      {needsHuman && (
        <div className="border-t border-linework bg-white px-4 py-2 text-center text-xs text-neutral-500">
          Suas mensagens continuam sendo registradas para a equipe.
        </div>
      )}

      {attachedImage && (
        <div className="flex items-center justify-between gap-2 border-t border-linework bg-white px-4 py-2 text-xs text-neutral-600">
          <span>
            📎 <strong className="font-bold text-ink">Foto anexada</strong> — usada só para
            leitura, não fica armazenada.
          </span>
          <button
            type="button"
            className="shrink-0 font-bold uppercase tracking-wide text-vermilion hover:opacity-80"
            onClick={() => setAttachedImage(null)}
          >
            Remover
          </button>
        </div>
      )}

      <form
        className="flex gap-2 border-t border-linework bg-white px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const value = input.trim() || (attachedImage ? "Segue a foto do meu documento." : "");
          const image = attachedImage ?? undefined;
          setInput("");
          void send(value, image);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              setAttachedImage(await prepareImageForUpload(file));
            } catch {
              setItems((prev) => [
                ...prev,
                {
                  id: uid(),
                  kind: "text",
                  role: "system",
                  content: "Não consegui processar essa imagem — tente outra foto.",
                },
              ]);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-sm border-linework"
          aria-label="Anexar foto do documento"
          disabled={streaming || !conversationId}
          onClick={() => fileInputRef.current?.click()}
        >
          📎
        </Button>
        <Input
          className="rounded-sm border-linework"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva sua mensagem…"
          disabled={streaming || !conversationId}
          autoFocus
        />
        <Button
          type="submit"
          className="rounded-sm bg-vermilion font-bold text-white hover:bg-vermilion/90"
          disabled={streaming || (!input.trim() && !attachedImage) || !conversationId}
        >
          Enviar
        </Button>
      </form>
    </Shell>
  );
}

const TOOL_STATUS: Record<string, string> = {
  get_reservation: "Consultando sua reserva…",
  get_daily_schedule: "Consultando a programação…",
  ask_review_rating: "Preparando sua avaliação…",
  update_checkin_form: "Salvando seus dados…",
  complete_early_checkin: "Concluindo seu check-in…",
  list_offers: "Buscando ofertas…",
  create_order: "Registrando seu pedido…",
  create_service_order: "Acionando a equipe…",
  suggest_offers: "Separando sugestões…",
  mute_offers: "Registrando sua preferência…",
  register_rebooking_interest: "Registrando seu interesse…",
  request_review: "Registrando sua avaliação…",
  escalate_to_human: "Chamando um atendente…",
};

function Shell({ children, status }: { children: React.ReactNode; status?: string }) {
  return (
    <main className="mx-auto flex h-dvh max-w-lg flex-col border-x border-linework bg-paper text-ink">
      <header className="flex items-center gap-3 border-b border-linework bg-white px-4 py-3">
        <span className="flex size-9 items-center justify-center border border-linework text-lg">
          🏝️
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-extrabold leading-tight tracking-tight">
            Resort Paraíso · Concierge
          </span>
          <span className="flex items-center gap-1.5 text-[11px] leading-tight text-neutral-500">
            <span className="inline-block size-2 bg-vermilion" />
            {status ?? "Online agora"}
          </span>
        </div>
      </header>
      {children}
    </main>
  );
}

function ChatItemView({
  item,
  onAcceptOffer,
  onSubmitReview,
  streaming,
}: {
  item: ChatItem;
  onAcceptOffer: (title: string) => void;
  onSubmitReview: (rating: number, comment: string) => void;
  streaming: boolean;
}) {
  if (item.kind === "handoff") {
    return (
      <div className="max-w-[90%] border-l-4 border-vermilion bg-vermilion/5 px-3 py-2 text-xs">
        <span className="font-bold">Um atendente assumiu esta conversa.</span>
        <span className="block text-neutral-600">{item.reason}</span>
      </div>
    );
  }
  if (item.kind === "card") {
    if (item.cardKind === "offer")
      return <OfferListCard data={item.data} onAccept={onAcceptOffer} disabled={streaming} />;
    if (item.cardKind === "order") return <OrderStatusCard data={item.data} />;
    if (item.cardKind === "review_prompt")
      return <ReviewPromptCard onSubmit={onSubmitReview} disabled={streaming} />;
    if (item.cardKind === "review_link") return <ReviewLinkCard data={item.data} />;
    return <ServiceOrderCard data={item.data} />;
  }

  const isGuest = item.role === "guest";
  if (item.role === "system") {
    return (
      <div className="mx-auto max-w-[90%] px-3 py-1 text-center text-[11px] uppercase tracking-widest text-neutral-400">
        {item.content}
      </div>
    );
  }
  return (
    <div className={isGuest ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isGuest
            ? "max-w-[85%] whitespace-pre-wrap rounded-sm bg-ink px-3.5 py-2 text-sm text-white"
            : "max-w-[85%] whitespace-pre-wrap rounded-sm border border-linework bg-white px-3.5 py-2 text-sm"
        }
      >
        {item.role === "human_agent" && (
          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-widest text-vermilion">
            Atendente
          </span>
        )}
        <FormattedText text={item.content} />
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-sm border border-linework bg-white px-3.5 py-2.5">
        <span className="flex gap-1">
          <span className="size-1.5 animate-bounce bg-vermilion [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce bg-vermilion/70 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce bg-vermilion/40" />
        </span>
        {label && <span className="text-xs text-neutral-500">{label}</span>}
      </div>
    </div>
  );
}
