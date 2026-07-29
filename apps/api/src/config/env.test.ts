import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * O simulador conversa como QUALQUER hóspede sem autenticação: o gate é uma
 * fronteira de segurança, não conveniência. E agora tem dois consumidores — a
 * registragem da rota em app.ts e o link do launcher (via /api/health), que lê
 * o flag para não oferecer uma ferramenta de personificação em produção.
 *
 * env.ts faz o parse no carregamento do módulo, então cada caso precisa de
 * resetModules + import dinâmico para reavaliar o ambiente.
 */
async function loadSimulatorEnabled(vars: Record<string, string | undefined>): Promise<boolean> {
  vi.resetModules();
  // Mínimo para o schema passar sem depender do .env da máquina.
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5433/db");
  vi.stubEnv("ADMIN_API_KEY", "test-admin-key");
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value as string);
  const mod = await import("./env.js");
  return mod.simulatorEnabled();
}

describe("simulatorEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("ligado fora de produção (dev/demo local)", async () => {
    const enabled = await loadSimulatorEnabled({
      NODE_ENV: "development",
      SIMULATOR_ENABLED: undefined,
    });
    expect(enabled).toBe(true);
  });

  it("DESLIGADO em produção quando a variável não é declarada", async () => {
    const enabled = await loadSimulatorEnabled({
      NODE_ENV: "production",
      SIMULATOR_ENABLED: undefined,
    });
    expect(enabled).toBe(false);
  });

  it("em produção só liga com opt-in explícito (staging de demonstração)", async () => {
    const enabled = await loadSimulatorEnabled({
      NODE_ENV: "production",
      SIMULATOR_ENABLED: "true",
    });
    expect(enabled).toBe(true);
  });

  it("SIMULATOR_ENABLED=false vence o ambiente de dev", async () => {
    const enabled = await loadSimulatorEnabled({
      NODE_ENV: "development",
      SIMULATOR_ENABLED: "false",
    });
    expect(enabled).toBe(false);
  });
});
