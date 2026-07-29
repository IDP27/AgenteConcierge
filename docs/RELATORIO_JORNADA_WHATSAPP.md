# Relatório — Jornada completa no canal WhatsApp

**Data:** 24/07/2026
**Como foi feito:** jornada ponta a ponta executada pelo simulador de canal (`/simulador`), que percorre o **mesmo caminho do webhook real** — parsing por tipo, identificação por telefone, agent-core e `WhatsAppAdapter`. Só a entrega à Meta é substituída, então o texto abaixo é literalmente o que o hóspede receberia no aparelho.

**Cobertura:** 3 personas × 18 turnos reais, incluindo **duas fotos** (documento para OCR e problema no banheiro para triagem).

| Persona | Fase | Cenários exercitados |
|---|---|---|
| Ana | Pré-estadia | FAQ, check-in conversacional (FNRH), OCR de documento, taxas com contexto, acompanhantes (incl. menor), upsell no fecho, toque em botão |
| Bruno | Estadia | Chave digital, agenda do dia, triagem de problema por foto, extrato, check-out |
| Carla | Pós-estadia | Avaliação (nota + roteamento), link público, interesse de retorno |

---

## Veredito

O **miolo funciona**: nenhum cenário travou, nenhuma ferramenta falhou, e os recursos mais sofisticados (OCR, triagem multimodal, roteamento de avaliação) se comportaram bem. O que quebra é **a camada de apresentação e um guardrail com contexto velho** — 7 defeitos, sendo 3 de alto impacto. Nenhum exige redesenho.

> **Estado em 24/07/2026 — os 9 defeitos corrigidos e verificados ao vivo.**
> ✅ #1 rótulo de botão · ✅ #2 id da oferta · ✅ #3 avaliação pós-check-out · ✅ #4 duplicação · ✅ #5 excesso de mensagens · ✅ #6 texto colado · ✅ #7 linguagem de card · ✅ #8 corpo × botões · ✅ #9 ferramenta repetida

### Segunda rodada — confirmação (24/07)

A jornada foi **re-executada do zero** com o banco re-semeado, para confirmar as correções: 16 chamadas de ferramenta, todas com sucesso. Os quatro defeitos corrigidos não reapareceram, e o estado final ficou coerente (Ana `checked_in_digital`, Bruno `checked_out` com avaliação registrada, Carla com interesse de retorno, chaves revogadas, OS `urgent`).

A rodada revelou **dois achados novos** — #8 (corrigido) e #9 (em aberto) — descritos abaixo.

---

## 🔴 Alto impacto

### 1. Botões de oferta chegam cortados no meio da palavra ✅ CORRIGIDO

O que o hóspede vê ao final do check-in:

```
▸ [ Massagem relaxante n ]
▸ [ Cesta de frutas e es ]
▸ [ Jantar romântico pé  ]
```

**Causa:** a Cloud API limita o título do botão a **20 caracteres** e o adapter usa o título da oferta cru (`o.title.slice(0, 20)`). Os títulos do catálogo têm 28–35 caracteres.
**Impacto:** os três botões ficam ilegíveis — parece sistema quebrado no momento exato da conversão.
**Correção sugerida:** rótulo curto próprio para botão, não o título da oferta. Ou um campo `shortTitle` na oferta (decisão de produto: quem escreve o rótulo), ou corte na fronteira de palavra com reticências (`Massagem relaxante…`). O rótulo curto é melhor: "Massagem no Spa", "Cesta + espumante", "Jantar na praia".

### 2. O id da oferta é descartado quando o hóspede toca no botão ✅ CORRIGIDO

Em [inbound.ts:46](apps/api/src/channels/whatsapp/inbound.ts:46):

```ts
content = `Quero aceitar a oferta "${message.interactive.button_reply.title}"`;
```

Usa só o **título truncado** e joga fora o `button_reply.id`, que contém `offer:<uuid>` — a identificação exata.

**Impacto observado:** ao tocar em "Massagem relaxante n", o agente não sabia qual oferta era, chamou `list_offers` para procurar e **reenviou a mesma lista de botões**. O hóspede toca num botão e recebe os mesmos botões de volta. Além do incômodo, buscar por título truncado pode casar com a oferta errada.
**Correção aplicada:** o id passou a ser repassado ao agente, que resolve o preço no banco por ele.

