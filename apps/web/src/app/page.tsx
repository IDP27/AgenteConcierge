import Link from "next/link";
import { API_URL } from "@/lib/api";

const DEMO_GUESTS = [
  { token: "tok-ana", label: "Ana — chega amanhã (pré-estadia)" },
  { token: "tok-bruno", label: "Bruno — hospedado (quarto 204)" },
  { token: "tok-carla", label: "Carla — saiu ontem (pós-estadia)" },
];

/**
 * O simulador só aparece quando o backend o registrou. Falha (API fora do ar,
 * resposta estranha) esconde o link: o padrão seguro é não convidar para uma
 * ferramenta que conversa como qualquer hóspede sem autenticação.
 */
async function simulatorAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return (body as { simulator?: boolean }).simulator === true;
  } catch {
    return false;
  }
}

export default async function Home() {
  const showSimulator = await simulatorAvailable();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🏝️ Agente Concierge</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Concierge virtual do Resort Paraíso — demo do MVP
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Widget do hóspede
        </span>
        {DEMO_GUESTS.map((g) => (
          <Link
            key={g.token}
            href={`/chat?token=${g.token}`}
            className="rounded-lg border bg-white px-4 py-3 text-sm shadow-sm hover:border-cyan-600"
          >
            💬 {g.label}
          </Link>
        ))}
      </div>

      <div className="flex w-full flex-col gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Equipe</span>
        <Link
          href="/admin"
          className="rounded-lg bg-cyan-800 px-4 py-3 text-center text-sm font-medium text-white hover:bg-cyan-900"
        >
          Painel do resort
        </Link>
      </div>

      {showSimulator && (
        <div className="flex w-full flex-col gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Ferramentas de teste
          </span>
          <Link
            href="/simulador"
            className="rounded-lg border bg-white px-4 py-3 text-sm shadow-sm hover:border-cyan-600"
          >
            📱 Simulador de WhatsApp
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Conversa como o hóspede, pelo mesmo caminho do webhook real
            </span>
          </Link>
        </div>
      )}
    </main>
  );
}
