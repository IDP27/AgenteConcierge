/**
 * Seam de fechadura digital (mesmo princípio do ChannelAdapter): o agente
 * emite/revoga chaves por esta interface; cada fornecedor a implementa.
 * Trocar de vendor = implementar isto + apontar resort.settings.lockProvider.
 * O core não muda.
 */
export interface IssuedKey {
  /** Código/credencial que o hóspede usa (PIN no mock; handle BLE no vendor). */
  code: string;
  expiresAt: Date;
  /** true no mock: a UI avisa que é demonstração, não abre porta física. */
  isMock: boolean;
}

export interface LockAdapter {
  readonly provider: string;
  /** Provisiona uma credencial de acesso ao quarto até checkOut. */
  issueKey(params: { roomNumber: string; expiresAt: Date }): Promise<IssuedKey>;
  /** Revoga a credencial (ex.: no check-out ou troca de quarto). */
  revokeKey(code: string): Promise<void>;
}
