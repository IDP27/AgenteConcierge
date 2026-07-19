import { z } from "zod";

/**
 * Campos da FNRH coletados no check-in conversacional (JSONB
 * `checkin_forms.data`). Tudo opcional: a coleta é incremental — o shape
 * completo só é exigido em complete_early_checkin.
 */
export const checkinAddressSchema = z.object({
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
});
export type CheckinAddress = z.infer<typeof checkinAddressSchema>;

export const checkinFormDataSchema = z.object({
  documentType: z.enum(["cpf", "passaporte", "rne"]).optional(),
  documentNumber: z.string().optional(),
  birthDate: z.string().optional(), // YYYY-MM-DD
  nationality: z.string().optional(),
  address: checkinAddressSchema.optional(),
  /** FNRH: de onde o hóspede está vindo. */
  originCity: z.string().optional(),
  arrivalTime: z.string().optional(), // HH:mm
  transport: z.enum(["aviao", "onibus", "automovel", "moto", "outro"]).optional(),
  carPlate: z.string().optional(),
  /** Ids de checkinExtras aceitos/recusados pelo hóspede na conversa. */
  acceptedExtras: z.array(z.string()).optional(),
  declinedExtras: z.array(z.string()).optional(),
});
export type CheckinFormData = z.infer<typeof checkinFormDataSchema>;

/** Campos mínimos para concluir o check-in digital (FNRH essencial). */
export const CHECKIN_REQUIRED_FIELDS = [
  "documentType",
  "documentNumber",
  "birthDate",
  "nationality",
  "address.cep",
  "address.numero",
  "arrivalTime",
] as const;

/** Devolve os campos obrigatórios ainda ausentes (paths com ponto). */
export function missingCheckinFields(data: CheckinFormData): string[] {
  const flat: Record<string, unknown> = {
    ...data,
    "address.cep": data.address?.cep,
    "address.numero": data.address?.numero,
  };
  return CHECKIN_REQUIRED_FIELDS.filter((f) => {
    const v = flat[f];
    return v === undefined || v === null || v === "";
  });
}
