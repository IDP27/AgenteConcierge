import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool } from "../types.js";

const AGENDA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../data/agenda",
);

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const agendaSchema = z.object({
  entries: z.array(
    z.object({
      title: z.string(),
      time: z.string(),
      location: z.string(),
      audience: z.enum(["kids", "adults", "all"]),
      days: z.array(z.enum(WEEKDAYS)),
    }),
  ),
});

/** Dia da semana no fuso do resort (data YYYY-MM-DD ancorada ao meio-dia UTC). */
export function weekdayFor(date: string, timeZone: string): (typeof WEEKDAYS)[number] {
  const d = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
    .format(d)
    .toLowerCase()
    .slice(0, 3);
  return (WEEKDAYS as readonly string[]).includes(name)
    ? (name as (typeof WEEKDAYS)[number])
    : "sun";
}

/**
 * Programação do resort por dia — o "o que tem para fazer hoje?" respondido
 * na hora, filtrado por dia da semana e público (a agenda estática do site
 * vira conversa contextual).
 */
export const getDailySchedule = defineTool({
  name: "get_daily_schedule",
  description:
    "Consulta a programação de atividades do resort para um dia. Use quando o hóspede " +
    "perguntar o que tem para fazer (hoje/amanhã/no sábado), pedir sugestões de atividades ou " +
    "programação infantil. Filtre por audience quando fizer sentido (kids para famílias). " +
    "Apresente só os horários relevantes — não despeje a lista inteira sem contexto.",
  inputSchema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Dia desejado (YYYY-MM-DD). Sem valor = hoje."),
    audience: z
      .enum(["kids", "adults", "all"])
      .optional()
      .describe("Filtra por público: kids, adults, ou all para tudo"),
  }),
  handler: async (input, ctx) => {
    let raw: string;
    try {
      raw = await readFile(resolve(AGENDA_DIR, `${ctx.resort.id}.json`), "utf-8");
    } catch {
      return {
        output: {
          entries: [],
          info: "Este resort ainda não tem programação cadastrada — sugira falar com a recepção.",
        },
      };
    }

    const agenda = agendaSchema.parse(JSON.parse(raw));
    const date = input.date ?? ctx.now.toLocaleDateString("en-CA", {
      timeZone: ctx.resort.settings.timezone,
    });
    const weekday = weekdayFor(date, ctx.resort.settings.timezone);

    const entries = agenda.entries
      .filter((e) => e.days.includes(weekday))
      .filter((e) => !input.audience || input.audience === "all" || e.audience === input.audience || e.audience === "all")
      .sort((a, b) => a.time.localeCompare(b.time))
      .map(({ title, time, location, audience }) => ({ title, time, location, audience }));

    return {
      output: {
        date,
        weekday,
        entries,
        info:
          entries.length === 0
            ? "Nenhuma atividade programada para esse dia/público."
            : "Apresente de forma leve, destacando 2-4 itens mais relevantes para o perfil do hóspede.",
      },
    };
  },
});
