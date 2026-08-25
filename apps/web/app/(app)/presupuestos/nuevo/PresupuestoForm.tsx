"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgePercent,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";
import { formatBs, formatUsd } from "@labo/lib/bs-format";
import { calcularTotales } from "@labo/lib/calcular-totales";
import { CargarPaqueteButton, type PaqueteExamen } from "@labo/ui/paquetes/CargarPaqueteButton";
import {
  PacienteAutocomplete,
  type PacienteAutocompleteItem,
} from "@labo/ui/pacientes/PacienteAutocomplete";
import { StaleTasaBadge } from "@labo/ui/tasa/StaleTasaBadge";

type PresupuestoMode = "create" | "edit";
type EstadoPresupuesto = "Borrador" | "Aprobado" | "Convertido";

interface ExamenCatalogoItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  activo: boolean;
}

interface PresupuestoLineaForm {
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
}

interface PresupuestoFormInitialData {
  id: string;
  paciente_id: string | null;
  paciente_nombre_libre: string | null;
  paciente_nombre: string | null;
  paciente_apellido: string | null;
  descuento_pct: number;
  ganancia_pct: number;
  tasa_bs: number;
  estado: EstadoPresupuesto;
  lineas: Array<{
    examen_id: string;
    nombre_snap: string;
    precio_snap: number;
  }>;
}

interface PresupuestoFormProps {
  mode: PresupuestoMode;
  initialData?: PresupuestoFormInitialData;
  initialTasa?: { tasa: number; stale: boolean } | null;
  onSaved?: (presupuestoId: string) => void;
  onCancelEdit?: () => void;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value: string): boolean {
  return value.trim().length > 0;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `REQUEST_FAILED_${response.status}`);
  }

  return response.json() as Promise<T>;
}

function upsertLineas(
  current: PresupuestoLineaForm[],
  additions: Array<Pick<PresupuestoLineaForm, "examen_id" | "nombre_snap" | "precio_snap">>,
): PresupuestoLineaForm[] {
  const seen = new Set(current.map((item) => item.examen_id));
  const next = [...current];

  for (const item of additions) {
    if (seen.has(item.examen_id)) continue;
    seen.add(item.examen_id);
    next.push({
      examen_id: item.examen_id,
      nombre_snap: item.nombre_snap,
      precio_snap: item.precio_snap,
    });
  }

  return next;
}

