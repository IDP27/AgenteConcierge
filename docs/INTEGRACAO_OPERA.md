# Integração Agente Concierge × Oracle OPERA — Especificação Técnica

**Destinatário:** Time de TI / Sistemas — Costa do Sauípe (Aviva)
**Autor:** Time do Agente Concierge
**Versão:** 1.0 · 21/07/2026
**Ambiente de referência:** Oracle Hospitality OPERA PMS 5.5.0.25 (on-premise, Oracle Forms) · propriedade `BRISA` (Ala Brisa)

> **Propósito deste documento.** Descrever, de forma verificável, *como* o Agente Concierge se conecta ao OPERA, *o que* consome de cada módulo e *o que precisamos da TI da Aviva* para conectar. É um documento para **validação técnica prévia** — nada aqui exige credenciais de produção para ser avaliado. Nomes de operações OWS estão marcados como **(a confirmar)** quando dependem da WSDL efetivamente licenciada no ambiente de vocês; preferimos sinalizar a incerteza a afirmar o que não verificamos.

---

## 1. Objetivo e escopo

O Agente Concierge já opera a jornada completa do hóspede (pré-check-in → estadia → check-out → pós-estadia) lendo hoje de um banco próprio semeado. Esta integração substitui essa fonte pelo **OPERA como sistema de verdade**, sem reescrever o agente.

**No escopo desta integração:**
- Leitura de **reserva**, **conta/folio** e **perfil** do hóspede.
- Escrita de **chamado de manutenção** (a partir da triagem por foto).
- Recepção de **eventos operacionais** (check-in, quarto pronto) para a camada proativa.
- Costura para a **chave digital** via a camada de dispositivos (IFC8).

**Fora do escopo (permanecem no OPERA/recepção):** fechamento de fatura e pagamento, night audit, gestão tarifária, alocação física de inventário.

---

## 2. Princípio de integração — o seam `PmsAdapter`

O agente conversa com o PMS por **uma única interface** (`PmsAdapter`). A implementação é trocável por configuração (`resort.settings.pmsProvider`), sem tocar no núcleo do agente. É o mesmo padrão que já usamos para canal (WhatsApp/web) e fechadura.

```
Agente (tools)  ─▶  PmsAdapter (interface)  ─┬─▶  SeedPmsAdapter   (dev/demo: lê nosso banco)
                                             └─▶  OperaAdapter     (produção: OWS/OXI/IFC8)
```

Consequência prática para a TI: **do lado do agente, conectar o OPERA é implementar um adapter e apontar uma configuração.** O comportamento do produto não muda; muda a origem do dado. Isso permite ligar módulo a módulo, com rollback trivial (voltar para `seed`).

---

## 3. Superfícies de integração do OPERA 5

O OPERA 5 on-premise expõe três superfícies; usamos as três, cada uma para um propósito.

| Superfície | O que é | Uso nesta integração |
|---|---|---|
| **OWS** (OPERA Web Services) | Web services SOAP/XML — a API programática do OPERA 5 | Leitura/escrita síncrona: reserva, folio, perfil, disponibilidade, manutenção |
| **Business Events / OXI** | Publicação assíncrona de eventos de negócio do OPERA | Gatilhos da camada proativa (check-in, mudança de status de quarto) |
| **IFC8 / FIAS** | Camada de interface de dispositivos (fechadura, PABX, POS) | Encoding da chave digital do quarto |

> Migração futura para **OPERA Cloud** troca OWS por **OHIP** (REST) — a interface `PmsAdapter` permanece a mesma; só o adapter muda.

---

## 4. Mapeamento método × operação OWS

Cada método do `PmsAdapter` corresponde a uma operação OWS e a um conjunto de campos. As operações abaixo são as **candidatas esperadas**; o nome e o serviço exatos serão confirmados contra as WSDLs licenciadas no ambiente de UAT.

### 4.1 `getReservation` — leitura de reserva

- **Serviço OWS esperado:** `ReservationService` → `FetchBookingRequest` (a confirmar), busca por número de confirmação (No.Conf) ou nome+chegada.
- **Tela OPERA de referência:** Reservas → Busca de Reserva.

| Campo OPERA | Campo no agente (`PmsReservation`) |
|---|---|
| No.Conf | `confirmationNumber` |
| Status da reserva | `status` |
| Apto | `roomNumber` (null antes da atribuição) |
| Chegada / Saída | `checkIn` / `checkOut` |
| Plano / pacote | `plan` |
| Adultos · Crianças (0-5, 6-12) | `adults` · `children` |

### 4.2 `getFolio` — extrato/conta do quarto

- **Serviço OWS esperado:** `GuestServicesService`/`CashieringService` → operação de leitura de folio/lançamentos (a confirmar; em algumas versões `FetchFolio`/`FetchGuestFolio`).
- **Tela OPERA de referência:** Caixa → Contas; Busca Hóspedes (coluna **Saldo**).
- **Já ligado no agente:** a tool `get_room_bill` lê o extrato por este método. Hoje soma nossos pedidos; em produção soma os **postings do folio**, no mesmo formato de card que o hóspede já vê.

