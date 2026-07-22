# Status do Projeto e Prontidão para Piloto

**Projeto:** Agente Concierge — concierge conversacional multi-tenant para resorts
**Data:** 21/07/2026
**Objetivo deste documento:** registrar, de forma honesta, (A) tudo que o projeto **já apresenta e é funcional hoje**, distinguindo o que é **real** do que é **demonstração/mock**, e (B) **o que falta** para entrar em um **ambiente real de testes (piloto)**.

> Documentos irmãos: `docs/ARCHITECTURE.md` (decisões técnicas/ADRs), `docs/GAP_ANALYSIS.md` (cobertura da jornada), `docs/INTEGRACAO_OPERA.md` (integração com o PMS).

---

## Parte A — O que existe e é funcional hoje

### A.0 Panorama — duas faces, dois públicos

| Face | Público | Onde | Estado |
|---|---|---|---|
| **Chat do hóspede** | Hóspede | `/chat?token=…` (web) · WhatsApp (pronto, desligado) | ✅ Funcional |
| **Painel da equipe** | Staff do resort | `/admin` | ✅ Funcional |

> A tela inicial com atalhos Ana/Bruno/Carla é **andaime de demonstração** — em produção o hóspede entra pelo próprio link mágico, não escolhe persona.

### A.1 Chat do hóspede — 16 ferramentas do agente

Todas registradas em `apps/api/src/agent/tools/index.ts`, cada uma como plugin isolado com guardrails determinísticos e auditoria.

| # | Ferramenta | O que faz | Observação de prontidão |
|---|---|---|---|
| 1 | `get_reservation` | Lê a reserva do hóspede | Lê do **banco semeado** (seed); em produção, do PMS |
| 2 | `get_daily_schedule` | Agenda de atividades do dia | Lê da base de conhecimento do resort |
| 3 | `update_checkin_form` | Check-in conversacional (FNRH incremental, ViaCEP, OCR de documento, acompanhantes) | ✅ · imagem **não** é armazenada (LGPD) |
| 4 | `complete_early_checkin` | Conclui o check-in digital | Falta **assinatura digital** + **sync com PMS** |
| 5 | `list_offers` | Catálogo de ofertas | Preço sempre do banco, nunca do modelo |
| 6 | `create_order` | Pedido/serviço pago | Kill switch + limite → aprovação humana |
| 7 | `get_room_bill` | Extrato da conta do quarto | Lê via `PmsAdapter.getFolio` (hoje soma nossos pedidos) |
| 8 | `get_room_key` | Chave digital do quarto | **Mock** (PIN, não abre porta física) |
| 9 | `request_checkout` | Check-out expresso | Pagamento fica na recepção/PMS por definição |
| 10 | `create_service_order` | Abre OS (prioridade + SLA + triagem por foto) | Foto → `addMaintenance` (Governança do PMS) |
| 11 | `suggest_offers` | Upsell contextual proativo | Anti-spam (1/dia) + opt-out |
| 12 | `mute_offers` | Silencia ofertas | ✅ |
| 13 | `ask_review_rating` | Card de avaliação por estrelas | ✅ |
| 14 | `request_review` | Roteia avaliação (pública vs interna) | ✅ |
| 15 | `register_rebooking_interest` | Capta interesse de retorno | ✅ (lead estruturado) |
| 16 | `escalate_to_human` | Passa a conversa para um atendente | ✅ (fila `needs_human` no painel) |

**Experiência do chat (web):** conversa em linguagem natural com streaming (SSE), **cards ricos** (chave, extrato, ofertas, OS, avaliação), **anexo de foto** (OCR de documento e triagem de problema), indicador de digitação, e estado "atendimento humano" quando escala.

### A.2 Painel da equipe (`/admin`)

Endpoints em `apps/api/src/routes/admin.ts` (protegidos por `x-admin-key`):

- **Dashboard/métricas** (`/metrics`): resolução sem humano, conversas aguardando humano, pedidos, OS, conversão de upsell, desempenho por oferta.
- **Conversas** e detalhe (`/conversations`, `/conversations/:id`).
- **Pedidos**: aprovar / cancelar (`/orders/:id/approve|cancel`).
- **Ordens de serviço**: resolver (`/service-orders/:id/resolve`) — exibe `visualNote` da triagem por foto.
- **Reservas**: listar + transições guardadas (chegada/check-out/cancelar), com atribuição de quarto na chegada.
- **Ofertas**: CRUD completo por resort.
- **Base de conhecimento**: sync (`/resorts/:id/knowledge/sync`).
- **Kill switch financeiro** por resort.

