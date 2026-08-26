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

type ClassValue = string | false | null | undefined;

function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

export interface ExamenAutocompleteItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  activo: boolean;
}

interface ExamenAutocompleteProps {
  onSelect: (examen: ExamenAutocompleteItem) => void;
  selectedIds?: string[];
  autoFocusOnSelect?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  fetcher?: typeof fetch;
  minLength?: number;
  debounceMs?: number;
}

const DEFAULT_PLACEHOLDER = "Buscar examen por nombre";
const DEFAULT_MIN_LENGTH = 2;
const DEFAULT_DEBOUNCE_MS = 250;

function formatPrecio(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function ExamenAutocomplete({
  onSelect,
  selectedIds = [],
  autoFocusOnSelect = false,
  className,
  inputClassName,
  placeholder = DEFAULT_PLACEHOLDER,
  disabled = false,
  fetcher = fetch,
  minLength = DEFAULT_MIN_LENGTH,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: ExamenAutocompleteProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExamenAutocompleteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [resolvedQuery, setResolvedQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedQuery = query.trim();

  const isSelected = (id: string): boolean => selectedSet.has(id);

  function firstEnabledIndex(list: ExamenAutocompleteItem[]): number {
    return list.findIndex((item) => !isSelected(item.id));
  }

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
          `/api/examenes?term=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`SEARCH_FAILED_${response.status}`);
        }

        const payload = (await response.json()) as ExamenAutocompleteItem[];
        if (requestIdRef.current !== requestId) return;

        setItems(payload);
        setIsOpen(payload.length > 0);
        setActiveIndex(firstEnabledIndex(payload));
        setResolvedQuery(normalizedQuery);
      } catch (err) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setItems([]);
        setIsOpen(false);
        setActiveIndex(-1);
        setError(err instanceof Error ? err.message : "SEARCH_FAILED");
        setResolvedQuery("");
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [disabled, fetcher, minLength, normalizedQuery, debounceMs]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
  }

  function selectItem(examen: ExamenAutocompleteItem): void {
    if (isSelected(examen.id)) {
      return;
    }

    onSelect(examen);
    setQuery("");
    setItems([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setError(null);
    setResolvedQuery("");

    if (autoFocusOnSelect) {
      inputRef.current?.focus();
    }
  }

  function moveActive(direction: 1 | -1): void {
    const length = items.length;
    if (length === 0) {
      return;
    }

    let next = activeIndex;
    for (let step = 0; step < length; step++) {
      next = (next + direction + length) % length;
      const item = items[next];
      if (item && !isSelected(item.id)) {
        setActiveIndex(next);
        return;
      }
    }

    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!isOpen || items.length === 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < items.length) {
          const item = items[activeIndex];
          if (item && !isSelected(item.id)) {
            event.preventDefault();
            selectItem(item);
          }
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

  function handleOptionClick(
    event: MouseEvent<HTMLButtonElement>,
    examen: ExamenAutocompleteItem,
  ): void {
    event.preventDefault();
    selectItem(examen);
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-busy={isLoading}
        aria-activedescendant={
          activeIndex >= 0 && items[activeIndex]
            ? `${listboxId}-option-${activeIndex}`
            : undefined
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
            {items.map((examen, index) => {
              const alreadyAdded = isSelected(examen.id);

              return (
                <li
                  key={examen.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={alreadyAdded}
                >
                  <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                      alreadyAdded
                        ? "cursor-not-allowed bg-slate-50"
                        : index === activeIndex
                          ? "bg-sky-50"
                          : "hover:bg-slate-50",
                    )}
                    onClick={(event) => handleOptionClick(event, examen)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span
                        className={cn(
                          "truncate font-medium",
                          alreadyAdded ? "text-slate-400" : "text-slate-900",
                        )}
                      >
                        {examen.nombre}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          alreadyAdded ? "text-slate-300" : "text-slate-500",
                        )}
                      >
                        {formatPrecio(examen.precio_usd)}
                        {examen.unidad ? ` · ${examen.unidad}` : ""}
                      </span>
                    </span>
                    {alreadyAdded ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Ya agregado
                      </span>
                    ) : null}
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
