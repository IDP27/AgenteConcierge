"use client";

import { useState } from "react";

export interface ReviewPromptCardData {
  guestName?: string;
}
export interface ReviewLinkCardData {
  url: string;
  rating: number;
}

function Stars({
  value,
  onSelect,
  onHover,
  size = "text-3xl",
}: {
  value: number;
  onSelect?: (n: number) => void;
  onHover?: (n: number) => void;
  size?: string;
}) {
  return (
    <div className="flex gap-1" onMouseLeave={() => onHover?.(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <span className={`${size} leading-none ${filled ? "text-vermilion" : "text-linework"}`}>
            {filled ? "★" : "☆"}
          </span>
        );
        return onSelect ? (
          <button
            key={n}
            type="button"
            aria-label={`Dar nota ${n} de 5`}
            className="transition-transform hover:scale-110"
            onMouseEnter={() => onHover?.(n)}
            onClick={() => onSelect(n)}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

/**
 * Card interativo de avaliação (pós-estadia). Ao enviar, colapsa para o
 * resumo somente-leitura e devolve a nota como mensagem do hóspede — é ela
 * que dispara request_review no agente.
 */
export function ReviewPromptCard({
  onSubmit,
  disabled,
}: {
  onSubmit: (rating: number, comment: string) => void;
  disabled: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState<number | null>(null);

  if (sent !== null) {
    return (
      <div className="max-w-[88%] self-end rounded-sm border border-linework bg-white px-4 py-3">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
          Sua avaliação
        </span>
        <div className="mt-1 flex items-center gap-2">
          <Stars value={sent} size="text-xl" />
          <span className="text-sm font-extrabold">{sent}/5</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[88%] rounded-sm border border-linework bg-white p-4">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
        Sua avaliação
      </span>
      <div className="mt-2">
        <Stars value={hover || rating} onSelect={setRating} onHover={setHover} />
      </div>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
        Toque em uma estrela para dar sua nota
      </p>

      <label className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-neutral-600">
        Quer contar o que achou? (opcional)
      </label>
      <textarea
        className="mt-1 w-full resize-none rounded-sm border border-linework bg-white px-3 py-2 text-sm outline-none focus:border-ink"
        rows={2}
        maxLength={500}
        placeholder="Escreva aqui…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <button
        type="button"
        className="mt-3 w-full rounded-sm bg-vermilion px-4 py-2.5 text-sm font-bold text-white hover:bg-vermilion/90 disabled:bg-neutral-200 disabled:text-neutral-400"
        disabled={rating === 0 || disabled}
        onClick={() => {
          setSent(rating);
          onSubmit(rating, comment.trim());
        }}
      >
        Enviar avaliação
      </button>
    </div>
  );
}

/** Convite à avaliação pública — só aparece para hóspede satisfeito. */
export function ReviewLinkCard({ data }: { data: ReviewLinkCardData }) {
  return (
    <div className="max-w-[88%] rounded-sm border border-linework bg-white p-4">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-vermilion">
        Avaliação pública
      </span>
      <p className="mt-1 text-sm text-neutral-700">
        Se quiser, compartilhe sua experiência com outros viajantes deixando uma avaliação no
        Google.
      </p>
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-sm bg-vermilion px-4 py-2.5 text-sm font-bold text-white hover:bg-vermilion/90"
      >
        Avaliar no Google ↗
      </a>
    </div>
  );
}
