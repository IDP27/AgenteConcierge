import Link from "next/link";
import { API_URL } from "@/lib/api";

const DEMO_GUESTS = [
  { token: "tok-ana", name: "Ana Souza", state: "Chega amanhã · pré-estadia" },
  { token: "tok-bruno", name: "Bruno Lima", state: "Hospedado · quarto 204" },
  { token: "tok-carla", name: "Carla Mendes", state: "Saiu ontem · pós-estadia" },
];

const EYEBROW = "text-[10px] font-extrabold uppercase tracking-[0.14em]";

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
    <div className="min-h-dvh bg-paper text-ink">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
        <header>
          <span className={`${EYEBROW} text-vermilion`}>Resort Paraíso</span>
          <h1 className="mt-1 text-4xl font-extrabold leading-[1.05] tracking-tight">
            Agente
            <br />
            Concierge
          </h1>
          <p className="mt-3 border-t border-linework pt-3 text-sm text-neutral-600">
            Concierge conversacional para hóspedes e equipe, em WhatsApp e web.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <span className={`${EYEBROW} text-neutral-600`}>Widget do hóspede</span>
          {DEMO_GUESTS.map((g) => (
            <Link
              key={g.token}
              href={`/chat?token=${g.token}`}
              className="rounded-sm border border-linework bg-white px-4 py-3 hover:border-ink"
            >
              <span className="block text-sm font-bold">{g.name}</span>
              <span className="mt-0.5 block text-xs text-neutral-600">{g.state}</span>
            </Link>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <span className={`${EYEBROW} text-neutral-600`}>Equipe</span>
          <Link
            href="/admin"
            className="rounded-sm bg-ink px-4 py-3 text-center text-sm font-bold text-white hover:bg-ink/85"
          >
            Painel do resort
          </Link>
        </section>

        {showSimulator && (
          <section className="flex flex-col gap-2">
            <span className={`${EYEBROW} text-neutral-600`}>Ferramentas de teste</span>
            <Link
              href="/simulador"
              className="rounded-sm border border-linework bg-white px-4 py-3 hover:border-ink"
            >
              <span className="block text-sm font-bold">Simulador de WhatsApp</span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                Conversa como o hóspede, pelo mesmo caminho do webhook real
              </span>
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
