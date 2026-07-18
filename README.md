# 🏝️ Agente Concierge

Chatbot de IA multi-tenant para resorts: acompanha o hóspede em toda a jornada
(pré-estadia → check-in → estadia → reclamações → pós-estadia), gera upsell
contextual e reduz carga de atendimento humano.

**Stack:** pnpm workspaces + Turborepo · Fastify 5 + Zod · PostgreSQL 16 + Prisma ·
Anthropic API (`claude-sonnet-4-6`, tool use nativo + streaming SSE) · Next.js 15 +
Tailwind 4 + shadcn/ui.

> 📐 Arquitetura completa (diagramas, ADRs, schema, endpoints): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Pré-requisitos

- **Node.js** ≥ 20 e **pnpm** ≥ 9 (`corepack enable` ou https://pnpm.io/installation)
- **Docker** (para o Postgres local)
- **Chave da Anthropic API** (https://platform.claude.com/settings/keys)

## Setup em 5 comandos

```bash
pnpm install                 # 1. dependências do monorepo
cp .env.example .env         # 2. env — edite ANTHROPIC_API_KEY com sua chave real
docker compose up -d         # 3. Postgres 16 (porta 5433 no host)
pnpm db:migrate              # 4. migrations versionadas
pnpm seed                    # 5. Resort Paraíso + 3 hóspedes + 8 ofertas + knowledge base
```

Depois, em um terminal:

```bash
pnpm dev                     # API em :3333 e web em :3000 (Turborepo)
```

## Variáveis de ambiente (`.env` na raiz)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Postgres do docker-compose (`postgresql://concierge:concierge@localhost:5433/concierge`) |
| `PORT` | Porta da API (padrão `3333`) |
| `ADMIN_API_KEY` | Chave do painel admin no MVP (header `x-admin-key`) |
| `ANTHROPIC_API_KEY` | **Obrigatória para o agente responder** — sem ela o chat degrada com erro amigável |
| `NEXT_PUBLIC_API_URL` | URL da API vista pelo browser (padrão `http://localhost:3333`) |

## Testes e qualidade

```bash
pnpm test    # 46 testes: unitários por tool + integração (Anthropic mockada, Postgres real)
pnpm build   # typecheck estrito (API/shared) + build de produção (web)
pnpm lint    # ESLint (zero any) nos 3 pacotes
```

---

## 🎬 Roteiro de demo (5 minutos)

Abra http://localhost:3000 — a landing tem atalhos para os 3 hóspedes do seed,
cada um em um momento da jornada:

| Hóspede | Token | Momento |
|---|---|---|
| Ana Souza | `tok-ana` | chega **amanhã** (pré-estadia) |
| Bruno Lima | `tok-bruno` | **hospedado** hoje, quarto 204 |
| Carla Mendes | `tok-carla` | fez **check-out ontem** |

### 1. FAQ (RAG simples) — Bruno, ~30s
No chat do Bruno: **"Até que horas a piscina fica aberta? Pode levar copo de vidro?"**
→ resposta vem da knowledge base (`data/knowledge/{resort_id}.md`), sem inventar dados.

### 2. Consultar reserva — Bruno, ~20s
**"Até que dia fica minha reserva? Qual meu quarto?"**
→ micro-status "Consultando sua reserva…" (tool `get_reservation`, escopada ao token).

### 3. Check-in antecipado — Ana, ~60s
No chat da Ana: **"Quero adiantar meu check-in"**
→ o agente coleta CPF e horário de chegada na conversa, então chama
`start_early_checkin` e a reserva vira `checked_in_digital`.
Repita o pedido para ver o guardrail: "check-in já realizado".

### 4. Pedidos na estadia — Bruno, ~60s
- **"Me manda 2 toalhas extras na piscina?"** → cortesia (R$ 0), pedido `confirmed`, card no chat.
- **"Quero reservar o jantar romântico pé na areia"** → R$ 450 > limite de R$ 200 →
  card **"Aguardando aprovação"**. Abra `/admin` → **Aprovações** e aprove em 1 clique.

### 5. Reclamação com SLA — Bruno, ~45s
**"O ar-condicionado do quarto não funciona"**
→ OS aberta com prioridade **alta** (palavras-chave de severidade) e SLA de 2h;
card com previsão no chat. Em `/admin` → **Ordens de serviço**, resolva a OS.
Teste severidade: "o banheiro está alagado" → prioridade **urgente**, SLA 1h.

### 6. Upsell contextual — Bruno, ~30s
**"Estou exausto depois do dia com as crianças…"**
→ o agente pode sugerir proativamente (perfil do Bruno: kids/food) via `suggest_offers`.
Repita no mesmo dia → guardrail anti-spam bloqueia (auditado como `blocked_by_guardrail`).

### Bônus — handoff e auditoria, ~30s
- **"Isso é um absurdo, quero falar com um atendente!"** → conversa vira `needs_human`,
  destacada em vermelho no painel; o agente silencia até a equipe devolver.
- Em `/admin` → **Conversas** → abra a conversa: a linha do tempo intercala mensagens
  e a trilha `agent_actions` (tool, input, output, status) — toda ação do agente é auditável.

Painel admin: http://localhost:3000/admin — chave = valor de `ADMIN_API_KEY` (padrão `dev-admin-key`).

---

## Como escalar (pós-MVP)

- **WhatsApp**: o core já é neutro de canal (padrão `ChannelAdapter`). Implementar
  `WhatsAppAdapter` (buffering de deltas → mensagem única via Cloud API) + rota de
  webhook que resolve o hóspede pelo telefone e chama o mesmo `ConversationService`.
  Zero mudança no motor do agente — ver stub documentado em
  `apps/api/src/channels/whatsapp-adapter.ts`.
- **Filas com BullMQ**: mover o turno do agente para um worker (Redis + BullMQ),
  com a API publicando jobs e streamando resultados via pub/sub. Necessário para
  WhatsApp (webhooks não podem esperar o modelo) e para retry/rate-limit por resort.
- **RAG real**: trocar o carregamento integral do markdown por `pgvector` no mesmo
  Postgres (interface `KnowledgeProvider`), com chunking + embeddings. O prompt
  caching atual já barateia o approach ingênuo até a base crescer.
- **Auth real**: magic token → JWT com refresh (hóspede) e SSO/RBAC multi-resort
  (admin). Os pontos de troca são só `plugins/guest-auth.ts` e `plugins/admin-auth.ts`.
- **Observabilidade**: OpenTelemetry no Fastify + métricas de agente (latência por
  turno, tokens/custo por conversa via `usage`, taxa de tool errors, cache hit rate)
  — a trilha `agent_actions` já é a base do tracing de negócio.
- **Aprovação em tempo real**: hoje o painel usa polling (15–30s); trocar por SSE
  admin ou WebSocket quando houver volume.

## Estrutura do monorepo

```
apps/api        Fastify + agente (channels → routes → services → agent-core → tools → repositories)
apps/web        Next.js: /chat (widget SSE) e /admin (painel)
packages/shared Schemas Zod + protocolo AgentEvent compartilhados
data/knowledge  Base de conhecimento por resort ({resort_id}.md)
docs/           ARCHITECTURE.md (diagramas, ADRs, ER, endpoints)
```
