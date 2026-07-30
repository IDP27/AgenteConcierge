import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../lib/prisma.js";
import { repos } from "../repositories/index.js";
import { SimulatorWhatsAppClient } from "../channels/whatsapp/simulator-client.js";
import { processInbound, resolveGuestByPhone } from "../channels/whatsapp/inbound.js";
import { phonesMatch } from "../channels/whatsapp/identity.js";

/**
 * Marca em Guest.profile que o hóspede nasceu no simulador. É o que autoriza
 * a remoção: os do seed não podem ser apagados por engano daqui.
 */
const SIMULATOR_ORIGIN = "simulator";

function isSimulatorGuest(profile: unknown): boolean {
  return (
    typeof profile === "object" &&
    profile !== null &&
    (profile as { origin?: unknown }).origin === SIMULATOR_ORIGIN
  );
}

/**
 * O resort da demo: aquele que concentra os hóspedes. Um banco de
 * desenvolvimento acumula resorts órfãos (fixture de teste que não limpou), e
 * escolher "o primeiro" faz o hóspede novo cair num resort sem configuração.
 * Empate ou banco vazio de hóspedes → o resort mais antigo, que é o do seed.
 */
async function resortDaDemo(): Promise<string | null> {
  const porResort = await prisma.guest.groupBy({
    by: ["resortId"],
    _count: { resortId: true },
    orderBy: { _count: { resortId: "desc" } },
    take: 1,
  });
  if (porResort[0]) return porResort[0].resortId;
  const maisAntigo = await prisma.resort.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return maisAntigo?.id ?? null;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

const sendBodySchema = z.object({
  /** Telefone do hóspede (o simulador o trata como o remetente do WhatsApp). */
  from: z.string().min(8),
  text: z.string().min(1).max(4000).optional(),
  /** Toque em botão de oferta: reproduz o interactive.button_reply da Cloud API. */
  button: z.object({ id: z.string(), title: z.string() }).optional(),
  /** Foto anexada (base64 puro, sem data: URI) — exercita o caminho multimodal. */
  image: z
    .object({
      base64: z.string(),
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      caption: z.string().max(500).optional(),
    })
    .optional(),
});

/**
 * Simulador do canal WhatsApp — ferramenta de teste, registrada apenas onde
 * simulatorEnabled() permite (nunca em produção por padrão).
 *
 * NÃO é um agente paralelo: a mensagem percorre o MESMO processInbound do
 * webhook real (parsing por tipo, identificação por telefone, agent-core,
 * WhatsAppAdapter). Só o transporte final muda — em vez de ir à Meta, o
 * conteúdo é capturado e devolvido, já com os cortes da Cloud API aplicados.
 * Assim dá para ver o que o hóspede receberia sem depender de entrega real.
 */
export async function simulatorRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  /** Hóspedes "discáveis": quem tem telefone cadastrado. */
  r.get("/simulator/guests", async () => {
    const guests = await prisma.guest.findMany({
      where: { phone: { not: null } },
      select: {
        id: true,
        name: true,
        phone: true,
        consentAt: true,
        profile: true,
        reservations: {
          orderBy: { checkIn: "desc" },
          take: 1,
          select: { status: true, roomNumber: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return guests.map((g) => {
      const reservation = g.reservations[0];
      return {
        name: g.name,
        phone: g.phone as string,
        roomNumber: reservation?.roomNumber ?? null,
        reservationStatus: reservation?.status ?? null,
        // Sem consentimento o agente não responde (LGPD) — a UI avisa antes.
        reachable: Boolean(g.consentAt) && Boolean(reservation) && reservation?.status !== "cancelled",
        // Só os criados aqui podem ser removidos — o trio do seed é a demo.
        removable: isSimulatorGuest(g.profile),
      };
    });
  });

  /**
   * Cria um hóspede de teste já pronto para o check-in conversacional:
   * reserva `confirmed` chegando amanhã e sem quarto, que é exatamente o
   * estado que libera complete_early_checkin.
   *
   * Existe porque o trio do seed é de uso único por jornada: depois que a Ana
   * faz o check-in ela vira `checked_in_digital` e o fluxo não roda de novo
   * sem mexer no banco.
   */
  r.post(
    "/simulator/guests",
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(2).max(80),
          phone: z.string().trim().min(8).max(20),
        }),
      },
    },
    async (request, reply) => {
      const { name, phone } = request.body;

      // O hóspede novo entra ONDE OS OUTROS ESTÃO, não num resort qualquer.
      // findFirst() sem ordenação já elegeu um fixture órfão de teste de
      // integração: o hóspede nascia num resort sem checkinExtras nem ofertas,
      // e a jornada rodava inteira sem cobrar taxa nenhuma — parecendo correta.
      const resortId = await resortDaDemo();
      if (!resortId) return reply.status(409).send({ error: "nenhum resort cadastrado — rode o seed" });

      // A identificação no WhatsApp é por telefone, e phonesMatch tolera 9º
      // dígito e DDI. Comparar por igualdade de string deixaria passar um
      // telefone equivalente, e aí resolveGuestByPhone escolheria o primeiro
      // da lista — o novo hóspede sequestraria a conversa do antigo.
      const existentes = await prisma.guest.findMany({
        where: { phone: { not: null } },
        select: { name: true, phone: true },
      });
      const conflito = existentes.find((g) => g.phone && phonesMatch(g.phone, phone));
      if (conflito) {
        return reply.status(409).send({
          error: `Este telefone já identifica ${conflito.name} (${conflito.phone}). Use outro número.`,
        });
      }

      const guest = await prisma.guest.create({
        data: {
          resortId,
          name,
          phone,
          consentAt: new Date(), // sem consentimento o agente não responderia
          profile: { origin: SIMULATOR_ORIGIN },
          reservations: {
            create: {
              resortId,
              checkIn: daysFromNow(1),
              checkOut: daysFromNow(5),
              status: "confirmed",
              plan: "all_inclusive",
              roomNumber: null,
            },
          },
        },
        select: { name: true, phone: true },
      });

      return reply.status(201).send({
        name: guest.name,
        phone: guest.phone as string,
        roomNumber: null,
        reservationStatus: "confirmed",
        reachable: true,
        removable: true,
      });
    },
  );

  /**
   * Remove um hóspede de teste e tudo que ele gerou. Recusa quem veio do seed:
   * apagar a Ana deixaria a demo sem a jornada de pré-estadia.
   */
  r.delete(
    "/simulator/guests/:phone",
    { schema: { params: z.object({ phone: z.string().min(8) }) } },
    async (request, reply) => {
      const guest = await prisma.guest.findFirst({
        where: { phone: request.params.phone },
        select: { id: true, profile: true, reservations: { select: { id: true } } },
      });
      if (!guest) return reply.status(404).send({ error: "hóspede não encontrado" });
      if (!isSimulatorGuest(guest.profile)) {
        return reply.status(403).send({ error: "só hóspedes criados no simulador podem ser removidos" });
      }

      const reservationIds = guest.reservations.map((r) => r.id);
      const conversationIds = (
        await prisma.conversation.findMany({ where: { guestId: guest.id }, select: { id: true } })
      ).map((c) => c.id);

      // Ordem importa: as folhas antes das raízes (sem cascade no schema).
      await prisma.$transaction([
        prisma.agentAction.deleteMany({ where: { conversationId: { in: conversationIds } } }),
        prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } }),
        prisma.conversation.deleteMany({ where: { guestId: guest.id } }),
        prisma.order.deleteMany({ where: { reservationId: { in: reservationIds } } }),
        prisma.serviceOrder.deleteMany({ where: { reservationId: { in: reservationIds } } }),
        prisma.roomKey.deleteMany({ where: { reservationId: { in: reservationIds } } }),
        prisma.companion.deleteMany({ where: { reservationId: { in: reservationIds } } }),
        prisma.checkinForm.deleteMany({ where: { reservationId: { in: reservationIds } } }),
        prisma.reservation.deleteMany({ where: { guestId: guest.id } }),
        prisma.guest.delete({ where: { id: guest.id } }),
      ]);

      return { removed: true };
    },
  );

  /** Envia uma mensagem como se fosse o hóspede e devolve o que sairia no aparelho. */
  r.post("/simulator/whatsapp/send", { schema: { body: sendBodySchema } }, async (request, reply) => {
    const { from, text, button, image } = request.body;
    if (!text && !button && !image) {
      return reply.status(400).send({ error: "informe text, button ou image" });
    }

    const client = new SimulatorWhatsAppClient(
      image ? { base64: image.base64, mediaType: image.mediaType } : undefined,
    );

    const message = button
      ? { from, type: "interactive", interactive: { button_reply: button } }
      : image
        ? { from, type: "image", image: { id: "sim-media", caption: image.caption ?? text } }
        : { from, type: "text", text: { body: text as string } };

    const result = await processInbound(message, client, app.log);
    return { ...result, messages: client.sent };
  });

  /**
   * Fecha a conversa aberta do hóspede: o próximo envio começa do zero, com o
   * agente sem memória do que veio antes — para rodar um cenário limpo.
   */
  r.post(
    "/simulator/whatsapp/reset",
    { schema: { body: z.object({ from: z.string().min(8) }) } },
    async (request) => {
      const auth = await resolveGuestByPhone(request.body.from);
      if (!auth) return { reset: false, reason: "hóspede não encontrado para este telefone" };
      const conversation = await repos.conversations.findOrCreateOpen(
        auth.resortId,
        auth.guestId,
        "whatsapp",
      );
      await repos.conversations.setStatus(conversation.id, "closed");
      return { reset: true };
    },
  );
}
