/** Chips de status no sistema Modernist: quadrados, caps, tracking largo. */
function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${tone}`}
    >
      {children}
    </span>
  );
}

export function ConversationStatusBadge({ status }: { status: string }) {
  if (status === "needs_human") return <Chip tone="bg-amber-300 text-ink">Aguardando humano</Chip>;
  if (status === "closed") return <Chip tone="bg-neutral-200 text-neutral-600">Fechada</Chip>;
  return <Chip tone="bg-emerald-100 text-emerald-800">Aberta</Chip>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    pending_approval: { label: "Pendente", tone: "bg-amber-300 text-ink" },
    confirmed: { label: "Confirmado", tone: "bg-emerald-100 text-emerald-800" },
    delivered: { label: "Entregue", tone: "bg-neutral-200 text-neutral-600" },
    cancelled: { label: "Cancelado", tone: "bg-neutral-200 text-neutral-600" },
  };
  const cfg = map[status] ?? { label: status, tone: "bg-neutral-200 text-neutral-600" };
  return <Chip tone={cfg.tone}>{cfg.label}</Chip>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    urgent: { label: "Urgente", tone: "bg-vermilion text-white" },
    high: { label: "Alta", tone: "bg-vermilion text-white" },
    medium: { label: "Média", tone: "bg-ink text-white" },
    low: { label: "Baixa", tone: "bg-neutral-400 text-white" },
  };
  const cfg = map[priority] ?? { label: priority, tone: "bg-neutral-400 text-white" };
  return <Chip tone={cfg.tone}>{cfg.label}</Chip>;
}

export function ServiceOrderStatusBadge({ status }: { status: string }) {
  if (status === "resolved") return <Chip tone="bg-emerald-100 text-emerald-800">Resolvida</Chip>;
  if (status === "in_progress") return <Chip tone="bg-ink text-white">Em andamento</Chip>;
  if (status === "cancelled") return <Chip tone="bg-neutral-200 text-neutral-600">Cancelada</Chip>;
  return <Chip tone="bg-amber-300 text-ink">Aberta</Chip>;
}

export function ActionStatusBadge({ status }: { status: string }) {
  if (status === "blocked_by_guardrail") return <Chip tone="bg-ink text-white">Guardrail</Chip>;
  if (status === "error") return <Chip tone="bg-vermilion text-white">Erro</Chip>;
  return <Chip tone="bg-emerald-100 text-emerald-800">OK</Chip>;
}
