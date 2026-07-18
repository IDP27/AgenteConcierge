/** Shapes das respostas dos endpoints /api/admin/* consumidos pelo painel. */

export interface AdminConversation {
  id: string;
  channel: "web" | "whatsapp";
  status: "open" | "needs_human" | "closed";
  createdAt: string;
  updatedAt: string;
  guest: { name: string };
  _count: { messages: number };
}

export interface AdminMessage {
  id: string;
  role: "guest" | "agent" | "human_agent" | "system";
  content: string;
  createdAt: string;
}

export interface AdminAgentAction {
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  status: "success" | "error" | "blocked_by_guardrail";
  createdAt: string;
}

export interface AdminConversationDetail {
  conversation: AdminConversation & { guest: { name: string; profile: unknown } };
  messages: AdminMessage[];
  actions: AdminAgentAction[];
}

export interface AdminOrder {
  id: string;
  items: Array<{ offerId: string | null; title: string; qty: number; priceCents: number }>;
  totalCents: number;
  status: "pending_approval" | "confirmed" | "delivered" | "cancelled";
  createdAt: string;
  reservation: { roomNumber: string | null; guest: { name: string } };
}

export interface AdminServiceOrder {
  id: string;
  category: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "cancelled";
  slaDueAt: string;
  createdAt: string;
  reservation: { roomNumber: string | null; guest: { name: string } };
}
