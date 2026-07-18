"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const { conversation } = detail;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/conversations"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ← Voltar
          </Link>
          <h1 className="text-lg font-bold">{conversation.guest.name}</h1>
          <ConversationStatusBadge status={conversation.status} />
        </div>
        <div className="flex gap-2">
          {conversation.status === "needs_human" && (
            <Button size="sm" disabled={busy} onClick={() => resolve("open")}>
              Devolver ao agente
            </Button>
          )}
          {conversation.status !== "closed" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve("closed")}>
              Fechar conversa
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Linha do tempo (mensagens + ações do agente)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {timeline.map((entry, i) =>
            entry.kind === "message" ? (
              <MessageRow key={`m-${i}`} message={entry.message} />
            ) : (
              <ActionRow key={`a-${i}`} action={entry.action} />
            ),
          )}
          {timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem mensagens ainda.</p>
          )}
        </CardContent>
      </Card>
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
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          isGuest ? "bg-slate-100" : "border bg-white",
          message.role === "system" && "bg-amber-50 text-amber-900",
        )}
      >
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            {ROLE_LABEL[message.role]}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatDateTime(message.createdAt)}
          </span>
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
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100"
      >
        <span className="font-mono font-medium">⚙ {action.toolName}</span>
        <ActionStatusBadge status={action.status} />
        <span className="ml-auto text-[10px] text-muted-foreground">
          {formatDateTime(action.createdAt)} · {open ? "ocultar" : "detalhes"}
        </span>
      </button>
      {open && (
        <pre className="mt-1 overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
          {`input:  ${JSON.stringify(action.input, null, 2)}\noutput: ${JSON.stringify(action.output, null, 2)}`}
        </pre>
      )}
    </div>
  );
}
