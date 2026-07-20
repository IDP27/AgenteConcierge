"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActionStatusBadge, ConversationStatusBadge } from "@/components/admin/badges";
import { FormattedText } from "@/components/chat/format-text";
import { adminApi, formatDateTime } from "@/lib/api";
import type { AdminAgentAction, AdminConversationDetail, AdminMessage } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

/** Transcript + trilha de ações do agente intercaladas por timestamp. */
type TimelineEntry =
  | { kind: "message"; at: string; message: AdminMessage }
  | { kind: "action"; at: string; action: AdminAgentAction };

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<AdminConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await adminApi<AdminConversationDetail>(`/conversations/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar conversa");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    if (!detail) return [];
    return [
      ...detail.messages.map<TimelineEntry>((m) => ({ kind: "message", at: m.createdAt, message: m })),
      ...detail.actions.map<TimelineEntry>((a) => ({ kind: "action", at: a.createdAt, action: a })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [detail]);

  const resolve = async (status: "open" | "closed") => {
    setBusy(true);
    try {
      await adminApi(`/conversations/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm text-vermilion">{error}</p>;
  if (!detail) return <p className="text-sm text-neutral-500">Carregando…</p>;

  const { conversation } = detail;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/conversations"
            className="rounded-sm border border-linework bg-white px-3 py-1.5 text-xs font-bold hover:border-ink"
          >
            ← Voltar
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight">{conversation.guest.name}</h1>
          <ConversationStatusBadge status={conversation.status} />
        </div>
        <div className="flex gap-2">
          {conversation.status === "needs_human" && (
            <Button
              size="sm"
              className="rounded-sm bg-vermilion font-bold text-white hover:bg-vermilion/90"
              disabled={busy}
              onClick={() => resolve("open")}
            >
              Devolver ao agente
            </Button>
          )}
          {conversation.status !== "closed" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm border-linework font-bold hover:border-ink"
              disabled={busy}
              onClick={() => resolve("closed")}
            >
              Fechar conversa
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-sm border border-linework bg-white p-5">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
          Linha do tempo · mensagens + ações do agente
        </span>
        <div className="mt-3 flex flex-col gap-2">
          {timeline.map((entry, i) =>
            entry.kind === "message" ? (
              <MessageRow key={`m-${i}`} message={entry.message} />
            ) : (
              <ActionRow key={`a-${i}`} action={entry.action} />
            ),
          )}
          {timeline.length === 0 && <p className="text-sm text-neutral-500">Sem mensagens ainda.</p>}
        </div>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<AdminMessage["role"], string> = {
  guest: "Hóspede",
  agent: "Agente",
  human_agent: "Atendente",
  system: "Sistema",
};

function MessageRow({ message }: { message: AdminMessage }) {
  const isGuest = message.role === "guest";
  return (
    <div className={cn("flex", isGuest ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-sm px-3 py-2 text-sm",
          isGuest ? "bg-paper" : "border border-linework bg-white",
          message.role === "system" && "border border-amber-200 bg-amber-50",
        )}
      >
        <div className="mb-0.5 flex items-baseline gap-2">
          <span
            className={cn(
              "text-[10px] font-extrabold uppercase tracking-widest",
              message.role === "human_agent" ? "text-vermilion" : "text-neutral-400",
            )}
          >
            {ROLE_LABEL[message.role]}
          </span>
          <span className="text-[10px] text-neutral-400">{formatDateTime(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap">
          <FormattedText text={message.content} />
        </p>
      </div>
    </div>
  );
}

function ActionRow({ action }: { action: AdminAgentAction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto w-full max-w-[90%]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-sm border border-dashed border-linework bg-paper px-3 py-1.5 text-left text-xs text-neutral-600 hover:border-ink"
      >
        <span className="font-mono font-bold">⚙ {action.toolName}</span>
        <ActionStatusBadge status={action.status} />
        <span className="ml-auto text-[10px] text-neutral-400">
          {formatDateTime(action.createdAt)} · {open ? "ocultar" : "detalhes"}
        </span>
      </button>
      {open && (
        <pre className="mt-1 overflow-x-auto rounded-sm bg-ink p-3 text-[11px] leading-relaxed text-neutral-100">
          {`input:  ${JSON.stringify(action.input, null, 2)}\noutput: ${JSON.stringify(action.output, null, 2)}`}
        </pre>
      )}
    </div>
  );
}
