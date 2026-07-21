# Gap Analysis — Agente Concierge × Proposta de Automação

**Referência:** anexo à proposta "Resort Operating System — Automação da Experiência do Hóspede" (Diretoria de Tecnologia, jul/2026, v1.0).
**Escopo do MVP:** Onda 1 completa + antecipações das Ondas 2, 3 e 4 que não dependem de integração externa.
**Última atualização:** 21/07/2026 — identificação do PMS real (**Oracle OPERA 5**, Costa do Sauípe/Aviva) e estruturação do seam `PmsAdapter` (OWS/IFC8/Business Events). Inclui também a **chave digital** (`LockAdapter`) e a **triagem por foto** (OS multimodal), agora ligadas à costura do PMS.

## 1. Casos de uso da matriz de priorização (seção 4 da proposta)

| # | Caso de uso (onda) | Status | Implementação |
|---|---|---|---|
| 1 | FAQ e dúvidas pré-estadia (Onda 1) | ✅ Completo | Base de conhecimento por resort (`data/knowledge/`) + regra anti-alucinação no prompt: fatos vêm só da base ou das tools. |
| 2 | Check-in digital antecipado (Onda 1) | ✅ Completo (no escopo do agente) | Check-in **conversacional**: FNRH coletada em passos curtos com persistência incremental (pausa/retoma), **OCR de documento por foto** (imagem nunca armazenada — LGPD), CPF validado por dígito verificador, CEP → endereço via ViaCEP, **acompanhantes por reserva** (multi-hóspede, flag de menor) e reaproveitamento de dados de estadias anteriores. **Fechadura:** chave digital via `get_room_key` (seam `LockAdapter`; mock hoje, IFC8/vendor real depois). **Sync PMS:** seam `PmsAdapter` (`getReservation`/`getFolio`) estruturado. **Falta:** assinatura digital e a conexão OWS real do OPERA. |
| 3 | Pedidos e serviços na estadia (Onda 1) | ✅ Completo | `create_order` (itens do catálogo com preço resolvido no banco + cortesias R$0) e `create_service_order`. Limite financeiro → `pending_approval` no painel. |
| 4 | Gestão automática de reclamações — OS + SLA (Onda 2) | ✅ Completo | OS automática com prioridade por severidade (palavras-chave) **e por perfil** (membro do clube de férias → prioridade mínima `high`), SLA por prioridade configurável por resort, **follow-up automático de satisfação** ao resolver e **gesto de cortesia** (pedido R$0 confirmado) em ocorrências graves. **Triagem por foto** (multimodal): a OS lê a imagem do problema, descreve em `visualNote` (imagem não armazenada) e, com quarto atribuído, abre chamado na **Governança do OPERA** via `addMaintenance`. |
| 5 | Upsell contextual proativo (Onda 3) | ✅ Completo | `suggest_offers` cruza perfil × momento da estadia × tags das ofertas; anti-spam determinístico (1 sugestão proativa/dia); **opt-out do hóspede** via `mute_offers`. |
| 6 | Venda antecipada pré-chegada (Onda 3) | ⚠️ Parcial | `suggest_offers` cobre o momento pré-estadia e o **fecho do check-in digital dispara upsell automaticamente** (transfer, jantar, upgrade — momento de maior conversão). **Falta:** gatilho temporal proativo (mensagem X dias antes da chegada) — depende do canal de saída ativo (WhatsApp, seção 3). |
| 7 | Roteamento inteligente de avaliações (Onda 3) | ✅ Completo | `request_review`: nota ≥ threshold → link público (Google); nota < threshold → canal interno (`needs_human`), protegendo a nota pública. Decisão determinística, registrada no perfil e na auditoria. |
| 8 | Rebooking personalizado e fidelização (Onda 4) | ⚠️ Parcial (MVP) | `register_rebooking_interest`: capta interesse de retorno no pós-estadia (período, ocasião, nº de pessoas) como dado estruturado no perfil — lead de canal direto, sem comissão de OTA. **Falta:** motor de ofertas de rebooking por data/perfil e programa de fidelização — requer histórico acumulado (a própria proposta os posiciona na Onda 4). |

## 2. Jornada do hóspede ponta a ponta (pré-checkin → checkout → pós-checkout)

A matriz acima é organizada por caso de uso; esta seção olha a mesma implementação pela ótica **da jornada contínua**, incluindo as transições de estado que costuram uma fase na outra.

**Ciclo de vida da reserva (máquina de estados guardada):**

```
confirmed ─┬─▶ checked_in_digital ─▶ checked_in ─▶ checked_out
           └──────────────────────▶ checked_in
   (confirmed | checked_in_digital) ─▶ cancelled
```

Transições ilegais são rejeitadas no repositório (`canTransition`), ponto único de verdade usado pelas tools e pelo painel.

