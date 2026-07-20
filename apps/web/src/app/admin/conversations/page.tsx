"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConversationStatusBadge } from "@/components/admin/badges";
import { adminApi, formatDateTime } from "@/lib/api";
import type { AdminConversation } from "@/lib/admin-types";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [onlyNeedsHuman, setOnlyNeedsHuman] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filterNeedsHuman: boolean) => {
    try {
      const query = filterNeedsHuman ? "?status=needs_human" : "";
      setConversations(await adminApi<AdminConversation[]>(`/conversations${query}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar conversas");
    }
  }, []);

  useEffect(() => {
    void load(onlyNeedsHuman);
    const interval = setInterval(() => void load(onlyNeedsHuman), 15_000);
    return () => clearInterval(interval);
  }, [load, onlyNeedsHuman]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Conversas</h1>
        <div className="flex">
          <button
            type="button"
            className={
              onlyNeedsHuman
                ? "rounded-l-sm border border-linework bg-white px-3 py-1.5 text-sm font-bold hover:border-ink"
                : "rounded-l-sm border border-ink bg-ink px-3 py-1.5 text-sm font-bold text-white"
            }
            onClick={() => setOnlyNeedsHuman(false)}
          >
            Todas
          </button>
          <button
            type="button"
            className={
              onlyNeedsHuman
                ? "rounded-r-sm border border-ink bg-ink px-3 py-1.5 text-sm font-bold text-white"
                : "rounded-r-sm border border-l-0 border-linework bg-white px-3 py-1.5 text-sm font-bold hover:border-ink"
            }
            onClick={() => setOnlyNeedsHuman(true)}
          >
            Aguardando humano
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-vermilion">{error}</p>}

      <div className="rounded-sm border border-linework bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hóspede</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Mensagens</TableHead>
              <TableHead>Atualizada</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Nenhuma conversa encontrada.
                </TableCell>
              </TableRow>
            )}
            {conversations.map((c) => (
              <TableRow
                key={c.id}
                className={c.status === "needs_human" ? "bg-amber-50" : undefined}
              >
                <TableCell className="font-bold">{c.guest.name}</TableCell>
                <TableCell>
                  <ConversationStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.channel}</TableCell>
                <TableCell className="text-right text-sm">{c._count.messages}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(c.updatedAt)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/conversations/${c.id}`}
                    className="rounded-sm border border-linework bg-white px-3 py-1.5 text-xs font-bold hover:border-ink"
                  >
                    Abrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
