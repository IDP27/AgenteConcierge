/**
 * Validação de CPF por dígitos verificadores — determinística, no código.
 * O modelo nunca decide se um documento é válido.
 */
export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (sliceEnd: number): number => {
    const sum = cpf
      .slice(0, sliceEnd)
      .split("")
      .reduce((acc, ch, i) => acc + Number(ch) * (sliceEnd + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Normaliza para o formato 000.000.000-00 (assume CPF já validado). */
export function formatCpf(raw: string): string {
  const cpf = raw.replace(/\D/g, "");
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