| Fase | Estado | Cobertura | O que existe |
|---|---|---|---|
| Pré-estadia | `confirmed` | ✅ Completo | FAQ, `get_reservation`, `suggest_offers` pré-chegada, check-in conversacional (FNRH + OCR + ViaCEP + multi-hóspede + taxas com contexto), fecho do check-in dispara upsell. |
| **Chegada** | `→ checked_in` | ✅ Completo (operável) | Ação **Marcar chegada** na página Reservas do painel (`checked_in_digital`/`confirmed` → `checked_in`); a **atribuição de quarto** habilita a chave digital. Substituível por gatilho de **Business Event do OPERA** depois, sem mudar o domínio. |
| Durante a estadia | `checked_in` | ✅ Completo | `create_order`, `create_service_order` (prioridade+SLA+follow-up+cortesia+triagem por foto), `suggest_offers`, `get_daily_schedule`, `list_offers`, **`get_room_key`** (chave digital, seam `LockAdapter`), **`get_room_bill`** (extrato a qualquer momento, agora via `PmsAdapter.getFolio`), escalonamento. |
| **Check-out** | `→ checked_out` | ✅ Completo (no escopo do agente) | **`request_checkout`**: check-out expresso pelo chat com extrato final; pendência de aprovação bloqueia; transiciona `checked_out` e encadeia a avaliação. Também acionável no painel. **Pagamento/fechamento de fatura** permanece na recepção/PMS por definição. |
| Pós-estadia | `checked_out` | ✅ Completo (agora alcançável) | `ask_review_rating` (card de estrelas) + `request_review` (roteamento público/interno) + `register_rebooking_interest`. |
| Cancelamento | `→ cancelled` | ✅ Completo (operável) | Ação **Cancelar** no painel a partir dos estados ativos. Política de cancelamento vive na base de conhecimento. |

**Extrato da conta (`computeRoomBill`):** consolida os pedidos da reserva — confirmados/entregues = cobrado; pendentes de aprovação à parte; cancelados ignorados. Renderizado como card no web e como texto no WhatsApp. Fecha a lacuna de confiança em que o consumo acumulava invisível ao hóspede.

> A jornada deixou de ser "ferramentas soltas por fase": as transições `checked_in` e `checked_out` que faltavam agora existem, então um hóspede real percorre o ciclo inteiro sem travar no check-in digital.

## 3. Integração com o PMS real — Oracle OPERA (seam `PmsAdapter`)

O PMS da operação (Costa do Sauípe/Aviva) é o **Oracle OPERA 5** (v5.5, on-premise, Oracle Forms). Isso confirma a hierarquia **Grupo → Propriedade → Unidade** (Costa do Sauípe → propriedades → "Ala Brisa"; menu *Multipropriedade*) e define a superfície de integração real.

O agente lê e escreve por uma **única interface — `PmsAdapter`** — trocável por `resort.settings.pmsProvider`. O core não muda ao trocar a fonte (mesmo padrão do `ChannelAdapter` e do `LockAdapter`).

| Tela / módulo OPERA | Método `PmsAdapter` | Estado |
|---|---|---|
| Busca de Reserva (No.Conf, status, apto, Adultos/Crianças) | `getReservation` | ✅ seam + `SeedPmsAdapter` |
| Caixa/Contas (Saldo, Receita) | `getFolio` | ✅ **ligado ao `get_room_bill`** — o extrato já flui pela costura |
| Governança → Manutenção | `addMaintenance` | ✅ **ligado à triagem por foto** — OS com `visualNote` abre o chamado |
| Cadastro + painel "Futuro" + Passport No. | `getProfile` | 📄 próxima costura (recorrente + FNRH estrangeiro) |
| Pesquisa de Tarifa + Mapa de Aptos | `searchAvailability` | 📄 próxima costura (disponibilidade/preço reais p/ upsell e rebooking) |

**Fontes de integração do OPERA 5** (documentadas no `OperaAdapter`, ainda não conectadas):
- **OWS** (OPERA Web Services, SOAP) — leitura/escrita de reserva, folio, perfil, disponibilidade. API principal do OPERA 5.
- **Business Events / OXI** — o OPERA publica *check-in* e *mudança de status de quarto* (Governança/housekeeping). **É a fonte nativa dos gatilhos da camada proativa** — "seu quarto está pronto" não dependia do WhatsApp, e sim do PMS.
- **IFC8 / FIAS** — camada de dispositivos; é por onde a chave da fechadura é encodada, **conectando o `LockAdapter` ao `PmsAdapter`**. Migração futura para OPERA Cloud troca OWS por OHIP (REST) na mesma interface.

**Estado da conexão:** `pmsProvider="seed"` (padrão) lê o nosso banco — demonstração idêntica ao comportamento atual. O `OperaAdapter` é um esqueleto honesto: cada método lança `PmsNotConfiguredError` até as credenciais OWS existirem. Conectar = trocar os `throw` por chamadas reais; o agente não muda.

## 4. Salvaguardas de experiência e conformidade (seção 6 da proposta)

