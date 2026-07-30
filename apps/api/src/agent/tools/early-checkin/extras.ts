import type { ResortSettings } from "@concierge/shared";

type CheckinExtra = ResortSettings["checkinExtras"][number];

export interface ExtrasLine {
  id: string;
  title: string;
  mandatory: boolean;
  /** Pessoas × noites para `por_pessoa_dia`; 1 para `por_estadia`. */
  qty: number;
  priceCents: number;
  totalCents: number;
}

export interface ExtrasCharge {
  lines: ExtrasLine[];
  totalCents: number;
  totalFormatted: string;
}

export const fmtBRL = (cents: number): string =>
  `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/** Sem acento, sem caixa, sem separador: "Convênio_Médico" -> "conveniomedico". */
const canonical = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Converte o id que o MODELO escreveu no id realmente configurado.
 *
 * O modelo inventa a grafia: já gravou "convenio_medico" (underscore) ao lado
 * de "convenio-medico" (o id real). Como o cálculo filtra a lista configurada,
 * um id errado não cobra a mais — mas se for o ÚNICO escrito, a aceitação do
 * hóspede some sem sinal algum: ele ouviu "incluído" e não é cobrado nem
 * coberto. Daí resolver aqui, e devolver null quando não dá para ter certeza.
 */
export function resolveExtraId(extras: CheckinExtra[], raw: string): string | null {
  const alvo = canonical(raw);
  if (!alvo) return null;

  const exato = extras.find((e) => canonical(e.id) === alvo || canonical(e.title) === alvo);
  if (exato) return exato.id;

  // Abreviação ("convenio" para "convenio-medico") só vale apontando para um
  // único extra — na dúvida entre dois, avisar é melhor que adivinhar.
  const parciais = extras.filter((e) => {
    const id = canonical(e.id);
    const titulo = canonical(e.title);
    return id.startsWith(alvo) || alvo.startsWith(id) || titulo.startsWith(alvo);
  });
  return parciais.length === 1 ? parciais[0].id : null;
}

/** Noites da estadia (mínimo 1 — check-in e check-out no mesmo dia conta uma). */
export function nightsOf(checkIn: Date, checkOut: Date): number {
  return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

/**
 * Quanto o check-in vai lançar na conta: obrigatórias sempre, opcionais só as
 * aceitas. Aritmética em um lugar só de propósito — a prévia mostrada ao
 * hóspede antes de confirmar e o pedido criado no fecho precisam sair do MESMO
 * cálculo, senão o valor combinado e o cobrado divergem.
 */
export function computeExtras(params: {
  extras: CheckinExtra[];
  acceptedIds: Iterable<string>;
  persons: number;
  nights: number;
}): ExtrasCharge {
  const accepted = new Set(params.acceptedIds);
  const lines: ExtrasLine[] = params.extras
    .filter((e) => e.mandatory || accepted.has(e.id))
    .map((e) => {
      const qty = e.unit === "por_pessoa_dia" ? params.persons * params.nights : 1;
      return {
        id: e.id,
        title: e.title,
        mandatory: e.mandatory,
        qty,
        priceCents: e.priceCents,
        totalCents: e.priceCents * qty,
      };
    });
  const totalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  return { lines, totalCents, totalFormatted: fmtBRL(totalCents) };
}

/**
 * Texto pronto do que será lançado, para o agente repassar sem recalcular.
 * A conta é determinística; deixar o modelo montá-la foi o que produziu uma
 * estadia cobrada em R$ 240 depois de o hóspede ouvir R$ 144.
 */
export function describeCharge(charge: ExtrasCharge, persons: number, nights: number): string {
  if (charge.lines.length === 0) return "";
  const pessoas = persons === 1 ? "1 pessoa" : `${persons} pessoas`;
  const noites = nights === 1 ? "1 diária" : `${nights} diárias`;
  const linhas = charge.lines.map((l) => {
    const base =
      l.qty === 1
        ? fmtBRL(l.priceCents)
        : `${fmtBRL(l.priceCents)} × ${l.qty} (${pessoas} × ${noites})`;
    const marca = l.mandatory ? " (obrigatória)" : "";
    return `- ${l.title}${marca}: ${base} = ${fmtBRL(l.totalCents)}`;
  });
  return `${linhas.join("\n")}\nTotal a lançar na conta do quarto: ${charge.totalFormatted}`;
}