### A.3 Núcleo do agente

- **Loop agêntico próprio** sobre a Anthropic API com tool use nativo (modelo `claude-sonnet-4-6`) — **real** quando `ANTHROPIC_API_KEY` está presente.
- **Guardrails em três camadas** (ADR-009): validação Zod na entrada, guardrail determinístico por tool, e regras invioláveis no prompt.
- **Auditoria completa** (`agent_actions`): toda chamada de tool, inclusive bloqueios de guardrail.
- **Prompt caching** (persona + base de conhecimento em blocos cacheados).
- **Multimodal**: imagem chega ao modelo para OCR e triagem; **nunca persistida**.

### A.4 Integrações e costuras (Adapters)

Padrão comum: interface trocável por configuração, sem tocar no core.

| Costura | Estado | Detalhe |
|---|---|---|
| **Channel Adapter** | Web ✅ real · WhatsApp ✅ implementado, **desligado** | WhatsApp liga com 4 variáveis de env (conta Meta) |
| **Lock Adapter** | **Mock** | PIN de demonstração; Salto/AssaAbloy/IFC8 plugam por `lockProvider` |
| **PMS Adapter** | Seed ✅ · **OperaAdapter esqueleto** | `getReservation`/`getFolio`/`addMaintenance`; OPERA (OWS) lança "não configurado" até haver credenciais |

### A.5 Dados e multi-tenant

- **PostgreSQL 16 + Prisma**, migrations versionadas desde o início.
- Modelos: `Resort`, `Guest`, `Reservation`, `Companion`, `CheckinForm`, `RoomKey`, `Conversation`, `Message`, `ServiceOrder`, `Order`, `Offer`, `AgentAction`.
- **Multi-tenant por `resort_id`** (row-level scoping, ADR-008).

### A.6 Qualidade

- **130 testes** (21 arquivos): unitários com repos fake + **integração com Postgres real**.
- Typecheck (`tsc --noEmit`) e lint limpos em toda a workspace.

---

## Parte B — O que falta para um ambiente real de testes

O termo "ambiente real de testes" cobre dois níveis. Separá-los é o que torna o piloto **viável em etapas**:

- **Piloto interno** — a equipe da Aviva testa em staging, **sem hóspede real e sem PMS** (dados fictícios). Depende só de nós (infra + hardening).
- **Piloto com hóspede real** — hóspedes de verdade num canal real, com dados do PMS. Depende de **terceiros** (OPERA, Meta, fechadura) e de **LGPD**.

### B.1 Infraestrutura e operação — *é nosso, e falta*

| Item | Situação hoje | Necessário para piloto |
|---|---|---|
| **Empacotamento** | Sem `Dockerfile` | Imagens de container (API + web) |
| **CI/CD** | Sem `.github/workflows` | Pipeline: testes → build → deploy |
| **Hospedagem** | Só local | Ambiente de staging (API, web, Postgres) |
| **Banco** | Postgres local (docker-compose, porta 5433) | **Postgres gerenciado** + `migrate deploy` + **backup/restore** |
| **Segredos** | `.env` local | **Secrets manager** (não em arquivo) |
| **Observabilidade** | `console` + `/health` básico | Logs estruturados agregados, métricas de runtime, **alertas**, tracing |

### B.2 Segurança e hardening — *é nosso, e falta*

| Item | Situação hoje | Ação |
|---|---|---|
| **🔴 Chave Anthropic exposta** | Vazou em screenshot | **Revogar/rotacionar** no console.anthropic.com — crítico |
| **CORS** | Permissivo (`*`) para o SSE | Restringir às origens conhecidas |
| **Rate limiting** | Ausente | `@fastify/rate-limit` nos endpoints e no webhook |
| **Headers de segurança** | Sem helmet | `@fastify/helmet` |
| **Auth do painel** | Chave única `x-admin-key` (dev) | Usuários/papéis reais (ou, no mínimo, chave forte por resort + rotação) |
| **Token do hóspede** | Opaco, **sem expiração** (ADR-011) | Definir TTL, revogação e rotação |
| **Webhook WhatsApp** | Assinatura `X-Hub-Signature-256` já validada | ✅ manter |
| **Segredos no git** | `.env` no `.gitignore` | ✅ manter; `.env.example` só com placeholders |

