import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">🏝️ Agente Concierge</h1>
      <p className="text-slate-600">
        MVP em construção. O widget do hóspede (<code>/chat</code>) e o painel admin (
        <code>/admin</code>) chegam na Fase 4.
      </p>
      <div className="flex gap-4 text-sm">
        <Link className="rounded-lg bg-cyan-700 px-4 py-2 text-white" href="/chat?token=tok-bruno">
          Widget (em breve)
        </Link>
        <Link className="rounded-lg border border-slate-300 px-4 py-2" href="/admin">
          Admin (em breve)
        </Link>
      </div>
    </main>
  );
}
