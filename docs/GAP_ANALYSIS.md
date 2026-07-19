# Gap Analysis — Agente Concierge × Proposta de Automação

**Referência:** anexo à proposta "Resort Operating System — Automação da Experiência do Hóspede" (Diretoria de Tecnologia, jul/2026, v1.0).
**Escopo do MVP:** Onda 1 completa + antecipações das Ondas 2, 3 e 4 que não dependem de integração externa.
**Última atualização:** 19/07/2026 — após check-in conversacional (FNRH + OCR + ViaCEP + multi-hóspede), inspirado na análise competitiva do webcheckin da Aviva.

## 1. Casos de uso da matriz de priorização (seção 4 da proposta)

| # | Caso de uso (onda) | Status | Implementação |
|---|---|---|---|
| 1 | FAQ e dúvidas pré-estadia (Onda 1) | ✅ Completo | Base de conhecimento por resort (`data/knowledge/`) + regra anti-alucinação no prompt: fatos vêm só da base ou das tools. |
| 2 | Check-in digital antecipado (Onda 1) | ✅ Completo (no escopo do agente) | Check-in **conversacional**: FNRH coletada em passos curtos com persistência incremental (pausa/retoma), **OCR de documento por foto** (imagem nunca armazenada — LGPD), CPF validado por dígito verificador, CEP → endereço via ViaCEP, **acompanhantes por reserva** (multi-hóspede, flag de menor) e reaproveitamento de dados de estadias anteriores. **Falta (dependência externa):** sincronização com PMS, assinatura digital e fechadura (seção 3). |
| 3 | Pedidos e serviços na estadia (Onda 1) | ✅ Completo | `create_order` (itens do catálogo com preço resolvido no banco + cortesias R$0) e `create_service_order`. Limite financeiro → `pending_approval` no painel. |
| 4 | Gestão automática de reclamações — OS + SLA (Onda 2) | ✅ Completo | OS automática com prioridade por severidade (palavras-chave) **e por perfil** (membro do clube de férias → prioridade mínima `high`), SLA por prioridade configurável por resort, **follow-up automático de satisfação** ao resolver e **gesto de cortesia** (pedido R$0 confirmado) em ocorrências graves. |
| 5 | Upsell contextual proativo (Onda 3) | ✅ Completo | `suggest_offers` cruza perfil × momento da estadia × tags das ofertas; anti-spam determinístico (1 sugestão proativa/dia); **opt-out do hóspede** via `mute_offers`. |
| 6 | Venda antecipada pré-chegada (Onda 3) | ⚠️ Parcial | `suggest_offers` cobre o momento pré-estadia e o **fecho do check-in digital dispara upsell automaticamente** (transfer, jantar, upgrade — momento de maior conversão). **Falta:** gatilho temporal proativo (mensagem X dias antes da chegada) — depende do canal de saída ativo (WhatsApp, seção 3). |
| 7 | Roteamento inteligente de avaliações (Onda 3) | ✅ Completo | `request_review`: nota ≥ threshold → link público (Google); nota < threshold → canal interno (`needs_human`), protegendo a nota pública. Decisão determinística, registrada no perfil e na auditoria. |
| 8 | Rebooking personalizado e fidelização (Onda 4) | ⚠️ Parcial (MVP) | `register_rebooking_interest`: capta interesse de retorno no pós-estadia (período, ocasião, nº de pessoas) como dado estruturado no perfil — lead de canal direto, sem comissão de OTA. **Falta:** motor de ofertas de rebooking por data/perfil e programa de fidelização — requer histórico acumulado (a própria proposta os posiciona na Onda 4). |

## 2. Salvaguardas de experiência e conformidade (seção 6 da proposta)

| Salvaguarda | Status | Implementação |
|---|---|---|
| Escape humano garantido | ✅ | `escalate_to_human` por frustração, pedido explícito ou fora de escopo; heurísticas determinísticas + decisão do modelo; fila `needs_human` no topo do painel. |
| Anti-spam de ofertas | ✅ | Limite de 1 sugestão proativa/dia (guardrail em código, não em prompt) + **opt-out** persistente no perfil (`mute_offers`), respeitado por guardrail. `list_offers` continua disponível se o hóspede pedir. |
| LGPD e governança de IA | ✅ (no escopo web) | `consent_at` no cadastro, endpoint de anonimização (`DELETE /guests/:id` — remove PII, mensagens e auditoria), trilha completa em `agent_actions` (toda chamada de tool, inclusive bloqueios). Consentimento específico de WhatsApp e tratamento de dados de menores entram com o canal WhatsApp. |
| Controle de ações financeiras | ✅ | Preço nunca vem do modelo (resolvido no banco); acima do limite → aprovação humana; **kill switch por resort** acionável no Dashboard — suspende todo pedido do agente imediatamente, com escalação automática para humano. |

## 3. Gaps remanescentes — todos bloqueados por dependência externa

| Gap | Dependência externa | Encaixe já preparado na arquitetura |
|---|---|---|
| Check-in documental completo (documentos, FNRH, assinatura, fechadura) | Contrato/API do PMS do resort + provedor de assinatura + fechaduras | Tool `start_early_checkin` isola o fluxo; status `checked_in_digital` já existe no domínio. |
| Canal WhatsApp | WhatsApp Business API (conta Meta aprovada) + templates aprovados | Padrão Channel Adapter (ADR-004): `WhatsAppAdapter` implementa a mesma interface do `WebChatAdapter`; o core do agente não muda. |
| Mensagens proativas de saída (venda pré-chegada, programação infantil da manhã) | Canal de saída ativo (WhatsApp) — webchat não alcança hóspede ausente | O motor de sugestão (`suggest_offers`) e o anti-spam já existem; falta só o disparo agendado pelo canal. |
| Manutenção preditiva / menos quarto parado | Camada IoT do Resort OS (fora do escopo do Agente Concierge) | OS estruturada com categoria/prioridade/SLA já alimenta essa camada futura. |

## 4. Indicadores de sucesso (seção 5 da proposta)

O painel já calcula em tempo real: taxa de resolução sem humano, conversas aguardando humano, pedidos criados/pendentes, OS abertas/resolvidas e conversão de upsell. Receita ancilar por hóspede, % check-ins digitais, nota Google/Booking, % canal direto e NPS dependem de dados externos (PMS, OTAs, pesquisa) e entram com as respectivas integrações.

## 5. Síntese

Dos 8 casos de uso da matriz, **6 estão completos e 2 parciais** — e as 4 salvaguardas de experiência/conformidade estão implementadas como **regras determinísticas em código** (guardrails), não como instruções de prompt. Nenhum gap remanescente exige redesenho: todos são bloqueados por acesso a sistemas de terceiros e entram nos pontos de extensão já existentes (tools plugáveis e Channel Adapter).