### B.3 Integrações externas — *depende de terceiros*

| Integração | Bloqueado por | Referência |
|---|---|---|
| **PMS Oracle OPERA** | Credenciais OWS + ambiente UAT da Aviva | `docs/INTEGRACAO_OPERA.md` |
| **WhatsApp** | Conta Meta aprovada + número + templates | Adapter pronto; liga por env |
| **Chave digital real** | Fornecedor de fechadura + suporte a mobile key | Lock Adapter pronto (mock) |

### B.4 Conformidade (LGPD) — *para hóspede real*

- **Consentimento (opt-in)** explícito, especialmente no WhatsApp.
- **DPA** com a Aviva, **base legal** e **política de retenção** definidas.
- **Dados de menores**: flag já existe; falta a política de tratamento.
- **Direito do titular**: endpoint de anonimização já existe; falta o **processo** de atendimento.

### B.5 Produto e conteúdo — *pendências próprias*

- **Painel single-resort**: hoje o painel assume `resorts[0]`; multipropriedade real precisa de seleção de resort (e o nível "Grupo" acima).
- **Tela launcher** (Ana/Bruno/Carla): andaime — remover ou rotular como demo no ambiente real.
- **Camada de disparo proativo**: agendador de mensagens (quarto pronto, pré-chegada, avaliação) — depende do canal de saída + eventos do PMS.
- **Conteúdo real**: base de conhecimento com dados reais da Aviva (hoje exemplo) e dados de teste fictícios no PMS UAT.

### B.6 Testes — *reforço*

- Já temos: unit + integração com Postgres real (130 casos).
- Falta para piloto: **e2e da UI** (fluxo do hóspede ponta a ponta), **teste do webhook WhatsApp** em ambiente real, e um **teste de carga** leve.

---

## Roteiro sugerido (menor risco primeiro)

| Etapa | Entrega | Depende de |
|---|---|---|
| **1. Segurança imediata** | Rotacionar chave Anthropic; CORS restrito; rate-limit; helmet | Só de nós |
| **2. Staging interno** | Dockerfile + CI + deploy + Postgres gerenciado + logs | Só de nós |
| **3. Piloto interno** | Equipe testa com dados fictícios (sem PMS, sem hóspede) | Etapas 1–2 |
| **4. Integração PMS (UAT)** | `OperaAdapter` real (leitura) contra ambiente de teste | Credenciais OWS (Aviva) |
| **5. Canal WhatsApp** | Ligar o adapter + templates aprovados | Conta Meta |
| **6. LGPD + piloto real** | Consentimento, DPA, retenção → hóspedes reais | Etapas 4–5 + jurídico |

---

## Checklist de prontidão (Go / No-Go do piloto interno)

- [ ] 🔴 Chave Anthropic **rotacionada**
- [ ] CORS restrito às origens conhecidas
- [ ] Rate limiting e helmet ativos
- [ ] Dockerfile + pipeline de CI/CD
- [ ] Ambiente de staging no ar (API + web + Postgres gerenciado)
- [ ] Segredos fora de arquivo (secrets manager)
- [ ] Logs estruturados + alerta mínimo
- [ ] Auth do painel endurecida (chave forte + rotação)
- [ ] Base de conhecimento com conteúdo real da Aviva
- [ ] Tela launcher removida/rotulada como demo

> **Resumo executivo.** O produto está **funcional de ponta a ponta em modo demonstração**: o hóspede percorre pré-check-in → estadia → check-out → pós-estadia, e a equipe opera pelo painel — tudo com 130 testes cobrindo o núcleo. O que separa isso de um **piloto interno** é **infraestrutura e hardening que dependem só de nós** (etapas 1–3). O que separa de um **piloto com hóspede real** são **integrações de terceiros** (OPERA, Meta, fechadura) e **LGPD** — nenhuma delas exige redesenho, todas plugam nas costuras já prontas.
