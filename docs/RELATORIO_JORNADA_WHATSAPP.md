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

---

## 🔴 Alto impacto

### 1. Botões de oferta chegam cortados no meio da palavra

O que o hóspede vê ao final do check-in:

```
▸ [ Massagem relaxante n ]
▸ [ Cesta de frutas e es ]
▸ [ Jantar romântico pé  ]
```

**Causa:** a Cloud API limita o título do botão a **20 caracteres** e o adapter usa o título da oferta cru (`o.title.slice(0, 20)`). Os títulos do catálogo têm 28–35 caracteres.
**Impacto:** os três botões ficam ilegíveis — parece sistema quebrado no momento exato da conversão.
**Correção sugerida:** rótulo curto próprio para botão, não o título da oferta. Ou um campo `shortTitle` na oferta (decisão de produto: quem escreve o rótulo), ou corte na fronteira de palavra com reticências (`Massagem relaxante…`). O rótulo curto é melhor: "Massagem no Spa", "Cesta + espumante", "Jantar na praia".

### 2. O id da oferta é descartado quando o hóspede toca no botão

Em [inbound.ts:46](apps/api/src/channels/whatsapp/inbound.ts:46):

```ts
content = `Quero aceitar a oferta "${message.interactive.button_reply.title}"`;
```

Usa só o **título truncado** e joga fora o `button_reply.id`, que contém `offer:<uuid>` — a identificação exata.

**Impacto observado:** ao tocar em "Massagem relaxante n", o agente não sabia qual oferta era, chamou `list_offers` para procurar e **reenviou a mesma lista de botões**. O hóspede toca num botão e recebe os mesmos botões de volta. Além do incômodo, buscar por título truncado pode casar com a oferta errada.
**Correção sugerida:** repassar o id no conteúdo (o agente resolve o preço no banco pelo id, como já faz).

### 3. A avaliação nunca é pedida logo após o check-out

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

### 4. Conteúdo duplicado: o card e o texto do agente dizem a mesma coisa

No WhatsApp o card **é** texto, então ele colide com o texto do agente. Aconteceu em três momentos:

| Momento | Mensagem do card | Texto do agente (logo depois) |
|---|---|---|
| Chave | "🔑 *Quarto 204* · Código: *483035*" | "Aqui está a chave do quarto 204… *Código: 483035*" |
| Extrato | lista + "*Total lançado: R$ 900,00*" | "Você tem *R$ 900,00* lançados: …" |
| Avaliação | "De 1 a 5, o quanto você recomendaria…" | "Conta pra gente como foi sua experiência…" |

**Impacto:** o hóspede recebe a mesma informação duas vezes, em duas notificações.
**Correção sugerida:** no canal sem card visual, suprimir o texto redundante — via instrução por canal no contexto do turno, ou não emitindo o fallback quando o texto do agente já cobre.

### 5. Muitas mensagens por turno = muitas notificações

Um turno comum gerou **3 mensagens** (3 buzzes no celular): uma frase de espera, o card e a resposta. Exemplos de frase de espera que viram notificação própria:

- *"Deixa eu verificar o extrato do seu quarto!"*
- *"Deixa eu processar o check-out para você!"*

No chat web isso é texto que flui naturalmente; no WhatsApp é uma mensagem separada, sem valor.
**Correção sugerida:** descartar o texto anterior à primeira chamada de tool no canal WhatsApp, ou agrupar as mensagens do turno.

### 6. Blocos de texto colados sem separador

Aparece em quase todo turno com ferramenta:

- `"…já salvo essas informações!Perfeito, registrado!"`
- `"…programação de hoje para você!Veja o que tem hoje"`
- `"…saber sua opinião:Qualquer coisa, pode nos chamar"`
- `"…vai ser incrível! 🌊🎄Registrei seu interesse!"`

**Causa:** o buffer de texto concatena o que o agente escreveu **antes** e **depois** da chamada de ferramenta, sem separador.
**Correção sugerida:** inserir quebra de parágrafo ao retomar o texto depois de uma ferramenta.

### 7. O agente usa linguagem de card num canal sem cards

> *"Um convite para compartilhar sua experiência **apareceu aí para você**"*

Referência a um elemento visual que no WhatsApp não existe — só chegou um link em texto.
**Correção sugerida:** o prompt não deve assumir interface visual; o canal pode entrar no contexto do turno.

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

---

## Prioridade sugerida

| # | Defeito | Esforço | Por quê primeiro |
|---|---|---|---|
| 1 | Botões cortados | Baixo (decisão de produto no rótulo) | Aparece no momento da conversão; parece sistema quebrado |
| 3 | Avaliação bloqueada pós-check-out | Baixo | Quebra o laço pós-estadia silenciosamente |
| 2 | Id da oferta descartado | Baixo | Risco de aceitar a oferta errada |
| 6 | Texto colado | Trivial | Alta frequência, correção de uma linha |
| 4/5 | Duplicação e excesso de mensagens | Médio | Ruído; melhora percepção de qualidade |
| 7 | Linguagem de card | Baixo | Ajuste de prompt/contexto |

> Todos os defeitos são de **apresentação por canal** ou de **atualização de contexto** — nenhum toca a lógica de negócio, os guardrails financeiros ou a máquina de estados.