**Ajuste posterior (3ª rodada):** ao reconfirmar o toque, o agente respondeu *"vou criar um pedido de 1x Massagem Relaxante (id `d0000000-0000-4000-8000-000000000001`)"* — o UUID vazou para o hóspede. A causa foi a própria correção: o id tinha sido embutido no texto da mensagem do hóspede, e o modelo o devolveu. Passou a viajar numa nota de sistema à parte, com instrução explícita de não mencioná-lo. Reverificado: o toque leva direto à oferta certa, sem id visível, e o pedido nasce com o preço resolvido no banco.

### 3. A avaliação nunca é pedida logo após o check-out ✅ CORRIGIDO

Trecho real do fecho da estadia do Bruno:

```
Check-out realizado com sucesso, Bruno! 🎉 ...
Antes de partir, o que você achou da estadia? Adoraria saber sua opinião:Qualquer
coisa, pode nos chamar por aqui. Até a próxima! 😊
```

O agente **convida** o hóspede a opinar e… não pergunta nada. A auditoria mostra por quê:

```
16:37:18  request_checkout      success
16:37:23  ask_review_rating     blocked_by_guardrail
          "A avaliação só deve ser pedida no pós-estadia (após o check-out).
           Como a estadia ainda não terminou, não peça avaliação agora."
```

**Causa:** o `ToolContext` (incluindo `reservation.status`) é montado **uma vez, no início do turno**. O `request_checkout` transiciona a reserva para `checked_out`, mas o guardrail do `ask_review_rating`, no mesmo turno, ainda lê `checked_in` — contexto velho.
**Impacto:** o laço pós-estadia quebra exatamente no momento de maior intenção. Com a Carla (que já entrou `checked_out`) a avaliação funcionou — ou seja, o defeito só aparece no encadeamento natural.
**Correção sugerida:** reler o status da reserva no guardrail, ou invalidar/atualizar o contexto após uma transição de estado no mesmo turno.

---

## 🟡 Médio — experiência no aparelho

### 4. Conteúdo duplicado: o card e o texto do agente dizem a mesma coisa ✅ CORRIGIDO

No WhatsApp o card **é** texto, então ele colide com o texto do agente. Aconteceu em três momentos:

| Momento | Mensagem do card | Texto do agente (logo depois) |
|---|---|---|
| Chave | "🔑 *Quarto 204* · Código: *483035*" | "Aqui está a chave do quarto 204… *Código: 483035*" |
| Extrato | lista + "*Total lançado: R$ 900,00*" | "Você tem *R$ 900,00* lançados: …" |
| Avaliação | "De 1 a 5, o quanto você recomendaria…" | "Conta pra gente como foi sua experiência…" |

**Impacto:** o hóspede recebe a mesma informação duas vezes, em duas notificações.
**Correção sugerida:** no canal sem card visual, suprimir o texto redundante — via instrução por canal no contexto do turno, ou não emitindo o fallback quando o texto do agente já cobre.

### 5. Muitas mensagens por turno = muitas notificações ✅ CORRIGIDO

Um turno comum gerou **3 mensagens** (3 buzzes no celular): uma frase de espera, o card e a resposta. Exemplos de frase de espera que viram notificação própria:

- *"Deixa eu verificar o extrato do seu quarto!"*
- *"Deixa eu processar o check-out para você!"*

No chat web isso é texto que flui naturalmente; no WhatsApp é uma mensagem separada, sem valor.
**Correção sugerida:** descartar o texto anterior à primeira chamada de tool no canal WhatsApp, ou agrupar as mensagens do turno.

### 6. Blocos de texto colados sem separador ✅ CORRIGIDO

Aparece em quase todo turno com ferramenta:

- `"…já salvo essas informações!Perfeito, registrado!"`
- `"…programação de hoje para você!Veja o que tem hoje"`
- `"…saber sua opinião:Qualquer coisa, pode nos chamar"`
- `"…vai ser incrível! 🌊🎄Registrei seu interesse!"`

**Causa:** o buffer de texto concatena o que o agente escreveu **antes** e **depois** da chamada de ferramenta, sem separador.
**Correção sugerida:** inserir quebra de parágrafo ao retomar o texto depois de uma ferramenta.

### 7. O agente usa linguagem de card num canal sem cards ✅ CORRIGIDO

