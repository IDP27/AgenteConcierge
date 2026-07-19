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

type ChatItem =
  | { id: string; kind: "text"; role: "guest" | "agent" | "human_agent" | "system"; content: string }
  | { id: string; kind: "card"; cardKind: "offer"; data: OfferCardData }
  | { id: string; kind: "card"; cardKind: "order"; data: OrderCardData }
  | { id: string; kind: "card"; cardKind: "service_order"; data: ServiceOrderCardData }
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
    <Shell>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {items.length === 0 && (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            Olá! Sou o concierge virtual do resort. Posso ajudar com horários, pedidos,
            check-in e o que mais precisar. 🏝️
          </p>
        )}
        {items.map((item) => (
          <ChatItemView key={item.id} item={item} onAcceptOffer={(t) => send(`Quero aceitar a oferta "${t}"`)} streaming={streaming} />
        ))}
        {typing && <TypingIndicator label={toolStatus} />}
        {!typing && toolStatus && <TypingIndicator label={toolStatus} />}
        <div ref={bottomRef} />
      </div>

      {needsHuman && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
          Um atendente humano assumiu esta conversa — suas mensagens continuam sendo registradas.
        </div>
      )}

      {attachedImage && (
        <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span>📎 Foto anexada — será usada só para ler os dados e não fica armazenada.</span>
          <button
            type="button"
            className="font-medium text-slate-500 hover:text-slate-800"
            onClick={() => setAttachedImage(null)}
          >
            Remover
          </button>
        </div>
      )}

      <form
        className="flex gap-2 border-t bg-white px-4 py-3"
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
          aria-label="Anexar foto do documento"
          disabled={streaming || !conversationId}
          onClick={() => fileInputRef.current?.click()}
        >
          📎
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva sua mensagem…"
          disabled={streaming || !conversationId}
          autoFocus
        />
        <Button
          type="submit"
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh max-w-lg flex-col bg-slate-50">
      <header className="flex items-center gap-2 border-b bg-cyan-800 px-4 py-3 text-white">
        <span className="text-xl">🏝️</span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">Resort Paraíso</span>
          <span className="text-[11px] leading-tight text-cyan-100">Concierge virtual</span>
        </div>
      </header>
      {children}
    </main>
  );
}

function ChatItemView({
  item,
  onAcceptOffer,
  streaming,
}: {
  item: ChatItem;
  onAcceptOffer: (title: string) => void;
  streaming: boolean;
}) {
  if (item.kind === "handoff") {
    return (
      <div className="mx-auto max-w-[90%] rounded-lg bg-amber-100 px-3 py-2 text-center text-xs text-amber-900">
        🤝 {item.reason}
      </div>
    );
  }
  if (item.kind === "card") {
    if (item.cardKind === "offer")
      return <OfferListCard data={item.data} onAccept={onAcceptOffer} disabled={streaming} />;
    if (item.cardKind === "order") return <OrderStatusCard data={item.data} />;
    return <ServiceOrderCard data={item.data} />;
  }

  const isGuest = item.role === "guest";
  if (item.role === "system") {
    return (
      <div className="mx-auto max-w-[90%] rounded-lg bg-slate-200 px-3 py-2 text-center text-xs text-slate-600">
        {item.content}
      </div>
    );
  }
  return (
    <div className={isGuest ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isGuest
            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-cyan-700 px-3.5 py-2 text-sm text-white"
            : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-white px-3.5 py-2 text-sm shadow-sm"
        }
      >
        {item.role === "human_agent" && (
          <span className="mb-0.5 block text-[10px] font-semibold text-cyan-700">Atendente</span>
        )}
        <FormattedText text={item.content} />
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm border bg-white px-3.5 py-3 shadow-sm">
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
