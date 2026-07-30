import Link from "next/link";
import { API_URL } from "@/lib/api";

/**
 * Entradas nomeadas pela ETAPA da jornada, não pelo hóspede. Para quem não
 * conhece a demo, "Ana, Bruno, Carla" não diz nada; "pré / em / pós-estadia"
 * mostra que o mesmo agente cobre a estadia inteira. O nome fica como
 * metadado — ainda serve a quem conduz a demonstração.
 */
const JOURNEY = [
  { token: "tok-ana", stage: "Pré-estadia", detail: "Chega amanhã · Ana Souza" },
  { token: "tok-bruno", stage: "Em estadia", detail: "Quarto 204 · Bruno Lima" },
  { token: "tok-carla", stage: "Pós-estadia", detail: "Saiu ontem · Carla Mendes" },
];

const PANEL_SECTIONS = "Reservas · Aprovações · Ordens de serviço · Ofertas";

const EYEBROW = "text-[10px] font-extrabold uppercase tracking-[0.14em]";
const DOOR = "rounded-sm border border-linework bg-white p-4";

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
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
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

        <section className={DOOR}>
          <span className={`${EYEBROW} text-neutral-600`}>Hóspede</span>
          <p className="mt-1.5 text-xs text-neutral-600">
            Um agente para a estadia inteira. Entre por qualquer etapa.
          </p>
          <div className="mt-3 flex flex-col">
            {JOURNEY.map((j) => (
              <Link
                key={j.token}
                href={`/chat?token=${j.token}`}
                className="group border-t border-linework py-2.5 first:border-t-0 last:pb-0"
              >
                <span className="block text-sm font-bold group-hover:text-vermilion">
                  {j.stage}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-600">{j.detail}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={DOOR}>
          <span className={`${EYEBROW} text-neutral-600`}>Equipe</span>
          <p className="mt-1.5 text-xs text-neutral-600">{PANEL_SECTIONS}</p>
          <Link
            href="/admin"
            className="mt-3 block rounded-sm bg-ink px-4 py-3 text-center text-sm font-bold text-white hover:bg-ink/85"
          >
            Painel do resort
          </Link>
        </section>

        {showSimulator && (
          <section className="flex flex-col gap-2">
            <span className={`${EYEBROW} text-neutral-600`}>Ferramentas de teste</span>
            {/* Sem preenchimento e com traço interrompido: não é um terceiro
                público, é ferramenta interna. Mesmo idioma do painel. */}
            <Link
              href="/simulador"
              className="rounded-sm border border-dashed border-linework px-4 py-3 hover:border-ink"
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