> *"Um convite para compartilhar sua experiência **apareceu aí para você**"*

Referência a um elemento visual que no WhatsApp não existe — só chegou um link em texto.
**Correção sugerida:** o prompt não deve assumir interface visual; o canal pode entrar no contexto do turno.

### 8. O corpo do card lista mais ofertas do que existem botões ✅ CORRIGIDO

*(encontrado na segunda rodada)*

Ao pedir o catálogo completo, o card saiu com **8 itens listados e apenas 3 botões** — a Cloud API não aceita mais que três. As outras cinco opções apareciam sem nenhuma forma de tocar.

```
• Café da manhã na suíte — R$ 75,00
• Kids Club — tarde de recreação — R$ 90,00
• Cesta de frutas e espumante no quarto — R$ 110,00
• Late checkout até 16h — R$ 120,00          ← sem botão
• Aula de surf para iniciantes — R$ 150,00   ← sem botão
… (mais 3 sem botão)
   ▸ [ botão ] [ botão ] [ botão ]
```

**Causa:** o corpo era montado com `offers` inteiro enquanto os botões usavam `offers.slice(0, 3)`.
**Detalhe revelador:** isso contradizia o próprio comentário do código — *"o título completo está no corpo acima"* — que só valia para as três com botão.
**Correção aplicada:** o corpo passa a listar exatamente o que é tocável e, havendo sobra, acrescenta *"…e mais N opções — me diga o que procura"*. O texto do agente continua trazendo o catálogo completo, então nada se perde: o card virou o atalho acionável e a mensagem, a lista de referência.

---

## 🔵 Baixo — variação do modelo

### 9. Ferramenta chamada de novo sem necessidade ✅ CORRIGIDO

*(encontrado na segunda rodada)*

Bruno perguntou a **programação do dia** e recebeu, junto, a **chave do quarto outra vez**. A auditoria mostra `get_room_key` executada duas vezes:

```
22:12:03  get_room_key        success
22:12:10  get_room_key        success   ← repetida
22:12:10  get_daily_schedule  success
```

**Natureza:** escolha de ferramenta do modelo, não defeito de código. Sem risco de segurança: a tool é idempotente e reapresenta a chave ativa (mesmo código), sem emitir outra.
**Impacto:** ruído — uma mensagem a mais, com informação que o hóspede não pediu naquele momento.
**Correção aplicada:** a descrição da ferramenta dizia *quando usar*, mas nunca *quando não usar* — e é a descrição que governa a seleção do modelo. Passou a explicitar: use SOMENTE quando o hóspede pedir a chave nesta mensagem; NÃO chame ao responder outros assuntos, porque a chave entregue continua valendo. A regra 14 do prompt foi reforçada no mesmo sentido.
**Verificação:** por ser comportamento probabilístico, a sequência que o expôs (pedir a chave → perguntar a programação) foi repetida **três vezes**: nas três, o turno da programação veio com **uma única mensagem e sem a chave** — antes eram três mensagens com a chave reenviada.

---

## ✅ O que passou bem

- **OCR de documento:** leu corretamente nome, CPF, data de nascimento e nacionalidade de uma foto, mostrou o que leu e pediu confirmação antes de salvar.
- **Triagem por foto:** descreveu o problema com precisão — *"Mancha escura de umidade/mofo na parede de azulejos, chuveiro com gotejamento visível e poça de água grande acumulada no piso"* — abriu OS com **prioridade alta** e SLA de 2h.
- **LGPD:** avisou espontaneamente, nas duas fotos, que a imagem não fica armazenada.
- **Guardrail de menor:** recusou concluir o check-in sem a data de nascimento da criança, citando a exigência legal — e não cedeu quando insisti.
- **Marcação:** o negrito saiu na sintaxe do WhatsApp, sem asteriscos literais (correção da rodada anterior confirmada em produção real de texto).
- **Taxas com contexto:** apresentou o convênio médico com o porquê e o valor, sem pressão, e lançou na conta ao aceitar.
- **Roteamento de avaliação:** nota 5 → link público; o caminho interno não foi acionado indevidamente.
- **Agenda do dia:** formatação com emoji e negrito ficou boa e legível no WhatsApp.
- **Anti-spam de ofertas (2ª rodada):** o upsell no fecho do check-in não disparou e parecia regressão — a auditoria mostrou `suggest_offers → blocked_by_guardrail` porque a hóspede **já havia recebido uma sugestão proativa naquele dia**. É o limite de 1/dia funcionando como projetado, em código e não em prompt.
- **Conversão de tabela (2ª rodada):** o modelo respondeu o catálogo em tabela markdown e chegou ao aparelho como cabeçalho em negrito + itens, sem pipes — correção anterior confirmada em uso real.

