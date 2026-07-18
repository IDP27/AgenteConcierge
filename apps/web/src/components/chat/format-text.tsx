/**
 * Renderiza negrito básico (**texto**) do markdown que o modelo produz nas
 * respostas — sem trazer uma lib de markdown inteira para uma bolha de chat.
 * Qualquer outro caractere de markdown é mantido como texto literal.
 */
export function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
