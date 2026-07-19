import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateCheckinForm } from "./update-form.js";
import { completeEarlyCheckin } from "./complete.js";
import { makeToolCtx } from "../test-helpers.js";
import { isValidCpf } from "../../../lib/cpf.js";
import { lookupCep } from "../../../lib/viacep.js";

vi.mock("../../../lib/viacep.js", () => ({ lookupCep: vi.fn() }));
const mockedLookupCep = vi.mocked(lookupCep);

// CPF de teste válido pelo algoritmo de dígitos verificadores.
const VALID_CPF = "52998224725";

describe("isValidCpf", () => {
  it("aceita CPF com dígitos verificadores corretos", () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });
  it("rejeita dígito errado, tamanho errado e sequências repetidas", () => {
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
  });
});

describe("update_checkin_form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLookupCep.mockResolvedValue(null);
  });

  it("guardrail: só para reservas confirmed (pré-estadia)", () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_in" });
    expect(updateCheckinForm.guardrail?.({}, ctx)).toMatchObject({ allowed: false });
  });

  it("CPF inválido é rejeitado sem salvar", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "confirmed" });

    const result = await updateCheckinForm.handler(
      { documentType: "cpf", documentNumber: "12345678900" },
      ctx,
    );

    expect(result.output).toMatchObject({ error: expect.stringContaining("CPF inválido") });
    expect(fakes.checkinForms.upsertMerge).not.toHaveBeenCalled();
  });

  it("CEP resolve endereço via ViaCEP e salva incrementalmente", async () => {
    mockedLookupCep.mockResolvedValue({
      logradouro: "Avenida Paulista",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      estado: "SP",
    });
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "confirmed" });

    const result = await updateCheckinForm.handler({ cep: "01310-100", addressNumber: "1000" }, ctx);

    expect(fakes.checkinForms.upsertMerge).toHaveBeenCalledWith(
      ctx.resort.id,
      "res-1",
      expect.objectContaining({
        address: expect.objectContaining({
          cep: "01310-100",
          logradouro: "Avenida Paulista",
          cidade: "São Paulo",
          estado: "SP",
          numero: "1000",
        }),
      }),
    );
    expect(result.output).toMatchObject({ saved: true, missingFields: expect.any(Array) });
  });

  it("CEP não encontrado degrada com aviso para coleta manual", async () => {
    const { ctx } = makeToolCtx({ reservationStatus: "confirmed" });

    const result = await updateCheckinForm.handler({ cep: "99999999" }, ctx);

    expect(result.output).toMatchObject({ cepWarning: expect.stringContaining("manualmente") });
  });

  it("primeira gravação reaproveita checkinDefaults de estadia anterior", async () => {
    const { ctx, fakes } = makeToolCtx({
      reservationStatus: "confirmed",
      profile: {
        checkinDefaults: { documentType: "cpf", documentNumber: "529.982.247-25", nationality: "brasileira" },
      },
    });

    const result = await updateCheckinForm.handler({ arrivalTime: "15:30" }, ctx);

    expect(fakes.checkinForms.upsertMerge).toHaveBeenCalledWith(
      ctx.resort.id,
      "res-1",
      expect.objectContaining({
        documentType: "cpf",
        documentNumber: "529.982.247-25",
        arrivalTime: "15:30",
      }),
    );
    expect(result.output).toMatchObject({ reusedPreviousStay: true });
  });

  it("acompanhantes viram linhas próprias (multi-hóspede)", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "confirmed" });

    await updateCheckinForm.handler(
      {
        companions: [
          { name: "Marina Lima", birthDate: "2019-03-10", isChild: true },
          { name: "Paulo Lima" },
        ],
      },
      ctx,
    );

    expect(fakes.companions.upsertByName).toHaveBeenCalledTimes(2);
    expect(fakes.companions.upsertByName).toHaveBeenCalledWith(
      ctx.resort.id,
      "res-1",
      expect.objectContaining({ name: "Marina Lima", isChild: true }),
    );
  });
});

describe("complete_early_checkin", () => {
  beforeEach(() => vi.clearAllMocks());

  const completeData = {
    documentType: "cpf",
    documentNumber: "529.982.247-25",
    birthDate: "1990-05-01",
    nationality: "brasileira",
    address: { cep: "01310-100", numero: "1000" },
    arrivalTime: "15:30",
  };

  it("recusa concluir com campos obrigatórios faltando", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "confirmed" });
    fakes.checkinForms.findByReservation.mockResolvedValue({
      id: "form-1",
      data: { documentType: "cpf" },
    });

    const result = await completeEarlyCheckin.handler({ confirmedByGuest: true }, ctx);

    expect(result.output).toMatchObject({ error: expect.stringContaining("faltam") });
    expect(fakes.reservations.setStatus).not.toHaveBeenCalled();
  });

  it("completo: conclui, salva defaults no perfil e instrui venda antecipada", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "confirmed" });
    fakes.checkinForms.findByReservation.mockResolvedValue({ id: "form-1", data: completeData });

    const result = await completeEarlyCheckin.handler({ confirmedByGuest: true }, ctx);

    expect(fakes.checkinForms.complete).toHaveBeenCalledWith("res-1", ctx.now);
    expect(fakes.reservations.setStatus).toHaveBeenCalledWith("res-1", "checked_in_digital");
    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith(
      "guest-1",
      expect.objectContaining({
        checkinDefaults: expect.objectContaining({ documentNumber: "529.982.247-25" }),
      }),
    );
    expect(result.output).toMatchObject({
      status: "checked_in_digital",
      info: expect.stringContaining("suggest_offers"),
    });
  });
});
