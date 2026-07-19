import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { syncResortKnowledge } from "./sync.js";

/** `pnpm knowledge:sync` — reingere a base de conhecimento de todos os resorts. */
const resorts = await prisma.resort.findMany({ select: { id: true, name: true } });
for (const resort of resorts) {
  const result = await syncResortKnowledge(resort.id);
  console.log(
    `✔ ${resort.name}: ${result.articles} artigos ` +
      `(${Object.entries(result.bySource)
        .map(([s, n]) => `${s}=${n}`)
        .join(", ")}) → ${result.outputPath}`,
  );
}
await prisma.$disconnect();
