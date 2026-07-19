import { z } from "zod";
import type { CheckinFormData } from "@concierge/shared";
import { missingCheckinFields } from "@concierge/shared";
import { isValidCpf, formatCpf } from "../../../lib/cpf.js";
import { lookupCep } from "../../../lib/viacep.js";
import { defineTool } from "../types.js";

/**
 * Check-in conversacional (caso de uso 3, reformulado): em vez de formulário,
 * os campos da FNRH são coletados em conversa e salvos INCREMENTALMENTE —
 * queda de conexão ou pausa não perde nada; o hóspede retoma de onde parou.
 *
 * Determinismos no código (nunca no modelo): validação de CPF por dígito
 * verificador, resolução de endereço por CEP (ViaCEP) e a lista de campos
 * obrigatórios restantes.
 */
export const updateCheckinForm = defineTool({
  name: "update_checkin_form",
  description:
    "Salva os dados do check-in digital aos poucos, conforme o hóspede responde. Chame a cada " +
    "1-3 campos coletados — NUNCA espere ter tudo. Para endereço, peça só o CEP e o número: o " +
    "resto é resolvido automaticamente. Registre acompanhantes (inclusive crianças) em " +
    "companions. A resposta informa o que ainda falta — pergunte só isso, em passos curtos. " +
    "Dados já salvos de estadias anteriores são reaproveitados automaticamente.",
  inputSchema: z.object({
    documentType: z.enum(["cpf", "passaporte", "rne"]).optional(),
    documentNumber: z.string().min(5).max(20).optional(),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD")
      .optional()
      .describe("Data de nascimento do titular, YYYY-MM-DD"),
    nationality: z.string().min(2).max(60).optional(),
    cep: z.string().max(10).optional().describe("Só o CEP — o endereço é resolvido sozinho"),
    addressNumber: z.string().max(10).optional().describe("Número da residência"),
    complemento: z.string().max(60).optional(),
    logradouro: z.string().max(120).optional().describe("Só se o CEP não resolver"),
    cidade: z.string().max(80).optional().describe("Só se o CEP não resolver"),
    estado: z.string().max(40).optional().describe("Só se o CEP não resolver"),
    originCity: z.string().max(80).optional().describe("De onde o hóspede está vindo"),
    arrivalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "formato HH:mm")
      .optional(),
    transport: z.enum(["aviao", "onibus", "automovel", "moto", "outro"]).optional(),
    carPlate: z.string().max(10).optional(),
    companions: z
      .array(
        z.object({
          name: z.string().min(2).max(120),
          birthDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          isChild: z.boolean().optional(),
        }),
      )
      .max(10)
      .optional(),
    acceptedExtras: z
      .array(z.string())
      .optional()
      .describe("Ids dos serviços/taxas opcionais que o hóspede ACEITOU"),
    declinedExtras: z
      .array(z.string())
      .optional()
      .describe("Ids dos serviços/taxas opcionais que o hóspede RECUSOU"),
  }),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status === "confirmed") return { allowed: true };
    return {
      allowed: false,
      reasonForModel:
        ctx.reservation.status === "checked_in_digital"
          ? "O check-in digital desta reserva já foi concluído."
          : "O check-in digital só está disponível para reservas confirmadas antes da chegada.",
    };
  },
  handler: async (input, ctx) => {
    // CPF: validação determinística por dígito verificador.
    if (input.documentType === "cpf" && input.documentNumber && !isValidCpf(input.documentNumber)) {
      return {
        output: {
          error:
            "CPF inválido (dígito verificador não confere). Peça ao hóspede para conferir o " +
            "número — não salve até estar correto.",
        },
      };
    }

    const patch: CheckinFormData = {
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.documentNumber
        ? {
            documentNumber:
              input.documentType === "cpf" ? formatCpf(input.documentNumber) : input.documentNumber,
          }
        : {}),
      ...(input.birthDate ? { birthDate: input.birthDate } : {}),
      ...(input.nationality ? { nationality: input.nationality } : {}),
      ...(input.originCity ? { originCity: input.originCity } : {}),
      ...(input.arrivalTime ? { arrivalTime: input.arrivalTime } : {}),
      ...(input.transport ? { transport: input.transport } : {}),
      ...(input.carPlate ? { carPlate: input.carPlate } : {}),
    };

    // Endereço: CEP resolve logradouro/bairro/cidade/estado via ViaCEP.
    let cepResolved: boolean | null = null;
    const address: NonNullable<CheckinFormData["address"]> = {};
    if (input.cep) {
      address.cep = input.cep;
      const resolved = await lookupCep(input.cep);
      cepResolved = resolved !== null;
      if (resolved) {
        address.logradouro = resolved.logradouro;
        address.bairro = resolved.bairro;
        address.cidade = resolved.cidade;
        address.estado = resolved.estado;
        address.pais = "Brasil";
      }
    }
    if (input.addressNumber) address.numero = input.addressNumber;
    if (input.complemento) address.complemento = input.complemento;
    if (input.logradouro) address.logradouro = input.logradouro;
    if (input.cidade) address.cidade = input.cidade;
    if (input.estado) address.estado = input.estado;
    if (Object.keys(address).length > 0) patch.address = address;

    // Primeira gravação: reaproveita dados de estadias anteriores (perfil).
    const existing = await ctx.repos.checkinForms.findByReservation(ctx.reservation.id);
    const defaults =
      !existing && ctx.guest.profile.checkinDefaults
        ? (ctx.guest.profile.checkinDefaults as CheckinFormData)
        : null;

    // Extras: decisão nova move o id para a lista certa e sai da outra.
    const current = (existing?.data ?? {}) as CheckinFormData;
    if (input.acceptedExtras || input.declinedExtras) {
      const accepted = new Set(current.acceptedExtras ?? []);
      const declined = new Set(current.declinedExtras ?? []);
      for (const id of input.acceptedExtras ?? []) {
        accepted.add(id);
        declined.delete(id);
      }
      for (const id of input.declinedExtras ?? []) {
        declined.add(id);
        accepted.delete(id);
      }
      patch.acceptedExtras = [...accepted];
      patch.declinedExtras = [...declined];
    }

    const form = await ctx.repos.checkinForms.upsertMerge(ctx.resort.id, ctx.reservation.id, {
      ...defaults,
      ...patch,
      ...(defaults?.address || patch.address
        ? { address: { ...defaults?.address, ...patch.address } }
        : {}),
    });

    for (const companion of input.companions ?? []) {
      await ctx.repos.companions.upsertByName(ctx.resort.id, ctx.reservation.id, {
        name: companion.name,
        birthDate: companion.birthDate ? new Date(companion.birthDate) : null,
        isChild: companion.isChild ?? false,
      });
    }

    const merged = form.data as CheckinFormData;
    const missing = missingCheckinFields(merged);

    // Extras opcionais ainda sem decisão: o modelo apresenta com o porquê.
    const decided = new Set([...(merged.acceptedExtras ?? []), ...(merged.declinedExtras ?? [])]);
    const pendingExtras = ctx.resort.settings.checkinExtras
      .filter((e) => !e.mandatory && !decided.has(e.id))
      .map((e) => ({ id: e.id, title: e.title, explanation: e.explanation, priceCents: e.priceCents, unit: e.unit }));

    return {
      output: {
        saved: true,
        reusedPreviousStay: defaults !== null,
        ...(cepResolved === false
          ? { cepWarning: "CEP não encontrado — colete logradouro, cidade e estado manualmente." }
          : {}),
        ...(cepResolved === true
          ? { addressResolved: "Endereço resolvido pelo CEP — confirme com o hóspede em uma linha." }
          : {}),
        missingFields: missing,
        ...(pendingExtras.length > 0 ? { pendingExtras } : {}),
        info:
          missing.length === 0
            ? pendingExtras.length > 0
              ? "Campos obrigatórios completos. ANTES de concluir, apresente os pendingExtras ao " +
                "hóspede — explique o porquê e o valor de cada um, sem pressão — e registre a " +
                "decisão com acceptedExtras/declinedExtras. Depois confirme tudo e chame " +
                "complete_early_checkin."
              : "Todos os campos obrigatórios coletados. Confirme os dados com o hóspede e chame complete_early_checkin."
            : `Faltam: ${missing.join(", ")}. Pergunte apenas 1-2 desses agora, de forma natural.`,
      },
    };
  },
});
