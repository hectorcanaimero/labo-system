"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { HighlightedText } from "../text/HighlightedText";

type ClassValue = string | false | null | undefined;

function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

export interface PacienteAutocompleteItem {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string;
}

interface PacienteAutocompleteProps {
  onSelect: (paciente: PacienteAutocompleteItem) => void;
  className?: string;
  disabled?: boolean;
  inputClassName?: string;
  placeholder?: string;
  fetcher?: typeof fetch;
  minLength?: number;
}

const DEFAULT_PLACEHOLDER = "Buscar por nombre, apellido o cédula";
const DEFAULT_MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;

function getHighlightTerm(term: string): string {
  return term.trim().replace(/^[VE][-\s.]*/i, "");
}

function formatPacienteLabel(paciente: PacienteAutocompleteItem): string {
  return `${paciente.nombre} ${paciente.apellido}`.trim();
}

export function PacienteAutocomplete({
  onSelect,
  className,
  disabled = false,
  inputClassName,
  placeholder = DEFAULT_PLACEHOLDER,
  fetcher = fetch,
  minLength = DEFAULT_MIN_LENGTH,
}: PacienteAutocompleteProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PacienteAutocompleteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [resolvedQuery, setResolvedQuery] = useState("");

  const normalizedQuery = query.trim();
  const cedulaTerm = useMemo(() => getHighlightTerm(normalizedQuery), [normalizedQuery]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | globalThis.MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
      setActiveIndex(-1);
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setItems([]);
      setIsOpen(false);
      setIsLoading(false);
      setError(null);
      setActiveIndex(-1);
      setResolvedQuery("");
      return;
    }

    if (normalizedQuery.length < minLength) {
      setItems([]);
      setIsOpen(false);
      setIsLoading(false);
      setError(null);
      setActiveIndex(-1);
      setResolvedQuery("");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    setIsOpen(false);
    const timer = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetcher(
          `/api/pacientes/search?term=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`SEARCH_FAILED_${response.status}`);
        }

        const payload = (await response.json()) as PacienteAutocompleteItem[];
        if (requestIdRef.current !== requestId) return;

        setItems(payload);
        setIsOpen(payload.length > 0);
        setActiveIndex(payload.length > 0 ? 0 : -1);
        setResolvedQuery(normalizedQuery);
      } catch (error) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setItems([]);
        setIsOpen(false);
        setActiveIndex(-1);
        setError(error instanceof Error ? error.message : "SEARCH_FAILED");
        setResolvedQuery("");
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [disabled, fetcher, minLength, normalizedQuery]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
  }

  function handleSelect(paciente: PacienteAutocompleteItem): void {
    setQuery(formatPacienteLabel(paciente));
    setItems([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setError(null);
    setResolvedQuery("");
    onSelect(paciente);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!isOpen || items.length === 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % items.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => (current <= 0 ? items.length - 1 : current - 1));
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < items.length) {
          event.preventDefault();
          handleSelect(items[activeIndex]!);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  }

  function handleOptionMouseDown(
    event: MouseEvent<HTMLButtonElement>,
    paciente: PacienteAutocompleteItem,
  ): void {
    event.preventDefault();
    handleSelect(paciente);
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-busy={isLoading}
        aria-activedescendant={
          activeIndex >= 0 && items[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined
        }
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={() => setIsOpen(items.length > 0)}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100",
          inputClassName,
        )}
      />

      {isLoading ? (
        <div className="absolute right-3 top-2.5 text-xs text-slate-500">Buscando…</div>
      ) : null}

      {isOpen ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          <ul id={listboxId} role="listbox" className="py-1">
            {items.map((paciente, index) => {
              const highlightTerm =
                normalizedQuery.length > 0 && /^[VE]/i.test(normalizedQuery)
                  ? cedulaTerm
                  : normalizedQuery;

              return (
                <li key={paciente.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm",
                      index === activeIndex ? "bg-sky-50" : "hover:bg-slate-50",
                    )}
                    onMouseDown={(event) => handleOptionMouseDown(event, paciente)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="font-medium text-slate-900">
                      <HighlightedText
                        text={formatPacienteLabel(paciente)}
                        term={normalizedQuery}
                        markClassName="rounded bg-yellow-200 px-0.5"
                      />
                    </span>
                    <span className="text-xs text-slate-600">
                      <HighlightedText
                        text={paciente.cedula}
                        term={highlightTerm}
                        markClassName="rounded bg-yellow-200 px-0.5"
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!isOpen &&
      normalizedQuery.length >= minLength &&
      resolvedQuery === normalizedQuery &&
      !isLoading &&
      items.length === 0 &&
      !error ? (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          Sin resultados
        </div>
      ) : null}

      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          No se pudo completar la búsqueda.
        </p>
      ) : null}
    </div>
  );
}