| Campo OPERA | Campo no agente (`RoomBill`) |
|---|---|
| Lançamentos (postings) por janela | `lines[]` (título, qtd, total) |
| Total lançado / Saldo | `chargedCents` |
| Pendências não confirmadas | `pendingCents` / `hasPending` |

### 4.3 `addMaintenance` — abertura de chamado de manutenção

- **Caminho esperado:** registro em **Governança → Manutenção** (room maintenance / out-of-order) **ou** trace na reserva. A exposição via OWS varia; se não houver operação OWS direta, o caminho é **OXI** (mensagem de manutenção/trace). **A confirmar com a TI** qual via está disponível.
- **Tela OPERA de referência:** Governança → Manutenção (ex.: apto marcado com motivo textual).
- **Já ligado no agente:** quando o hóspede envia **foto** de um problema e há quarto atribuído, a `create_service_order` descreve a imagem em `visualNote` e chama `addMaintenance`. Fecha o círculo *foto do hóspede → chamado no sistema que a equipe já opera*.

| Dado do agente | Campo OPERA |
|---|---|
| `roomNumber` | Apto |
| `[categoria] visualNote` | Descrição/Motivo do chamado |
| `reportedByGuest = true` | Origem (hóspede via concierge) |

### 4.4 `getProfile` — perfil + histórico *(fase 2)*

- **Serviço OWS esperado:** `NamesService`/`ProfileService` → `FetchProfileRequest` (a confirmar).
- **Tela OPERA de referência:** Cadastro / Busca Cadastro + painel **"Futuro"** + **Passport No.**
- **Valor:** reconhecimento de **hóspede recorrente** (histórico e próximas estadias) e suporte a **FNRH de estrangeiro** (passaporte).

| Campo OPERA | Campo no agente (`PmsProfile`) |
|---|---|
| Passport No. / documento | `documentType` · `document` |
| Nacionalidade | `nationality` |
| Histórico de estadias | `isReturning` |
| Painel "Futuro" | `futureStays[]` |

### 4.5 `searchAvailability` — disponibilidade e tarifa *(fase 2)*

- **Serviço OWS esperado:** `AvailabilityService` → consulta de disponibilidade/tarifa (a confirmar).
- **Tela OPERA de referência:** Pesquisa de Tarifa + Mapa de Aptos.
- **Valor:** upsell e rebooking com **preço e disponibilidade reais** (hoje o agente usa catálogo estático). Respeita os baldes de idade (0-5 / 6-12) para preço de criança.

---

## 5. Camada proativa via Business Events

A mensagem proativa ("seu quarto está pronto", "boas-vindas no check-in", lembrete de check-out) depende de **saber quando** o evento acontece. Esses eventos já existem nativamente no OPERA — precisamos que sejam **publicados para o Agente Concierge como sistema externo**.

**Eventos de interesse (por propriedade):**

| Evento OPERA | Uso no agente |
|---|---|
| Reserva criada/alterada | Sincronizar dados de pré-chegada |
| Check-in | Boas-vindas + liberar chave digital |
| Mudança de status de quarto (Governança) | "Seu quarto está pronto" |
| Room move / troca de quarto | Reprovisionar chave, atualizar contexto |
| Check-out | Encadear extrato + avaliação |

**Mecanismo de entrega — a definir com a TI:**
- (a) **Webhook**: OPERA/OXI publica em um endpoint HTTPS que expomos (com segredo compartilhado), ou
- (b) **Fila**: eventos numa fila/tópico que consumimos por *pull*.

Preferimos (a) por simplicidade operacional, mas seguimos o que for mais aderente à topologia de vocês.

---

## 6. Chave digital via IFC8

O agente já emite/revoga chave por um seam próprio (`LockAdapter`). Em ambiente OPERA, a chave física **não** é emitida por nós diretamente: o encoding trafega pela **camada IFC8/FIAS**, coordenada entre o OPERA e o **fornecedor da fechadura**.

**O que precisamos saber:**
1. Qual o **fornecedor de fechadura** instalado (ex.: Salto, Assa Abloy/VingCard, Onity)?
2. As fechaduras suportam **chave móvel (mobile key / BLE)** ou só cartão?
3. O provisionamento de chave móvel é exposto por **API do fornecedor** e/ou orquestrado pelo **OPERA via IFC8**?

Enquanto isso, o agente opera com `lockProvider="mock"` (PIN de demonstração, **não abre porta física**) — o fluxo ponta a ponta funciona para piloto sem depender do hardware.

---

## 7. Segurança, rede e autenticação

- **Rede:** o OPERA 5 é interno. Precisamos de um caminho de rede do serviço do agente até o endpoint OWS — via **VPN site-to-site**, **DMZ** ou **allowlist de IP**. Definir com a TI a topologia preferida.
- **Autenticação OWS:** padrão do OPERA é usuário de integração + segurança na chamada (token de sessão via serviço de login **ou** WS-Security `UsernameToken`) + identificação do sistema externo (app id) e **hotel code** (`BRISA`). A confirmar a exigência exata do ambiente.
- **Usuário de integração dedicado**, de **menor privilégio**, escopado à(s) propriedade(s) e apenas às operações listadas — nunca um usuário nominal de operador.
- **Credenciais nunca em código.** No agente entram por variáveis de ambiente/secret manager (ver §8); nunca versionadas.
- **Transporte:** HTTPS/TLS fim a fim; segredo compartilhado para o webhook de eventos.

