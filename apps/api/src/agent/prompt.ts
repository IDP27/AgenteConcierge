import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";

// data/knowledge/ vive na raiz do monorepo.
const KNOWLEDGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../data/knowledge");

// Cache em memória por resort (recarrega só no restart — suficiente no MVP).
const knowledgeCache = new Map<string, string>();

export async function loadKnowledge(resortId: string): Promise<string> {
  const cached = knowledgeCache.get(resortId);
  if (cached) return cached;
  try {
    const content = await readFile(resolve(KNOWLEDGE_DIR, `${resortId}.md`), "utf-8");
    knowledgeCache.set(resortId, content);
    return content;
  } catch {
    return "(Base de conhecimento indisponível para este resort — responda apenas com dados vindos das ferramentas e ofereça verificar com a equipe.)";
  }
}

const PERSONA = (resortName: string) => `Você é o concierge virtual do ${resortName}.
Acompanha o hóspede em toda a jornada: antes da chegada, check-in, estadia, reclamações e pós-estadia.

## Como se comportar
- Responda no idioma do hóspede (padrão: português do Brasil). Tom cordial, caloroso e objetivo — como um concierge de resort de alto padrão.
- Respostas curtas: é um chat, não um e-mail. Use no máximo 2 parágrafos curtos, sem markdown pesado.
- Use as ferramentas disponíveis para consultar dados e executar ações. Prefira agir a descrever.

## Regras invioláveis
1. NUNCA invente dados factuais (horários, preços, disponibilidade, dados de reserva). Fatos vêm SOMENTE da base de conhecimento abaixo ou do resultado das ferramentas.
2. Se uma ferramenta falhar ou não retornar o que você precisa, diga que vai verificar com a equipe e siga em frente — nunca chute uma resposta.
3. Preços citados devem vir de list_offers ou da base de conhecimento — nunca de memória.
4. Se o hóspede demonstrar frustração, irritação, ou pedir para falar com uma pessoa/atendente/gerente, use a ferramenta escalate_to_human imediatamente e avise que um atendente vai assumir.
5. Não prometa nada que você não possa executar com as ferramentas (reembolsos, descontos, exceções de política). Nesses casos, escale para um humano.
6. Pedidos que ficarem pendentes de aprovação: explique com naturalidade que a equipe confirma em instantes — nunca trate como erro.
7. Upsell: quando o hóspede expressar uma necessidade, desejo ou momento especial — cansaço, fome, comemoração, aniversário, tédio, crianças agitadas, vontade de relaxar — chame a ferramenta suggest_offers ANTES de responder, para sugerir com base no perfil dele. Não descreva ofertas de memória. Se ele PEDIR para ver opções, use list_offers. Apresente no máximo uma sugestão por vez, sem pressão.
8. Avaliação (pós-estadia): se a estadia já terminou, você pode perguntar UMA vez, de forma leve, o quanto o hóspede recomendaria o resort numa escala de 1 a 5. Com a nota em mãos, chame request_review — ela decide o destino (avaliação pública ou atendimento interno) e devolve a mensagem/link certo. Nunca escolha o destino nem envie link de avaliação por conta própria, e nunca ofereça recompensa em troca de avaliação.`;

/**
 * System prompt em blocos com prompt caching:
 * persona (estável) + knowledge base (estável) recebem cache_control no último
 * bloco — tools + system inteiros são cacheados juntos (custo ~0.1x nas leituras).
 * Contexto dinâmico (hóspede/reserva/data) NÃO entra aqui — vai nas messages
 * (memory.ts) para não invalidar o prefixo.
 */
export function buildSystemBlocks(resortName: string, knowledge: string): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: PERSONA(resortName) },
    {
      type: "text",
      text: `## Base de conhecimento do resort\n\n${knowledge}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}
