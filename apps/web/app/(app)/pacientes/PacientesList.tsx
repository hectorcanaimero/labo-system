"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/layout/Pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toHumanError } from "@labo/lib/error-messages";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";
import { ExportButton } from "@labo/ui/exports/ExportButton";
import { calcularEdadDesglosada } from "@labo/lib/edad";

import {
  PacienteFormDialog,
  type PacienteSerializable,
} from "./PacienteFormDialog";

import { apiFetch } from "@/lib/api-client";
export interface PaginatedPacientesResponse {
  items: PacienteSerializable[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SearchPacienteItem {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string;
}

interface PacientesListProps {
  initialData: PaginatedPacientesResponse;
  pageSize: number;
}

const SEARCH_DEBOUNCE_MS = 300;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatSexo(sexo: "M" | "F" | "O" | null | undefined): string {
  if (sexo === "M") return "Masculino";
  if (sexo === "F") return "Femenino";
  if (sexo === "O") return "Otro";
  return "—";
}

async function readApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(payload?.error ?? "ERROR_GENERICO");
}

export function PacientesList({ initialData, pageSize }: PacientesListProps) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(initialData.page);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPacienteItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // `?nuevo=1` (paleta de comandos / atajo P) abre el formulario directo.
  useEffect(() => {
    if (searchParams.get("nuevo") === "1") {
      setIsCreateOpen(true);
      router.replace("/pacientes", { scroll: false });
    }
  }, [router, searchParams]);
  const [editingPaciente, setEditingPaciente] = useState<PacienteSerializable | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (debouncedSearchTerm.length > 0) {
      return;
    }

    let cancelled = false;

