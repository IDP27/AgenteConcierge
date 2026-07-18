import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { z } from "zod";

// .env vive na raiz do monorepo (nunca commitado — ver .env.example).
const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");
loadDotenv({ path: rootEnvPath });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3333),
  DATABASE_URL: z.string().url(),
  ADMIN_API_KEY: z.string().min(8),
  // Obrigatória apenas quando o motor do agente é usado (Fase 2+);
  // o healthcheck e o painel funcionam sem ela.
  ANTHROPIC_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
