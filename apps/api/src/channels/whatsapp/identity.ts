import { createHmac, timingSafeEqual } from "node:crypto";

/** Só dígitos: "+55 (11) 98888-0001" → "5511988880001". */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Reduz um número à forma canônica BR, tratando o 9º dígito OPCIONAL dos
 * celulares: 55(país) + DDD(2) + [9] + assinante(8). Remove o "9" quando
 * presente, para que as formas com/sem o nono dígito colidam. Números fora
 * do padrão nacional BR voltam sem alteração.
 */
function canonicalBrPhone(digits: string): string {
  let d = digits;
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); // remove o código do país
  // Celular BR nacional = DDD(2) + 9 + assinante(8) = 11 dígitos com "9" no 3º.
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

/**
 * Telefones batem se representam o mesmo assinante. Trata duas variações que
 * quebram a comparação ingênua: o código do país (com/sem 55) e o 9º dígito
 * opcional dos celulares brasileiros — o WhatsApp entrega o wa_id SEM o 9,
 * enquanto o cadastro costuma tê-lo COM o 9. Fallback por sufixo de 10 dígitos
 * para números fora do padrão BR.
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (canonicalBrPhone(na) === canonicalBrPhone(nb)) return true;
  if (na.length < 10 || nb.length < 10) return na === nb;
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
