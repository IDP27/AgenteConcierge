/**
 * Cliente ViaCEP (API pública, sem chave): CEP → endereço.
 * Degradação graciosa: qualquer falha (timeout, CEP inexistente, API fora)
 * devolve null e o agente coleta o endereço manualmente na conversa.
 */
export interface CepAddress {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const VIACEP_TIMEOUT_MS = 3000;

export async function lookupCep(rawCep: string): Promise<CepAddress | null> {
  const cep = rawCep.replace(/\D/g, "");
  if (cep.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (body.erro) return null;
    return {
      logradouro: body.logradouro ?? "",
      bairro: body.bairro ?? "",
      cidade: body.localidade ?? "",
      estado: body.uf ?? "",
    };
  } catch {
    return null;
  }
}
