import { highlight } from "@labo/lib/highlight";

interface HighlightedTextProps {
  text: string;
  term: string;
  className?: string;
  markClassName?: string;
}

export function HighlightedText({
  text,
  term,
  className,
  markClassName = "bg-yellow-200",
}: HighlightedTextProps) {
  const { parts } = highlight(text, term);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className={markClassName}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}
