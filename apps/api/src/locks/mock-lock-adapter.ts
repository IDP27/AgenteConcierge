import { randomInt } from "node:crypto";
import type { IssuedKey, LockAdapter } from "./lock-adapter.js";

/**
 * Fechadura de demonstração: gera um PIN de 6 dígitos e registra no log — NÃO
 * abre porta física. É o seam para provar o fluxo ponta a ponta; em produção,
 * SaltoAdapter/AssaAbloyAdapter provisionam a credencial real na mesma interface.
 */
export class MockLockAdapter implements LockAdapter {
  readonly provider = "mock";

  async issueKey(params: { roomNumber: string; expiresAt: Date }): Promise<IssuedKey> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    console.info(
      `[MockLock] chave provisionada p/ quarto ${params.roomNumber} ` +
        `(validade ${params.expiresAt.toISOString()}) — fechadura simulada, não abre porta física`,
    );
    return { code, expiresAt: params.expiresAt, isMock: true };
  }

  async revokeKey(code: string): Promise<void> {
    console.info(`[MockLock] chave ${code} revogada (simulado)`);
  }
}
