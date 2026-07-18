import { Badge } from "@/components/ui/badge";

export function ConversationStatusBadge({ status }: { status: string }) {
  if (status === "needs_human") return <Badge className="bg-red-600">Precisa de humano</Badge>;
  if (status === "closed") return <Badge variant="secondary">Fechada</Badge>;
  return <Badge className="bg-emerald-600">Aberta</Badge>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className?: string; secondary?: boolean }> = {
    pending_approval: { label: "Pendente", className: "bg-amber-500" },
    confirmed: { label: "Confirmado", className: "bg-emerald-600" },
    delivered: { label: "Entregue", secondary: true },
    cancelled: { label: "Cancelado", secondary: true },
  };
  const cfg = map[status] ?? { label: status, secondary: true };
  return cfg.secondary ? (
    <Badge variant="secondary">{cfg.label}</Badge>
  ) : (
    <Badge className={cfg.className}>{cfg.label}</Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-600",
    high: "bg-orange-500",
    medium: "bg-amber-400 text-amber-950",
    low: "bg-slate-400",
  };
  const label: Record<string, string> = {
    urgent: "Urgente",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
  };
  return <Badge className={map[priority] ?? "bg-slate-400"}>{label[priority] ?? priority}</Badge>;
}

export function ServiceOrderStatusBadge({ status }: { status: string }) {
  if (status === "resolved") return <Badge className="bg-emerald-600">Resolvida</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-500">Em andamento</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelada</Badge>;
  return <Badge className="bg-orange-500">Aberta</Badge>;
}

export function ActionStatusBadge({ status }: { status: string }) {
  if (status === "blocked_by_guardrail") return <Badge className="bg-purple-600">Guardrail</Badge>;
  if (status === "error") return <Badge className="bg-red-600">Erro</Badge>;
  return <Badge className="bg-emerald-600">OK</Badge>;
}
