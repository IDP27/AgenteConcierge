/**
 * Seed de demonstração — idempotente (upsert por IDs fixos).
 * Executar com: pnpm seed (na raiz) ou pnpm --filter @concierge/api db:seed
 *
 * Cria:
 *  - 1 resort ("Resort Paraíso") com limites de guardrail em settings
 *  - 3 hóspedes em momentos diferentes da jornada:
 *      Ana   → chega amanhã (pré-estadia)
 *      Bruno → hospedado hoje (estadia)
 *      Carla → saiu ontem (pós-estadia)
 *  - 8 ofertas variadas
 *  - Base de conhecimento em data/knowledge/{resort_id}.md (já versionada no repo)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// IDs fixos para o seed ser idempotente e a demo previsível.
export const SEED = {
  resortId: "a0000000-0000-4000-8000-000000000001",
  guests: {
    ana: "b0000000-0000-4000-8000-000000000001",
    bruno: "b0000000-0000-4000-8000-000000000002",
    carla: "b0000000-0000-4000-8000-000000000003",
  },
  reservations: {
    ana: "c0000000-0000-4000-8000-000000000001",
    bruno: "c0000000-0000-4000-8000-000000000002",
    carla: "c0000000-0000-4000-8000-000000000003",
  },
  tokens: {
    ana: "tok-ana",
    bruno: "tok-bruno",
    carla: "tok-carla",
  },
} as const;

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const resortSettings = {
    orderAutoApproveLimitCents: 20000, // pedidos acima de R$ 200 → pending_approval
    maxProactiveOffersPerDay: 1,
    slaHoursByPriority: { low: 24, medium: 8, high: 2, urgent: 1 },
    timezone: "America/Sao_Paulo",
    review: {
      publicUrl: "https://g.page/r/resort-paraiso/review",
      satisfactionThreshold: 4,
    },
    // Taxas/serviços apresentados com contexto no check-in conversacional.
    checkinExtras: [
      {
        id: "taxa-ambiental",
        title: "Taxa ambiental",
        explanation:
          "Financia o tratamento de resíduos, a proteção da mata nativa e o viveiro de mudas do resort",
        priceCents: 800,
        unit: "por_pessoa_dia",
        mandatory: true,
      },
      {
        id: "convenio-medico",
        title: "Convênio médico de estadia",
        explanation:
          "Cobre atendimentos no ambulatório 24h e remoção de emergência ao hospital de referência",
        priceCents: 1200,
        unit: "por_pessoa_dia",
        mandatory: false,
      },
    ],
  };

  const resort = await prisma.resort.upsert({
    where: { id: SEED.resortId },
    create: {
      id: SEED.resortId,
      name: "Resort Paraíso",
      settings: resortSettings,
    },
    update: { settings: resortSettings },
  });

  // --- Hóspedes + reservas em 3 momentos da jornada ---

  const guests = [
    {
      id: SEED.guests.ana,
      name: "Ana Souza",
      phone: "+55 11 98888-0001",
      email: "ana.souza@example.com",
      profile: { interests: ["spa", "romantic"], travelingWith: "partner" },
      reservation: {
        id: SEED.reservations.ana,
        magicToken: SEED.tokens.ana,
        roomNumber: null, // ainda sem quarto — check-in antecipado vai coletar dados
        checkIn: daysFromNow(1),
        checkOut: daysFromNow(5),
        status: "confirmed" as const,
        plan: "all_inclusive",
      },
    },
    {
      id: SEED.guests.bruno,
      name: "Bruno Lima",
      phone: "+55 21 97777-0002",
      email: "bruno.lima@example.com",
      profile: {
        interests: ["kids", "food"],
        travelingWith: "family",
        kidsAges: [4, 7],
        clubMember: true, // membro do clube de férias → OS com prioridade elevada
      },
      reservation: {
        id: SEED.reservations.bruno,
        magicToken: SEED.tokens.bruno,
        roomNumber: "204",
        checkIn: daysFromNow(-2),
        checkOut: daysFromNow(2),
        status: "checked_in" as const,
        plan: "half_board",
      },
    },
    {
      id: SEED.guests.carla,
      name: "Carla Mendes",
      phone: "+55 31 96666-0003",
      email: "carla.mendes@example.com",
      profile: { interests: ["sports", "surf"], travelingWith: "friends" },
      reservation: {
        id: SEED.reservations.carla,
        magicToken: SEED.tokens.carla,
        roomNumber: "310",
        checkIn: daysFromNow(-6),
        checkOut: daysFromNow(-1),
        status: "checked_out" as const,
        plan: "bed_and_breakfast",
      },
    },
  ];

  for (const g of guests) {
    await prisma.guest.upsert({
      where: { id: g.id },
      create: {
        id: g.id,
        resortId: resort.id,
        name: g.name,
        phone: g.phone,
        email: g.email,
        consentAt: new Date(),
        profile: g.profile,
      },
      // lastProactiveOfferAt volta a null junto com o perfil: é o anti-spam de
      // 1 oferta/dia, e sem zerá-lo uma demo re-semeada não consegue mostrar o
      // upsell proativo (suggest_offers sai bloqueado pelo guardrail).
      update: { profile: g.profile, lastProactiveOfferAt: null },
    });
    const r = g.reservation;
    await prisma.reservation.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        resortId: resort.id,
        guestId: g.id,
        roomNumber: r.roomNumber,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        plan: r.plan,
        magicToken: r.magicToken,
      },
      update: {
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        roomNumber: r.roomNumber,
      },
    });
  }

  // --- 8 ofertas variadas ---

  const offers: Array<{
    id: string;
    title: string;
    description: string;
    priceCents: number;
    tags: string[];
  }> = [
    {
      id: "d0000000-0000-4000-8000-000000000001",
      title: "Massagem relaxante no Spa Mar Azul",
      description: "50 minutos de massagem com óleos essenciais, vista para o mar.",
      priceCents: 28000,
      tags: ["spa", "romantic", "relax"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000002",
      title: "Jantar romântico pé na areia",
      description: "Menu de 4 tempos à beira-mar, com espumante incluso. Reserva até 16h.",
      priceCents: 45000,
      tags: ["romantic", "food", "dinner"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000003",
      title: "Passeio de buggy pelas dunas",
      description: "2 horas de passeio com guia credenciado. Saídas às 9h e 14h.",
      priceCents: 18000,
      tags: ["adventure", "family", "tour"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000004",
      title: "Kids Club — tarde de recreação",
      description: "Atividades monitoradas para crianças de 3 a 12 anos, das 14h às 18h. Lanche incluso.",
      priceCents: 9000,
      tags: ["kids", "family"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000005",
      title: "Café da manhã na suíte",
      description: "Cesta completa servida no quarto entre 7h e 10h.",
      priceCents: 7500,
      tags: ["food", "breakfast", "relax"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000006",
      title: "Late checkout até 16h",
      description: "Estenda sua saída até as 16h (sujeito a disponibilidade).",
      priceCents: 12000,
      tags: ["convenience", "checkout"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000007",
      title: "Aula de surf para iniciantes",
      description: "1h30 de aula com instrutor e prancha inclusa, na praia principal.",
      priceCents: 15000,
      tags: ["sports", "surf", "adventure"],
    },
    {
      id: "d0000000-0000-4000-8000-000000000008",
      title: "Cesta de frutas e espumante no quarto",
      description: "Frutas da estação e espumante brut gelado, entregues no quarto.",
      priceCents: 11000,
      tags: ["romantic", "food", "room"],
    },
  ];

  for (const o of offers) {
    await prisma.offer.upsert({
      where: { id: o.id },
      create: { ...o, resortId: resort.id, active: true },
      update: { ...o, active: true },
    });
  }

  console.log("✅ Seed concluído:");
  console.log(`   Resort: ${resort.name} (${resort.id})`);
  console.log(`   Hóspedes: Ana (chega amanhã), Bruno (hospedado), Carla (saiu ontem)`);
  console.log(`   Ofertas: ${offers.length}`);
  console.log("   Magic tokens de demo:");
  console.log(`     Ana   → /chat?token=${SEED.tokens.ana}`);
  console.log(`     Bruno → /chat?token=${SEED.tokens.bruno}`);
  console.log(`     Carla → /chat?token=${SEED.tokens.carla}`);
  console.log(`   Knowledge base: data/knowledge/${resort.id}.md`);
}

main()
  .catch((e) => {
    console.error("❌ Seed falhou:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