| Salvaguarda | Status | Implementação |
|---|---|---|
| Escape humano garantido | ✅ | `escalate_to_human` por frustração, pedido explícito ou fora de escopo; heurísticas determinísticas + decisão do modelo; fila `needs_human` no topo do painel. |
| Anti-spam de ofertas | ✅ | Limite de 1 sugestão proativa/dia (guardrail em código, não em prompt) + **opt-out** persistente no perfil (`mute_offers`), respeitado por guardrail. `list_offers` continua disponível se o hóspede pedir. |
| LGPD e governança de IA | ✅ (no escopo web) | `consent_at` no cadastro, endpoint de anonimização (`DELETE /guests/:id` — remove PII, mensagens e auditoria), trilha completa em `agent_actions` (toda chamada de tool, inclusive bloqueios). Consentimento específico de WhatsApp e tratamento de dados de menores entram com o canal WhatsApp. |
| Controle de ações financeiras | ✅ | Preço nunca vem do modelo (resolvido no banco); acima do limite → aprovação humana; **kill switch por resort** acionável no Dashboard — suspende todo pedido do agente imediatamente, com escalação automática para humano. |

## 5. Gaps remanescentes — dependências externas e decisões de produto

| Gap | Dependência externa | Encaixe já preparado na arquitetura |
|---|---|---|
| Conexão OWS real do OPERA + assinatura digital | Credenciais OWS da Aviva + provedor de assinatura | Seam `PmsAdapter` estruturado (reserva/folio/manutenção pelo seed; `OperaAdapter` esqueleto). FNRH já coletada por `update_checkin_form`/`complete_early_checkin`. Falta trocar os `throw` do `OperaAdapter` por chamadas OWS e assinar. |
| Canal WhatsApp | WhatsApp Business API (conta Meta aprovada) + templates aprovados | Padrão Channel Adapter (ADR-004): `WhatsAppAdapter` já implementado, mesma interface do `WebChatAdapter`; ligado por credenciais no `.env`. O core do agente não muda. |
| **Camada de disparo proativo** (venda pré-chegada, agenda matinal, lembrete de check-out, timing da avaliação) | Canal de saída ativo (WhatsApp) para **entregar** — a **fonte dos gatilhos** já está identificada nos **Business Events do OPERA** (check-in, quarto pronto) | Todos os **eventos** da jornada já existem (transições de estado, `suggest_offers`, `get_daily_schedule`, anti-spam) e o PMS emite os de operação. Falta a orquestração/agendamento que decide *quando* disparar + o canal de saída. Próximo multiplicador natural. |
| Fechamento de fatura / pagamento no check-out | PMS / gateway de pagamento | `request_checkout` e `get_room_bill` já entregam o extrato (folio via `PmsAdapter.getFolio`); o acerto financeiro é da recepção/PMS por definição de escopo. |
| Hierarquia grupo → propriedade + cross-sell entre unidades | — (decisão de produto) | **Confirmada real pelo OPERA** (Costa do Sauípe → propriedades → Ala Brisa). Multi-tenant por `resort_id` já isola unidades; falta o nível `Grupo` acima e a oferta cruzada. |
| Manutenção preditiva / menos quarto parado | Camada IoT do Resort OS (fora do escopo do Agente Concierge) | OS estruturada (categoria/prioridade/SLA) + `addMaintenance` (Governança do OPERA) já alimentam essa camada futura. |

## 6. Indicadores de sucesso (seção 5 da proposta)

O painel já calcula em tempo real: taxa de resolução sem humano, conversas aguardando humano, pedidos criados/pendentes, OS abertas/resolvidas, conversão de upsell **e desempenho por oferta (sugerida/aceita)**. Receita ancilar por hóspede, % check-ins digitais, nota Google/Booking, % canal direto e NPS dependem de dados externos (PMS, OTAs, pesquisa) e entram com as respectivas integrações.

## 7. Síntese

Dos 8 casos de uso da matriz, **6 estão completos e 2 parciais**, e a **jornada agora é contínua de ponta a ponta** — as transições de estado que faltavam (chegada, check-out, cancelamento) foram fechadas, então um hóspede real percorre pré-checkin → estadia → checkout → pós-checkout sem travar. As 4 salvaguardas de experiência/conformidade são **regras determinísticas em código** (guardrails), não instruções de prompt.

Com a identificação do PMS real (Oracle OPERA 5) e a estruturação do seam `PmsAdapter`, o principal gap de integração deixou de ser uma incógnita: reserva, folio e manutenção já fluem por uma interface trocável, com o `OperaAdapter` mapeado (OWS/IFC8/Business Events) e aguardando só as credenciais. Nenhum gap remanescente exige redesenho: são acesso a sistemas de terceiros (OPERA, WhatsApp, IoT) ou decisão de produto, e todos entram nos pontos de extensão já existentes (tools plugáveis, Channel Adapter, Lock Adapter, PMS Adapter, máquina de estados). O próximo multiplicador natural é a **camada de disparo proativo** — e a descoberta central desta rodada é que a **fonte dos gatilhos já existe nos Business Events do OPERA**: falta apenas o canal de saída para entregá-los.
