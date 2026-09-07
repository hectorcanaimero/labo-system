"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  PackagePlus,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { indicesSinValor, mensajeSinValor, tieneValor } from "@labo/lib/entrega-orden";
import { toHumanError } from "@labo/lib/error-messages";
import { ESTADO_ORDEN, type EstadoOrden } from "@labo/lib/schemas/orden";
import {
  PacienteAutocomplete,
  type PacienteAutocompleteItem,
} from "@labo/ui/pacientes/PacienteAutocomplete";

import { apiFetch } from "@/lib/api-client";
import { aItemAutocomplete, valoresInicialesDesdeBusqueda } from "@/lib/paciente-quick-create";
import { PacienteFormDialog, type PacienteFormValues } from "@/app/(app)/pacientes/PacienteFormDialog";
type ResultadoMode = "create" | "edit";

/** Estados que se pueden elegir al cargar o editar. Anular es una acción aparte. */
const ESTADOS_ELEGIBLES: readonly EstadoOrden[] = ESTADO_ORDEN.filter((e) => e !== "Anulada");

function hoyInput(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ExamenCatalogoItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd?: number;
  unidad?: string | null;
  activo?: boolean;
}

interface PaqueteItem {
  id: string;
  nombre: string;
  descripcion: string | null;
  examenes_count: number;
}

interface PaqueteExamen {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  valores_referencia: string | null;
  activo: boolean;
  orden: number;
}

interface ResultadoLineaForm {
  examen_id: string;
  nombre_snap: string;
  valor: string;
  observacion: string;
  unidad_snap: string | null;
}

interface ResultadoInitialData {
  id: string;
  paciente_id: string;
  paciente?: {
    id: string;
    nombre: string;
    apellido: string;
    cedula: string;
  };
  fecha_muestra: string;
  fecha_resultado: string | null;
  medico_solicitante: string | null;
  estado?: EstadoOrden;
  observaciones: string | null;
  examenes: Array<{
    examen_id: string;
    nombre_snap: string;
    valor: string;
    observacion: string | null;
    unidad_snap: string | null;
  }>;
}

interface ResultadoFormProps {
  mode: ResultadoMode;
  initialData?: ResultadoInitialData;
  onSaved?: (resultadoId: string) => void;
  onCancelEdit?: () => void;
}

function formatDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function toApiDate(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, {
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
  current: ResultadoLineaForm[],
  additions: Array<Pick<ResultadoLineaForm, "examen_id" | "nombre_snap" | "unidad_snap">>,
): ResultadoLineaForm[] {
  const seen = new Set(current.map((item) => item.examen_id));
  const next = [...current];

  for (const item of additions) {
    if (seen.has(item.examen_id)) continue;
    seen.add(item.examen_id);
    next.push({
      examen_id: item.examen_id,
      nombre_snap: item.nombre_snap,
      unidad_snap: item.unidad_snap,
      valor: "",
      observacion: "",
    });
  }

  return next;
}

export function ResultadoForm({ mode, initialData, onSaved, onCancelEdit }: ResultadoFormProps) {
  const router = useRouter();
  const [selectedPaciente, setSelectedPaciente] = useState<PacienteAutocompleteItem | null>(
    initialData?.paciente
      ? {
          id: initialData.paciente.id,
          nombre: initialData.paciente.nombre,
          apellido: initialData.paciente.apellido,
          cedula: initialData.paciente.cedula,
          fecha_nacimiento: "",
        }
      : null,
  );
  const [fechaMuestra, setFechaMuestra] = useState(formatDateInput(initialData?.fecha_muestra));
  const [fechaResultado, setFechaResultado] = useState(formatDateInput(initialData?.fecha_resultado));
  // El estado es explícito: lo elige el operador. Sólo se sugiere "Entregada"
  // al cargar una fecha de resultado si todavía no lo tocó a mano.
  const [estado, setEstado] = useState<EstadoOrden>(
    initialData?.estado ?? (initialData?.fecha_resultado ? "Entregada" : "Registrada"),
  );
  const [estadoTocado, setEstadoTocado] = useState(false);
  const [crearPacienteOpen, setCrearPacienteOpen] = useState(false);
  const [crearPacienteInicial, setCrearPacienteInicial] = useState<Partial<PacienteFormValues>>({});
  const [pacienteLabel, setPacienteLabel] = useState<string | null>(null);
  const [medicoSolicitante, setMedicoSolicitante] = useState(initialData?.medico_solicitante ?? "");
  const [observaciones, setObservaciones] = useState(initialData?.observaciones ?? "");
  const [lineas, setLineas] = useState<ResultadoLineaForm[]>(
    initialData?.examenes.map((item) => ({
      examen_id: item.examen_id,
      nombre_snap: item.nombre_snap,
      valor: item.valor,
      observacion: item.observacion ?? "",
      unidad_snap: item.unidad_snap,
    })) ?? [],
  );
  const [examSearch, setExamSearch] = useState("");
  const [examItems, setExamItems] = useState<ExamenCatalogoItem[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);
  const [paquetes, setPaquetes] = useState<PaqueteItem[]>([]);
  const [paquetesOpen, setPaquetesOpen] = useState(false);
  const [paquetesLoading, setPaquetesLoading] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [addingPaqueteId, setAddingPaqueteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const aiEnabled = process.env.NEXT_PUBLIC_AI_OBSERVACIONES_ENABLED === "true";

  async function handleSugerirObservacion(): Promise<void> {
    const texto = observaciones.trim();
    if (!texto) {
      setAiError("Escribe primero un borrador para que el asistente lo mejore.");
      return;
    }
    setAiError(null);
    setAiNotice(null);
    setAiLoading(true);
    try {
      const res = await apiFetch("/api/ai/observaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sugerencia?: string;
        error?: string;
        message?: string;
        retry_after_sec?: number;
      };
      if (!res.ok || !data.sugerencia) {
        if (res.status === 429) {
          setAiError(
            `Demasiadas solicitudes. Intenta nuevamente en ${data.retry_after_sec ?? 30}s.`,
          );
        } else if (data.error === "AI_DISABLED") {
          setAiError("El asistente está deshabilitado en este entorno.");
        } else {
          setAiError(data.message ?? "No se pudo generar la sugerencia. Intenta de nuevo.");
        }
        return;
      }
      setObservaciones(data.sugerencia);
      setAiNotice("Sugerencia aplicada. Revisa y edita antes de guardar.");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Error de red al contactar el asistente.");
    } finally {
      setAiLoading(false);
    }
  }

  const canSubmit = Boolean(selectedPaciente?.id || initialData?.paciente_id) && Boolean(fechaMuestra) && lineas.length > 0;
  // Al entregar no puede quedar ningún examen sin valor. Se anticipa acá lo
  // que el servidor va a rechazar.
  const entregando = estado === "Entregada";

  function cambiarFechaResultado(value: string): void {
    setFechaResultado(value);
    if (value && !estadoTocado && estado !== "Entregada") setEstado("Entregada");
    if (!value && estado === "Entregada") setEstado("Validando");
  }

  function cambiarEstado(value: EstadoOrden): void {
    setEstado(value);
    setEstadoTocado(true);
    // Registrada no admite fecha de resultado; Entregada la exige.
    if (value === "Registrada") setFechaResultado("");
    if (value === "Entregada" && !fechaResultado) setFechaResultado(hoyInput());
  }

  function abrirCrearPaciente(query: string): void {
    setCrearPacienteInicial(valoresInicialesDesdeBusqueda(query));
    setCrearPacienteOpen(true);
  }
  const sinValor = useMemo(() => indicesSinValor(lineas), [lineas]);
  const bloqueaEntrega = entregando && sinValor.length > 0;

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
        const payload = await requestJson<ExamenCatalogoItem[]>(`/api/examenes?term=${encodeURIComponent(examSearch.trim())}`, {
          signal: controller.signal,
        });
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

  async function openPaquetes(): Promise<void> {
    setPaquetesOpen(true);
    if (paquetes.length > 0 || paquetesLoading) return;

    try {
      setPaquetesLoading(true);
      setPackageError(null);
      setPaquetes(await requestJson<PaqueteItem[]>("/api/paquetes"));
    } catch (error) {
      setPackageError(toHumanError(error));
    } finally {
      setPaquetesLoading(false);
    }
  }

  function addExam(examen: ExamenCatalogoItem): void {
    setLineas((current) =>
      upsertLineas(current, [
        {
          examen_id: examen.id,
          nombre_snap: examen.nombre,
          unidad_snap: examen.unidad ?? null,
        },
      ]),
    );
    setExamSearch("");
    setExamItems([]);
  }

  async function addPaquete(paqueteId: string): Promise<void> {
    if (addingPaqueteId) return;
    try {
      setAddingPaqueteId(paqueteId);
      setPackageError(null);
      const examenes = await requestJson<PaqueteExamen[]>(`/api/paquetes/${paqueteId}/examenes`);
      setLineas((current) =>
        upsertLineas(
          current,
          examenes.map((item) => ({
            examen_id: item.id,
            nombre_snap: item.nombre,
            unidad_snap: item.unidad,
          })),
        ),
      );
      setPaquetesOpen(false);
    } catch (error) {
      setPackageError(toHumanError(error));
    } finally {
      setAddingPaqueteId(null);
    }
  }

  function handlePaquetesOpenChange(next: boolean): void {
    if (!next && addingPaqueteId) return;
    setPaquetesOpen(next);
  }

  function updateLinea(index: number, patch: Partial<ResultadoLineaForm>): void {
    setLineas((current) =>
      current.map((item, currentIndex) => (currentIndex === index ? { ...item, ...patch } : item)),
    );
  }

  function removeLinea(index: number): void {
    setLineas((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function submit(): Promise<void> {
    if (!canSubmit) {
      setMessage("Completá paciente, fecha de muestra y al menos un examen.");
      return;
    }
    if (bloqueaEntrega) {
      setMessage(mensajeSinValor(lineas));
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      const payload = {
        paciente_id: initialData?.paciente_id ?? selectedPaciente?.id,
        fecha_muestra: toApiDate(fechaMuestra),
        fecha_resultado: fechaResultado ? toApiDate(fechaResultado) : mode === "edit" ? null : undefined,
        medico_solicitante: medicoSolicitante,
        estado,
        observaciones,
        examenes: lineas.map((linea) => ({
          examen_id: linea.examen_id,
          valor: linea.valor,
          observacion: linea.observacion,
        })),
      };

      const response = await requestJson<{ id: string }>(
        mode === "create" ? "/api/resultados" : `/api/resultados/${initialData!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );

      if (onSaved) {
        onSaved(response.id);
        return;
      }

      router.push(`/resultados/${response.id}`);
      router.refresh();
    } catch (error) {
      setMessage(toHumanError(error));
    } finally {
      setSaving(false);
    }
  }

  const patientSummary = selectedPaciente || initialData?.paciente;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href={mode === "create" ? "/resultados" : `/resultados/${initialData?.id ?? ""}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>

        <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          Estado al guardar: <span className="text-foreground">{estado}</span>
        </div>
      </div>

      {message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <section className="grid gap-6 rounded-lg border border-border bg-card p-6 shadow-sm lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Paciente</label>
          {mode === "create" ? (
            <PacienteAutocomplete
              onSelect={setSelectedPaciente}
              onCreate={abrirCrearPaciente}
              selectedLabel={pacienteLabel}
              placeholder="Buscar por nombre, apellido o cédula"
            />
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-border bg-background/70 px-4 py-3">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {patientSummary ? `${patientSummary.nombre} ${patientSummary.apellido}` : "Paciente asociado"}
                </p>
                {patientSummary ? <p className="text-xs text-muted-foreground">{patientSummary.cedula}</p> : null}
              </div>
            </div>
          )}
          {mode === "create" && selectedPaciente ? (
            <p className="text-xs text-muted-foreground">
              Seleccionado: {selectedPaciente.nombre} {selectedPaciente.apellido} · {selectedPaciente.cedula}
            </p>
          ) : null}
          {mode === "create" ? (
            <p className="text-xs text-muted-foreground">
              ¿Paciente nuevo?{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => abrirCrearPaciente("")}
              >
                Crearlo sin salir de acá
              </button>
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            <span>Fecha de muestra</span>
            <input
              type="date"
              value={fechaMuestra}
              onChange={(event) => setFechaMuestra(event.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>

          <label className="space-y-2 text-sm font-medium">
            <span>Fecha de resultado</span>
            <input
              type="date"
              value={fechaResultado}
              onChange={(event) => cambiarFechaResultado(event.target.value)}
              disabled={estado === "Registrada"}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="space-y-2 text-sm font-medium sm:col-span-2">
            <span>Estado</span>
            <select
              value={estado}
              onChange={(event) => cambiarEstado(event.target.value as EstadoOrden)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(ESTADOS_ELEGIBLES.includes(estado) ? ESTADOS_ELEGIBLES : [...ESTADOS_ELEGIBLES, estado]).map(
                (opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ),
              )}
            </select>
            <span className="block text-xs font-normal text-muted-foreground">
              {estado === "Entregada"
                ? "Entregada exige fecha de resultado y todos los valores cargados."
                : estado === "Registrada"
                  ? "Registrada no lleva fecha de resultado."
                  : "Podés dejar valores pendientes en este estado."}
            </span>
          </label>
        </div>

        <label className="space-y-2 text-sm font-medium lg:col-span-2">
          <span>Médico solicitante</span>
          <input
            value={medicoSolicitante}
            onChange={(event) => setMedicoSolicitante(event.target.value)}
            placeholder="Ej: Dra. Mariana López"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>

        <div className="space-y-2 text-sm font-medium lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="observaciones-generales" className="cursor-pointer">
              Observaciones generales
            </label>
            {aiEnabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSugerirObservacion}
                disabled={aiLoading || !observaciones.trim()}
                className="h-8 gap-1.5 px-2 text-xs font-medium"
                title="Reescribe el borrador en registro técnico venezolano"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiLoading ? "Sugiriendo…" : "Sugerir redacción"}
              </Button>
            ) : null}
          </div>
          <textarea
            id="observaciones-generales"
            rows={4}
            value={observaciones}
            onChange={(event) => {
              setObservaciones(event.target.value);
              if (aiError) setAiError(null);
              if (aiNotice) setAiNotice(null);
            }}
            placeholder="Notas para el informe, hallazgos o aclaratorias."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {aiError ? (
            <p className="text-xs font-normal text-destructive">{aiError}</p>
          ) : aiNotice ? (
            <p className="text-xs font-normal text-muted-foreground">{aiNotice}</p>
          ) : aiEnabled ? (
            <p className="text-xs font-normal text-muted-foreground">
              El asistente reescribe tu borrador en registro técnico. La revisión final la haces tú.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Exámenes del resultado</h2>
            <p className="text-sm text-muted-foreground">Podés agregar exámenes manualmente o cargar un paquete completo.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void openPaquetes()}>
              <PackagePlus className="h-4 w-4" />
              Cargar paquete
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-2">
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
            {examLoading ? <p className="text-xs text-muted-foreground">Buscando exámenes…</p> : null}
            {examError ? <p className="text-xs text-destructive">{examError}</p> : null}
            {examItems.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                {examItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addExam(item)}
                    className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.nombre}</p>
                      <p className="text-xs text-muted-foreground">{item.unidad || "Sin unidad"}</p>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : examSearch.trim().length >= 2 && !examLoading ? (
              <p className="text-xs text-muted-foreground">No encontramos exámenes para ese término.</p>
            ) : null}
          </div>

          <div className="rounded-md border border-dashed border-border bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">Resumen</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {lineas.length} {lineas.length === 1 ? "examen cargado" : "exámenes cargados"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Estado al guardar: <span className="font-medium text-foreground">{estado}</span>
            </p>
            {sinValor.length > 0 ? (
              <p className={`mt-1 text-sm ${bloqueaEntrega ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {sinValor.length} {sinValor.length === 1 ? "examen sin valor" : "exámenes sin valor"}
                {bloqueaEntrega
                  ? ". Completalos o quitá la fecha de resultado para guardar como pendiente."
                  : "."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Examen</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Observación</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Todavía no agregaste exámenes. Usá el buscador o cargá un paquete.
                  </td>
                </tr>
              ) : (
                lineas.map((linea, index) => (
                  <tr key={`${linea.examen_id}-${index}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{linea.nombre_snap}</td>
                    <td className="px-4 py-3">
                      <input
                        value={linea.valor}
                        onChange={(event) => updateLinea(index, { valor: event.target.value })}
                        placeholder="Ej: 5.4"
                        aria-invalid={entregando && !tieneValor(linea.valor) ? true : undefined}
                        aria-label={`Valor de ${linea.nombre_snap}`}
                        className={`h-10 w-full min-w-28 rounded-md border bg-background px-3 text-sm ${
                          entregando && !tieneValor(linea.valor)
                            ? "border-destructive ring-1 ring-destructive/40"
                            : "border-input"
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={linea.observacion}
                        onChange={(event) => updateLinea(index, { observacion: event.target.value })}
                        placeholder="Opcional"
                        className="h-10 w-full min-w-48 rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{linea.unidad_snap || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeLinea(index)}>
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {mode === "edit" && onCancelEdit ? (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            Cancelar
          </Button>
        ) : null}
        <Button type="button" onClick={() => void submit()} disabled={saving || !canSubmit}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : mode === "create" ? "Guardar resultado" : "Guardar cambios"}
        </Button>
      </div>

      <Dialog open={paquetesOpen} onOpenChange={handlePaquetesOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="px-6 pb-4 pr-12 pt-6">
            <DialogTitle className="text-xl">Cargar paquete</DialogTitle>
            <DialogDescription>
              Elegí un paquete para agregar todos sus exámenes al resultado.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {packageError ? <p className="mb-4 text-sm text-destructive">{packageError}</p> : null}

            <div className="rounded-md border border-border">
              {paquetesLoading ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando paquetes…
                </div>
              ) : paquetes.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No hay paquetes disponibles.</p>
              ) : (
                paquetes.map((paquete) => (
                  <button
                    key={paquete.id}
                    type="button"
                    onClick={() => void addPaquete(paquete.id)}
                    disabled={Boolean(addingPaqueteId)}
                    className="flex w-full items-center justify-between border-b border-border px-4 py-4 text-left last:border-b-0 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div>
                      <p className="font-medium text-foreground">{paquete.nombre}</p>
                      <p className="text-sm text-muted-foreground">{paquete.descripcion || "Sin descripción"}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {addingPaqueteId === paquete.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
                        </>
                      ) : (
                        `${paquete.examenes_count} ${paquete.examenes_count === 1 ? "examen" : "exámenes"}`
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
      <PacienteFormDialog
        open={crearPacienteOpen}
        initialValues={crearPacienteInicial}
        onOpenChange={setCrearPacienteOpen}
        onSaved={(paciente) => {
          const item = aItemAutocomplete(paciente);
          setSelectedPaciente(item);
          setPacienteLabel(`${item.nombre} ${item.apellido}`.trim());
        }}
      />
    </div>
  );
}