    async function loadPage(): Promise<void> {
      if (page === initialData.page) {
        setData(initialData);
        return;
      }

      try {
        setLoadingList(true);
        setErrorMessage(null);

        const response = await apiFetch(`/api/pacientes?page=${page}&limit=${pageSize}`, {
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          throw await readApiError(response);
        }

        const payload = (await response.json()) as PaginatedPacientesResponse;
        if (cancelled) return;
        setData(payload);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(toHumanError(error));
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchTerm, initialData, page, pageSize]);

  useEffect(() => {
    if (debouncedSearchTerm.length === 0) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function search(): Promise<void> {
      try {
        setLoadingSearch(true);
        setErrorMessage(null);

        const response = await apiFetch(
          `/api/pacientes/search?term=${encodeURIComponent(debouncedSearchTerm)}`,
          {
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw await readApiError(response);
        }

        const payload = (await response.json()) as SearchPacienteItem[];
        if (cancelled) return;
        setSearchResults(payload);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setErrorMessage(toHumanError(error));
      } finally {
        if (!cancelled) {
          setLoadingSearch(false);
        }
      }
    }

    void search();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearchTerm]);

  const isSearching = debouncedSearchTerm.length > 0;
  const visibleItems = useMemo(() => {
    if (isSearching) {
      return searchResults.map((item) => ({
        ...item,
        created_at: item.fecha_nacimiento,
        updated_at: item.fecha_nacimiento,
        activo: true,
        sexo: null,
        telefono: null,
        email: null,
        direccion: null,
      })) as PacienteSerializable[];
    }
    return data.items;
  }, [data.items, isSearching, searchResults]);

  async function refreshCurrentPage(nextPage = page): Promise<void> {
    const response = await apiFetch(`/api/pacientes?page=${nextPage}&limit=${pageSize}`, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw await readApiError(response);
    }

    const payload = (await response.json()) as PaginatedPacientesResponse;
    setData(payload);
    setPage(payload.page);
  }

  async function handleDeactivate(paciente: PacienteSerializable): Promise<void> {
    const confirmed = window.confirm(
      `¿Seguro que querés desactivar a ${paciente.nombre} ${paciente.apellido}?`,
    );

    if (!confirmed) return;

    try {
      setErrorMessage(null);
      const response = await apiFetch(`/api/pacientes/${paciente.id}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw await readApiError(response);
      }

      if (isSearching) {
        setSearchResults((current) => current.filter((item) => item.id !== paciente.id));
      }

      const nextPage = data.items.length === 1 && page > 1 ? page - 1 : page;
      await refreshCurrentPage(nextPage);
    } catch (error) {
      setErrorMessage(toHumanError(error));
    }
  }

  const showEmptyState = !loadingList && !loadingSearch && visibleItems.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar densa */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre, apellido o cédula…"
            className="flex h-8 w-full rounded-md border border-input bg-card py-1 pl-8 pr-8 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {loadingSearch ? (
            <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ExportButton actionName="pacientes" filters={{ term: debouncedSearchTerm }} />
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nuevo paciente
            <kbd className="ml-1 hidden border-primary-foreground/30 bg-transparent text-primary-foreground/70 sm:inline-flex">P</kbd>
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        {loadingList && !isSearching ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={5} />
          </div>
        ) : showEmptyState ? (
          <div className="p-6">
            <EmptyState
              title={isSearching ? "No encontramos pacientes" : "Sin pacientes"}
              description={
                isSearching
                  ? "Probá con otro nombre o cédula. Apenas limpies la búsqueda vuelve la lista completa."
                  : "Todavía no hay fichas registradas. Creá la primera y arrancamos bien, sin vueltas."
              }
              icon={<UserRound className="h-6 w-6" />}
              action={
                !isSearching ? (
                  <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Nuevo paciente
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 py-1.5">Paciente</TableHead>
                  <TableHead className="h-9 py-1.5">Cédula</TableHead>
                  <TableHead className="h-9 py-1.5">Nacimiento</TableHead>
                  <TableHead className="h-9 py-1.5">Sexo</TableHead>
                  <TableHead className="h-9 py-1.5">Edad</TableHead>
                  <TableHead className="h-9 w-9 py-1.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((paciente) => {
                  const info = calcularEdadDesglosada(new Date(paciente.fecha_nacimiento));
                  const isPediatric = info && info.anos < 18;
                  return (
                    <TableRow
                      key={paciente.id}
                      className="group h-9 cursor-pointer"
                      onClick={() => router.push(`/pacientes/${paciente.id}`)}
                    >
                      <TableCell className="py-1.5 font-medium text-foreground">
                        <Link
                          href={`/pacientes/${paciente.id}`}
                          className="focus-visible:underline focus-visible:outline-none"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {paciente.nombre} {paciente.apellido}
                        </Link>
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {paciente.cedula}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDate(paciente.fecha_nacimiento)}
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {formatSexo(paciente.sexo)}
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {info ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{info.textoFormateado}</span>
                            {isPediatric ? (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                {info.etapa}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                              aria-label="Acciones"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem asChild>
                              <Link href={`/pacientes/${paciente.id}`}>
                                <UserRound className="h-4 w-4" />
                                Ver ficha
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingPaciente(paciente)}>
                              <PencilLine className="h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            {!isSearching ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => void handleDeactivate(paciente)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Desactivar
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {!isSearching ? (
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                label="pacientes"
                disabled={loadingList}
                onPageChange={setPage}
              />
            ) : (
              <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                Resultados rápidos: {searchResults.length} paciente{searchResults.length === 1 ? "" : "s"}.
              </div>
            )}
          </>
        )}
      </div>

      <PacienteFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={async () => {
          setSearchTerm("");
          setDebouncedSearchTerm("");
          setSearchResults([]);
          await refreshCurrentPage(1);
        }}
      />

      <PacienteFormDialog
        paciente={editingPaciente}
        open={editingPaciente !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPaciente(null);
          }
        }}
        onSaved={async (paciente) => {
          setEditingPaciente(null);
          setData((current) => ({
            ...current,
            items: current.items.map((item) => (item.id === paciente.id ? paciente : item)),
          }));
          setSearchResults((current) =>
            current.map((item) =>
              item.id === paciente.id
                ? {
                    id: paciente.id,
                    nombre: paciente.nombre,
                    apellido: paciente.apellido,
                    cedula: paciente.cedula,
                    fecha_nacimiento: paciente.fecha_nacimiento,
                  }
                : item,
            ),
          );
          await refreshCurrentPage(page);
        }}
        onDeleted={async () => {
          const deletedId = editingPaciente?.id;
          setEditingPaciente(null);
          if (deletedId) {
            setSearchResults((current) => current.filter((item) => item.id !== deletedId));
          }
          const nextPage = data.items.length === 1 && page > 1 ? page - 1 : page;
          await refreshCurrentPage(nextPage);
        }}
      />
    </div>
  );
}
