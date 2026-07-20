"use client";

import { Button } from "@/components/ui/button";
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
  confirmed: "Pedido confirmado",
  delivered: "Pedido entregue",
  cancelled: "Pedido cancelado",
};

const PRIORITY_LABEL: Record<ServiceOrderCardData["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const PRIORITY_BADGE: Record<ServiceOrderCardData["priority"], string> = {
  low: "bg-neutral-400",
  medium: "bg-neutral-800",
  high: "bg-vermilion",
  urgent: "bg-vermilion",
};

/** Rótulo em caixa alta com o acento da marca — assinatura do sistema Modernist. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
      {children}
    </span>
  );
}

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
    <div className="flex max-w-[88%] flex-col gap-2">
      {data.offers.map((offer) => (
        <div key={offer.id} className="flex flex-col gap-1.5 rounded-sm border border-linework bg-white p-4">
          <Eyebrow>Oferta de hoje</Eyebrow>
          <span className="text-base font-extrabold leading-snug tracking-tight">
            {offer.title}
          </span>
          <p className="text-xs text-neutral-600">{offer.description}</p>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-linework pt-3">
            <span className="text-lg font-extrabold tracking-tight">
              {formatBRL(offer.priceCents)}
            </span>
            <Button
              size="sm"
              className="rounded-sm bg-vermilion font-bold text-white hover:bg-vermilion/90"
              disabled={disabled}
              onClick={() => onAccept(offer.title)}
            >
              Aceitar oferta
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrderStatusCard({ data }: { data: OrderCardData }) {
  return (
    <div className="flex max-w-[88%] flex-col gap-2 rounded-sm border border-linework bg-white p-4">
      <Eyebrow>
        {ORDER_STATUS_LABEL[data.status]} · Nº {data.id.slice(0, 4).toUpperCase()}
      </Eyebrow>
      <ul className="flex flex-col gap-1 text-sm">
        {data.items.map((item, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <span>
              {item.qty}× {item.title}
            </span>
            <span className="shrink-0 text-neutral-600">
              {item.priceCents > 0 ? formatBRL(item.priceCents * item.qty) : "cortesia"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3 border-t border-linework pt-2">
        <span className="text-xs text-neutral-500">Lançado na conta do quarto</span>
        <span className="text-lg font-extrabold tracking-tight">{formatBRL(data.totalCents)}</span>
      </div>
    </div>
  );
}

export function ServiceOrderCard({ data }: { data: ServiceOrderCardData }) {
  return (
    <div className="flex max-w-[88%] flex-col gap-1.5 rounded-sm border border-linework bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Ordem de serviço · {data.id.slice(0, 4).toUpperCase()}</Eyebrow>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white ${PRIORITY_BADGE[data.priority]}`}
        >
          {PRIORITY_LABEL[data.priority]}
        </span>
      </div>
      <span className="border-b border-linework pb-2 text-base font-extrabold leading-snug tracking-tight">
        {data.description}
      </span>
      <span className="text-xs text-neutral-600">
        🕓 Equipe acionada · Prazo: <strong className="text-ink">{formatDateTime(data.slaDueAt)}</strong>
      </span>
    </div>
  );
}
