import { createHmac, timingSafeEqual } from "node:crypto";

/** Só dígitos: "+55 (11) 98888-0001" → "5511988880001". */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Telefones batem se um for sufixo do outro (≥ 10 dígitos): cobre a variação
 * com/sem código do país e o 9º dígito BR sem tabela de regras por país.
 */
export function phonesMatch(a: string, b: string): boolean {
  const [na, nb] = [normalizePhone(a), normalizePhone(b)];
  if (na.length < 10 || nb.length < 10) return na === nb && na.length > 0;
  return na.endsWith(nb.slice(-10)) && nb.endsWith(na.slice(-10));
}

/** Assinatura do webhook da Meta: X-Hub-Signature-256 = HMAC-SHA256(appSecret, rawBody). */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice(7);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}