---

## 8. Configuração no lado do agente

Nenhum segredo vive no repositório. O `OperaAdapter` lê de ambiente:

| Variável | Descrição |
|---|---|
| `pmsProvider` (setting do resort) | `seed` \| `opera_ows` \| `opera_cloud` — chave de troca |
| `OPERA_OWS_URL` | Endpoint base dos web services |
| `OPERA_OWS_USERNAME` / `OPERA_OWS_PASSWORD` | Usuário de integração |
| `OPERA_HOTEL_CODE` | Código da propriedade (`BRISA`) |
| `OPERA_APP_ID` | Identificação do sistema externo (se exigido) |
| `OPERA_EVENTS_SECRET` | Segredo compartilhado do webhook de Business Events |

Trocar `pmsProvider` de `seed` para `opera_ows` **é o único toque** necessário no agente para virar a chave — com rollback imediato.

---

## 9. LGPD e minimização de dados

- O agente **lê apenas os campos listados** neste documento — não faz varredura de base nem exporta dados em massa.
- **Imagens não são persistidas** (documento no check-in, foto de problema): o modelo extrai o texto necessário e a imagem é descartada; guardamos só a descrição.
- Dados de **menores** têm tratamento marcado (flag explícita).
- Trilha de auditoria de toda ação do agente já existe (inclusive bloqueios de guardrail).
- Base legal, retenção e DPA a alinhar com o DPO da Aviva antes do go-live de produção.

---

## 10. Faseamento sugerido (menor risco primeiro)

| Fase | Entrega | Risco | Pré-requisito da TI |
|---|---|---|---|
| **0** | Ambiente **UAT** com dados fictícios + conectividade | Nenhum (sem dado real) | Endpoint UAT + usuário de integração + rede |
| **1** | **Leitura**: `getReservation`, `getFolio` | Baixo (somente leitura) | WSDLs de Reservation e Folio |
| **2** | **Escrita**: `addMaintenance` | Baixo (escopo manutenção) | Via de escrita (OWS ou OXI) confirmada |
| **3** | **Proativo**: Business Events (quarto pronto, check-in) | Médio | Módulo de eventos habilitado + mecanismo de entrega |
| **4** | **Perfil** e **disponibilidade** (`getProfile`, `searchAvailability`) | Baixo | WSDLs de Profile e Availability |
| **5** | **Chave digital** via IFC8 | Médio | Fornecedor de fechadura + suporte a mobile key |

---

## 11. O que precisamos da TI da Aviva (checklist)

- [ ] Confirmar se **OWS está licenciado** e **quais módulos/WSDLs** estão habilitados (Reservation, Profile, GuestServices/Cashiering, Availability, Kiosk).
- [ ] Fornecer **endpoint + WSDLs do ambiente de UAT** (não produção).
- [ ] Criar **usuário de integração** de menor privilégio, escopado à propriedade `BRISA`.
- [ ] Confirmar o **padrão de autenticação** OWS exigido (token de login vs. WS-Security) e se há `app id`.
- [ ] Confirmar a **via de escrita de manutenção** disponível (OWS direto ou OXI).
- [ ] Confirmar se o módulo de **Business Events** está licenciado e o **mecanismo de entrega** (webhook vs. fila).
- [ ] Definir a **topologia de rede** (VPN / DMZ / allowlist de IP).
- [ ] Identificar o **fornecedor de fechadura** e o suporte a **chave móvel**.
- [ ] Indicar um **ponto focal técnico** para as validações.

---

## 12. Perguntas em aberto

1. O ambiente é **multipropriedade** num único schema (vimos o seletor "Todos Hotéis" e o menu "Multipropriedade"). Cada propriedade tem **hotel code próprio** — confirmar a lista para escopar os usuários e os eventos.
2. Há **ambiente de UAT/treinamento** do OPERA disponível, ou só produção? (Precisamos de UAT para desenvolver sem tocar dado real.)
3. A operação usa **OXI** hoje para alguma integração (CRS/OTA)? Se sim, podemos reaproveitar a mesma infraestrutura de eventos.
4. Roadmap de **migração para OPERA Cloud**: há data? Isso define se investimos primeiro no adapter OWS ou já no OHIP.
5. Para a chave digital: o fornecedor de fechadura já oferece **mobile key** integrado ao OPERA em alguma propriedade do grupo?

---

*Documento vivo — evolui conforme as respostas da TI. Referência de arquitetura: `docs/GAP_ANALYSIS.md` (seção 3) e o módulo `apps/api/src/pms/` (interface `PmsAdapter`, `SeedPmsAdapter`, esqueleto `OperaAdapter`).*