---

## Situação por defeito

| # | Defeito | Estado |
|---|---|---|
| 1 | Botões cortados no meio da palavra | ✅ Corrigido — corte na fronteira de palavra, no adapter |
| 2 | Id da oferta descartado no toque | ✅ Corrigido — id repassado ao agente |
| 3 | Avaliação bloqueada após o check-out | ✅ Corrigido — contexto do turno atualizado na transição |
| 6 | Texto colado sem separador | ✅ Corrigido — parágrafo ao retomar depois da ferramenta |
| 8 | Corpo do card × número de botões | ✅ Corrigido — corpo lista só o tocável + "e mais N opções" |
| 4 | Duplicação entre card e texto do agente | ✅ Corrigido — código da chave não vai ao modelo; vocabulário de card neutralizado |
| 5 | Excesso de mensagens por turno | ✅ Corrigido — texto de abertura fundido na mensagem do card |
| 7 | Linguagem de card em canal sem cards | ✅ Corrigido — canal no contexto do turno + ferramentas sem vocabulário visual |
| 9 | Ferramenta repetida sem necessidade | ✅ Corrigido — descrição da tool passou a dizer quando NÃO chamar (3/3 nas repetições) |

### Como #4, #5 e #7 foram resolvidos

Os três tinham a mesma raiz — **o agente não sabia em que canal estava escrevendo** — e foram tratados juntos, cada parte na camada certa:

1. **Canal no contexto do turno.** `buildContextMessage` passou a receber o canal e explicar como aquele canal apresenta as respostas: no web há card visual e ele pode ser referenciado; no WhatsApp tudo é texto, então não se repete o que a ferramenta já mostrou nem se cita "a tela".
2. **Vocabulário de canal removido das ferramentas.** A raiz mais teimosa estava nas próprias tools: `get_room_key` instruía *"diga que a chave está no card acima"* — instrução mais próxima e mais forte que qualquer regra geral. As menções a "card" saíram das ferramentas e do prompt, substituídas por linguagem neutra ("já foi apresentado ao hóspede").
3. **Garantia determinística para o dado crítico.** O código da chave deixou de ir para o modelo: ele segue apenas no card, que é a fonte da verdade. O que o modelo não tem, não repete — e também não erra. Prompt orienta o estilo; o código garante o fato.
4. **Fusão de mensagens no adapter.** O texto que abre um card entra na MESMA mensagem, em vez de virar uma notificação separada — o que reduziu os turnos típicos de 3 para 2 envios sem perder a frase de acolhimento.

> Todos os defeitos encontrados são de **apresentação por canal** ou de **atualização de contexto** — nenhum tocou a lógica de negócio, os guardrails financeiros ou a máquina de estados.

---

## Terceira rodada — confirmação final (24/07)

Jornada re-executada do zero após as correções de #4, #5, #7 e #9: **18 chamadas de ferramenta — 17 com sucesso e 1 bloqueio correto** (anti-spam de ofertas). Estado final coerente: Ana `checked_in_digital`, Bruno `checked_out` com avaliação registrada, Carla com interesse de retorno.

O efeito acumulado das correções na experiência do aparelho:

| Momento | Antes | Depois |
|---|---|---|
| Pedir a chave | 3 mensagens, código repetido em duas | 2 mensagens, código uma vez só |
| Perguntar a programação (após a chave) | 3 mensagens, chave reenviada | 1 mensagem, sem a chave |
| Foto de problema | 2 mensagens (frase de espera + OS) | 1 mensagem, com o acolhimento preservado |
| Consultar o extrato | 3 mensagens, conta recitada duas vezes | 2 mensagens, resposta complementa |
| Catálogo de ofertas | 8 itens listados, 3 tocáveis | 3 itens tocáveis + "e mais 5 opções" |

Nenhum defeito novo apareceu nesta rodada.
