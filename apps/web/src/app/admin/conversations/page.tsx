"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Conversas</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={onlyNeedsHuman ? "outline" : "default"}
            onClick={() => setOnlyNeedsHuman(false)}
          >
            Todas
          </Button>
          <Button
            size="sm"
            variant={onlyNeedsHuman ? "default" : "outline"}
            className={onlyNeedsHuman ? "bg-red-600 hover:bg-red-700" : undefined}
            onClick={() => setOnlyNeedsHuman(true)}
          >
            Precisam de humano
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border bg-white">
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
              <TableRow key={c.id} className={c.status === "needs_human" ? "bg-red-50" : undefined}>
                <TableCell className="font-medium">{c.guest.name}</TableCell>
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
                    className={buttonVariants({ variant: "outline", size: "sm" })}
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
