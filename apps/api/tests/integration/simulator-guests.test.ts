/**
 * Integração: criação e remoção de hóspedes de teste pelo simulador.
 * Postgres REAL (docker-compose). Fixtures com telefones aleatórios para não
 * colidir com o seed nem entre execuções.
 *
 * O caso que justifica o teste é a colisão de telefone: a identificação no
 * WhatsApp é por phonesMatch (tolera 9º dígito e DDI), então dois hóspedes com
 * telefones equivalentes fazem resolveGuestByPhone escolher o primeiro da
 * lista — um hóspede novo sequestraria a conversa de outro, em silêncio.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

let app: App;
const criados: string[] = [];

/** DDD 11 + 9 + 8 dígitos aleatórios, no formato que a Meta devolveria. */
function phoneAleatorio(): string {
  const n = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  return `+55 11 9${n}`;
}

async function criar(name: string, phone: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/simulator/guests",
    payload: { name, phone },
  });
  if (res.statusCode === 201) criados.push(phone);
  return res;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  for (const phone of criados) {
    const g = await prisma.guest.findFirst({ where: { phone }, select: { id: true } });
    if (!g) continue;
    const rs = await prisma.reservation.findMany({ where: { guestId: g.id }, select: { id: true } });
    const ids = rs.map((r) => r.id);
    await prisma.checkinForm.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.companion.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.reservation.deleteMany({ where: { guestId: g.id } });
    await prisma.guest.delete({ where: { id: g.id } });
  }
  await app.close();
  await prisma.$disconnect();
});

describe("POST /simulator/guests", () => {
  it("cria o hóspede já em pré-estadia, que é o estado que libera o check-in", async () => {
    const phone = phoneAleatorio();
    const res = await criar("Teste Pré-estadia", phone);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: "Teste Pré-estadia",
      phone,
      reservationStatus: "confirmed",
      roomNumber: null,
      reachable: true,
      removable: true,
    });

    // consentAt é obrigatório para o agente responder (LGPD) — sem ele o
    // hóspede apareceria na lista mas resolveGuestByPhone o ignoraria.
    const guest = await prisma.guest.findFirstOrThrow({ where: { phone } });
    expect(guest.consentAt).not.toBeNull();
  });

  it("recusa telefone equivalente a outro já cadastrado (9º dígito e DDI)", async () => {
    const base = phoneAleatorio();
    expect((await criar("Titular", base)).statusCode).toBe(201);

    const digitos = base.replace(/\D/g, ""); // 5511 9XXXXXXXX
    const semNove = `${digitos.slice(0, 4)}${digitos.slice(5)}`; // tira o 9
    const semDdi = digitos.slice(2);

    for (const variante of [digitos, semNove, semDdi]) {
      const res = await criar("Colisão", variante);
      expect(res.statusCode, `variante ${variante} deveria colidir`).toBe(409);
      expect(res.json().error).toContain("Titular");
    }
  });

  it("rejeita nome ou telefone curtos demais", async () => {
    expect((await criar("A", phoneAleatorio())).statusCode).toBe(400);
    expect((await criar("Nome Válido", "123")).statusCode).toBe(400);
  });

  it("cria no resort da demo mesmo com resort órfão no banco", async () => {
    // Fixture de integração que não limpou deixa um resort sem checkinExtras
    // nem ofertas. Com findFirst() sem ordenação o hóspede caía nele e a
    // jornada rodava sem cobrar taxa nenhuma — parecendo correta.
    const orfao = await prisma.resort.create({
      data: { name: "Resort Órfão (teste)", settings: {} },
    });
    try {
      const phone = phoneAleatorio();
      expect((await criar("Vai para a demo", phone)).statusCode).toBe(201);

      const guest = await prisma.guest.findFirstOrThrow({
        where: { phone },
        select: { resortId: true },
      });
      expect(guest.resortId).not.toBe(orfao.id);

      // E é onde os outros hóspedes já estão.
      const demo = await prisma.guest.groupBy({
        by: ["resortId"],
        _count: { resortId: true },
        orderBy: { _count: { resortId: "desc" } },
        take: 1,
      });
      expect(guest.resortId).toBe(demo[0]?.resortId);
    } finally {
      await prisma.resort.delete({ where: { id: orfao.id } });
    }
  });
});

describe("DELETE /simulator/guests/:phone", () => {
  it("remove o hóspede criado aqui e sua reserva", async () => {
    const phone = phoneAleatorio();
    await criar("Teste Removível", phone);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/simulator/guests/${encodeURIComponent(phone)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(await prisma.guest.findFirst({ where: { phone } })).toBeNull();
  });

  it("recusa remover quem não nasceu no simulador — o seed é a demo", async () => {
    const phone = phoneAleatorio();
    const resort = await prisma.resort.findFirstOrThrow({ select: { id: true } });
    const guest = await prisma.guest.create({
      data: { resortId: resort.id, name: "Não é do simulador", phone, profile: {} },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/simulator/guests/${encodeURIComponent(phone)}`,
    });

    expect(res.statusCode).toBe(403);
    expect(await prisma.guest.findUnique({ where: { id: guest.id } })).not.toBeNull();

    await prisma.guest.delete({ where: { id: guest.id } });
  });
});