export function PresupuestoForm({
  mode,
  initialData,
  initialTasa,
  onSaved,
  onCancelEdit,
}: PresupuestoFormProps) {
  const router = useRouter();

  const [modoPaciente, setModoPaciente] = useState<"registrado" | "libre">(
    initialData?.paciente_nombre_libre ? "libre" : "registrado",
  );
  const [selectedPaciente, setSelectedPaciente] = useState<PacienteAutocompleteItem | null>(
    initialData?.paciente_id
      ? {
          id: initialData.paciente_id,
          nombre: initialData.paciente_nombre ?? "",
          apellido: initialData.paciente_apellido ?? "",
          cedula: "",
          fecha_nacimiento: "",
        }
      : null,
  );
  const [editingPaciente, setEditingPaciente] = useState(false);
  const [nombreLibre, setNombreLibre] = useState(initialData?.paciente_nombre_libre ?? "");
  const [lineas, setLineas] = useState<PresupuestoLineaForm[]>(
    initialData?.lineas.map((item) => ({
      examen_id: item.examen_id,
      nombre_snap: item.nombre_snap,
      precio_snap: item.precio_snap,
    })) ?? [],
  );
  const [descuentoPct, setDescuentoPct] = useState(
    initialData ? String(initialData.descuento_pct) : "",
  );
  const [gananciaPct, setGananciaPct] = useState(
    initialData ? String(initialData.ganancia_pct) : "",
  );
  const [tasaBs, setTasaBs] = useState(initialTasa ? String(initialTasa.tasa) : initialData ? String(initialData.tasa_bs) : "");

  const [examSearch, setExamSearch] = useState("");
  const [examItems, setExamItems] = useState<ExamenCatalogoItem[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const subtotal = useMemo(
    () => lineas.reduce((sum, linea) => sum + linea.precio_snap, 0),
    [lineas],
  );

  const descuentoNum = toNumber(descuentoPct);
  const gananciaNum = toNumber(gananciaPct);
  const tasaNum = toNumber(tasaBs);
  const tasaValida = hasValue(tasaBs) && tasaNum > 0;
  const descuentoValido =
    !hasValue(descuentoPct) || (descuentoNum >= 0 && descuentoNum <= 100);
  const gananciaValida = !hasValue(gananciaPct) || gananciaNum >= 0;

  const totals = useMemo(() => {
    const descuento = hasValue(descuentoPct) ? descuentoNum : 0;
    const ganancia = hasValue(gananciaPct) ? gananciaNum : 0;
    if (!tasaValida) return { totalUsd: null as number | null, totalBs: null as number | null };
    return calcularTotales({ subtotal, descuentoPct: descuento, gananciaPct: ganancia, tasa: tasaNum });
  }, [subtotal, descuentoPct, gananciaPct, tasaBs, descuentoNum, gananciaNum, tasaNum, tasaValida]);

  const pacienteOk =
    (modoPaciente === "registrado" && Boolean(selectedPaciente?.id)) ||
    (modoPaciente === "libre" && nombreLibre.trim().length > 0);
  const canSubmit =
    pacienteOk && lineas.length > 0 && descuentoValido && gananciaValida && tasaValida;

  useEffect(() => {
    if (examSearch.trim().length < 2) {
      setExamItems([]);
      setExamError(null);
      setExamLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setExamLoading(true);
        setExamError(null);
        const payload = await requestJson<ExamenCatalogoItem[]>(
          `/api/examenes?term=${encodeURIComponent(examSearch.trim())}`,
          { signal: controller.signal },
        );
        setExamItems(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        setExamError(toHumanError(error));
        setExamItems([]);
      } finally {
        if (!controller.signal.aborted) setExamLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [examSearch]);

  function addExam(examen: ExamenCatalogoItem): void {
    setLineas((current) =>
      upsertLineas(current, [
        { examen_id: examen.id, nombre_snap: examen.nombre, precio_snap: examen.precio_usd },
      ]),
    );
    setExamSearch("");
    setExamItems([]);
  }

  function addPaquete(examenes: PaqueteExamen[]): void {
    setLineas((current) =>
      upsertLineas(
        current,
        examenes.map((item) => ({
          examen_id: item.id,
          nombre_snap: item.nombre,
          precio_snap: toNumber(String(item.precio_usd)),
        })),
      ),
    );
  }

  function removeLinea(index: number): void {
    setLineas((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function submit(): Promise<void> {
    if (!canSubmit) {
      setMessage("Completá paciente, exámenes y una tasa válida antes de guardar.");
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      const payload = {
        paciente_id: modoPaciente === "registrado" ? selectedPaciente?.id : undefined,
        paciente_nombre_libre: modoPaciente === "libre" ? nombreLibre.trim() : undefined,
        descuento_pct: descuentoNum,
        ganancia_pct: gananciaNum,
        tasa_bs: tasaNum,
        examenes: lineas.map((linea) => ({ examen_id: linea.examen_id })),
      };

      const response = await requestJson<{ id: string }>(
        mode === "create" ? "/api/presupuestos" : `/api/presupuestos/${initialData!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );

      if (onSaved) {
        onSaved(response.id);
        return;
      }

      router.push(`/presupuestos/${response.id}`);
      router.refresh();
    } catch (error) {
      setMessage(toHumanError(error));
    } finally {
      setSaving(false);
    }
  }

  const patientSummary = selectedPaciente;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href={mode === "create" ? "/presupuestos" : `/presupuestos/${initialData?.id ?? ""}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>

        <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          Estado: <span className="text-foreground">{initialData?.estado ?? "Borrador"}</span>
        </div>
      </div>

      {message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <section className="grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Paciente</h2>
          <p className="text-sm text-muted-foreground">
            Usá una ficha registrada o un nombre libre para una cotización rápida.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setModoPaciente("registrado")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              modoPaciente === "registrado"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Paciente registrado
          </button>
          <button
            type="button"
            onClick={() => setModoPaciente("libre")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              modoPaciente === "libre"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Nombre libre
          </button>
        </div>

        {modoPaciente === "registrado" ? (
          <div className="space-y-3">
            {patientSummary && !editingPaciente ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-4 py-3">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {patientSummary.nombre} {patientSummary.apellido}
                  </p>
                  {patientSummary.cedula ? (
                    <p className="text-xs text-muted-foreground">{patientSummary.cedula}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedPaciente(null);
                    setEditingPaciente(true);
                  }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar paciente</label>
                <PacienteAutocomplete
                  onSelect={(paciente) => {
                    setSelectedPaciente(paciente);
                    setEditingPaciente(false);
                  }}
                  placeholder="Buscar por nombre, apellido o cédula"
                />
                {selectedPaciente ? (
                  <p className="text-xs text-muted-foreground">
                    Seleccionado: {selectedPaciente.nombre} {selectedPaciente.apellido}
                    {selectedPaciente.cedula ? ` · ${selectedPaciente.cedula}` : ""}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <label className="space-y-2 text-sm font-medium">
            <span>Nombre del paciente</span>
            <input
              value={nombreLibre}
              onChange={(event) => setNombreLibre(event.target.value)}
              placeholder="Ej: Juan Pérez"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Exámenes del presupuesto</h2>
            <p className="text-sm text-muted-foreground">
              Agregá exámenes manualmente o cargá un paquete completo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <CargarPaqueteButton onLoad={addPaquete} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">Agregar examen</label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              value={examSearch}
              onChange={(event) => setExamSearch(event.target.value)}
              placeholder="Buscá por nombre del examen"
              className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            />
          </div>
          {examLoading ? (
            <p className="text-xs text-muted-foreground">Buscando exámenes…</p>
          ) : null}
          {examError ? <p className="text-xs text-destructive">{examError}</p> : null}
          {examItems.length > 0 ? (
            <div className="max-h-64 overflow-auto rounded-xl border border-border">
              {examItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addExam(item)}
                  className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.unidad || "Sin unidad"} · {formatUsd(item.precio_usd)}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : examSearch.trim().length >= 2 && !examLoading ? (
            <p className="text-xs text-muted-foreground">
              No encontramos exámenes para ese término.
            </p>
          ) : null}
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Examen</th>
                <th className="px-4 py-3 font-medium">Precio USD</th>
                <th className="px-4 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Todavía no agregaste exámenes. Usá el buscador o cargá un paquete.
                  </td>
                </tr>
              ) : (
                lineas.map((linea, index) => (
                  <tr key={`${linea.examen_id}-${index}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{linea.nombre_snap}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {formatUsd(linea.precio_snap)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLinea(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                <BadgePercent className="h-4 w-4 text-muted-foreground" />
                Descuento %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={descuentoPct}
                onChange={(event) => setDescuentoPct(event.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              {!descuentoValido ? (
                <span className="text-xs text-destructive">Debe estar entre 0 y 100.</span>
              ) : null}
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                <BadgePercent className="h-4 w-4 text-muted-foreground" />
                Ganancia %
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={gananciaPct}
                onChange={(event) => setGananciaPct(event.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              {!gananciaValida ? (
                <span className="text-xs text-destructive">No puede ser negativa.</span>
              ) : null}
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                Tasa Bs
                <StaleTasaBadge />
              </span>
              <input
                type="number"
                min={0}
                step="0.0001"
                value={tasaBs}
                onChange={(event) => setTasaBs(event.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              {!tasaValida ? (
                <span className="text-xs text-destructive">Ingresá una tasa mayor a 0.</span>
              ) : null}
            </label>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-border bg-background/60 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Resumen en vivo
              </p>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal USD</span>
                <span className="font-mono font-medium text-foreground">{formatUsd(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Descuento</span>
                <span className="font-mono text-foreground">
                  {hasValue(descuentoPct) ? `${descuentoNum}%` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ganancia</span>
                <span className="font-mono text-foreground">
                  {hasValue(gananciaPct) ? `${gananciaNum}%` : "—"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="font-medium text-foreground">Total USD</span>
                <span className="font-mono text-lg font-semibold text-foreground">
                  {totals.totalUsd === null ? "—" : formatUsd(totals.totalUsd)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Total Bs</span>
                <span className="font-mono text-lg font-semibold text-foreground">
                  {totals.totalBs === null ? "—" : formatBs(totals.totalBs)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              La ganancia sólo se ve en este resumen; no aparece en el PDF del presupuesto.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {mode === "edit" && onCancelEdit ? (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            Cancelar
          </Button>
        ) : null}
        <Button type="button" onClick={() => void submit()} disabled={saving || !canSubmit}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : mode === "create" ? "Guardar presupuesto" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
