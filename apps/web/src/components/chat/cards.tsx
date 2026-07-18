"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatDateTime } from "@/lib/api";

/** Shapes emitidos pelas tools da API (card.data). */
export interface OfferCardData {
  offers: Array<{ id: string; title: string; description: string; priceCents: number; tags: string[] }>;
}
export interface OrderCardData {
  id: string;
  items: Array<{ offerId: string | null; title: string; qty: number; priceCents: number }>;
  totalCents: number;
  status: "pending_approval" | "confirmed" | "delivered" | "cancelled";
}
export interface ServiceOrderCardData {
  id: string;
  category: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  slaDueAt: string;
}

const ORDER_STATUS_LABEL: Record<OrderCardData["status"], string> = {
  pending_approval: "Aguardando aprovação",
  confirmed: "Confirmado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const PRIORITY_LABEL: Record<ServiceOrderCardData["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export function OfferListCard({
  data,
  onAccept,
  disabled,
}: {
  data: OfferCardData;
  onAccept: (title: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      {data.offers.map((offer) => (
        <Card key={offer.id} className="border-cyan-100 bg-cyan-50/50 py-3">
          <CardContent className="flex flex-col gap-1.5 px-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold">{offer.title}</span>
              <span className="shrink-0 text-sm font-bold text-cyan-800">
                {formatBRL(offer.priceCents)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{offer.description}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1 self-start border-cyan-600 text-cyan-700 hover:bg-cyan-600 hover:text-white"
              disabled={disabled}
              onClick={() => onAccept(offer.title)}
            >
              Aceitar oferta
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function OrderStatusCard({ data }: { data: OrderCardData }) {
  const pending = data.status === "pending_approval";
  return (
    <Card className="max-w-[85%] border-emerald-100 bg-emerald-50/50 py-3">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Pedido</span>
          <Badge variant={pending ? "secondary" : "default"} className={pending ? "bg-amber-100 text-amber-800" : "bg-emerald-600"}>
            {ORDER_STATUS_LABEL[data.status]}
          </Badge>
        </div>
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {data.items.map((item, i) => (
            <li key={i}>
              {item.qty}× {item.title}
              {item.priceCents > 0 ? ` — ${formatBRL(item.priceCents * item.qty)}` : " — cortesia"}
            </li>
          ))}
        </ul>
        <span className="text-sm font-bold">Total: {formatBRL(data.totalCents)}</span>
      </CardContent>
    </Card>
  );
}

export function ServiceOrderCard({ data }: { data: ServiceOrderCardData }) {
  return (
    <Card className="max-w-[85%] border-orange-100 bg-orange-50/60 py-3">
      <CardContent className="flex flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Chamado aberto</span>
          <Badge className="bg-orange-600">{PRIORITY_LABEL[data.priority]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{data.description}</p>
        <span className="text-xs">
          Previsão de atendimento: <strong>{formatDateTime(data.slaDueAt)}</strong>
        </span>
      </CardContent>
    </Card>
  );
}
