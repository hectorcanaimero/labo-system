export interface HighlightPart {
  text: string;
  match: boolean;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlight(text: string, term: string): { parts: HighlightPart[] } {
  if (!term || !text) {
    return { parts: [{ text, match: false }] };
  }

  const escaped = escapeRegex(term);
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts: HighlightPart[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), match: false });
    }
    parts.push({ text: match[1], match: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), match: false });
  }

  if (parts.length === 0) {
    return { parts: [{ text, match: false }] };
  }

  return { parts };
}
