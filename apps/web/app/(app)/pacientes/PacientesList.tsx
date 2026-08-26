"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";
import { EmptyState, SkeletonTable } from "@labo/ui/feedback";
import { ExportButton } from "@labo/ui/exports/ExportButton";
import { calcularEdadDesglosada } from "@labo/lib/edad";

import {
  PacienteFormDialog,
  type PacienteSerializable,
} from "./PacienteFormDialog";

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

        const response = await fetch(`/api/pacientes?page=${page}&limit=${pageSize}`, {
          headers: { accept: "application/json" },
        });

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (response.status === 403) {
          window.location.href = "/dashboard?reason=sin-permisos";
          return;
        }
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

        const response = await fetch(
          `/api/pacientes/search?term=${encodeURIComponent(debouncedSearchTerm)}`,
          {
            headers: { accept: "application/json" },
            signal: controller.signal,
          },
        );

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (response.status === 403) {
          window.location.href = "/dashboard?reason=sin-permisos";
          return;
        }
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
    const response = await fetch(`/api/pacientes?page=${nextPage}&limit=${pageSize}`, {
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
      const response = await fetch(`/api/pacientes/${paciente.id}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (response.status === 403) {
        window.location.href = "/dashboard?reason=sin-permisos";
        return;
      }
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground/70" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre, apellido o cédula"
            className="flex h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {loadingSearch ? (
            <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ExportButton actionName="pacientes" filters={{ term: debouncedSearchTerm }} />
          <Button type="button" onClick={() => setIsCreateOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nuevo paciente
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-card shadow-sm">
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
                  <Button type="button" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Nuevo paciente
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Paciente</th>
                    <th className="px-4 py-3 font-medium">Cédula</th>
                    <th className="px-4 py-3 font-medium">Nacimiento</th>
                    <th className="px-4 py-3 font-medium">Edad</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleItems.map((paciente) => (
                    <tr key={paciente.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <Link
                            href={`/pacientes/${paciente.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {paciente.nombre} {paciente.apellido}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            Ficha clínica e historial
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{paciente.cedula}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(paciente.fecha_nacimiento)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {(() => {
                          const info = calcularEdadDesglosada(new Date(paciente.fecha_nacimiento));
                          if (!info) return "N/A";
                          const isPediatric = info.anos < 18;
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              <span>{info.textoFormateado}</span>
                              {isPediatric && (
                                <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                  {info.etapa.toUpperCase()}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingPaciente(paciente)}
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </Button>
                          {!isSearching ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleDeactivate(paciente)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Desactivar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isSearching ? (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando página <span className="font-medium text-foreground">{data.page}</span>
                  {data.totalPages > 0 ? (
                    <>
                      {" "}de <span className="font-medium text-foreground">{data.totalPages}</span>
                    </>
                  ) : null}
                  {" · "}
                  <span className="font-medium text-foreground">{data.total}</span> pacientes
                </p>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loadingList}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.totalPages === 0 || page >= data.totalPages || loadingList}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
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
