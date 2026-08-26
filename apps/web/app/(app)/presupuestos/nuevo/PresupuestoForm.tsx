"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgePercent,
  Loader2,
  PackageOpen,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toHumanError } from "@labo/lib/error-messages";
import { formatBs, formatUsd } from "@labo/lib/bs-format";
import { calcularTotales } from "@labo/lib/calcular-totales";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import { ExamenAutocomplete } from "@labo/ui/examenes/ExamenAutocomplete";
import {
  PacienteAutocomplete,
  type PacienteAutocompleteItem,
} from "@labo/ui/pacientes/PacienteAutocomplete";
import { StaleTasaBadge } from "@labo/ui/tasa/StaleTasaBadge";

type PresupuestoMode = "create" | "edit";
type ModoCargaPaquete = "cerrado" | "desglosado";

interface ExamenCatalogoItem {
  id: string;
  titulo_id: string;
  nombre: string;
  precio_usd: number;
  unidad: string | null;
  activo: boolean;
}

interface PaqueteResumenItem {
  id: string;
  nombre: string;
  precio_base: number;
  examenes_count: number;
}

interface PaqueteExamenItem {
  id: string;
  nombre: string;
  precio_usd: number;
}

interface PresupuestoLineaForm {
  examen_id: string;
  nombre_snap: string;
  precio_snap: number;
  paquete_id: string | null;
  precio_base_snap: number;
  gananciaPctInput: string;
  cerrado: boolean;
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
    paquete_id?: string | null;
    precio_base_snap?: number;
    ganancia_pct?: number;
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

function distribuirPrecioBase(precioBasePaquete: number, preciosCatalogo: number[]): number[] {
  const totalCents = Math.round(precioBasePaquete * 100);
  const catalogoCents = preciosCatalogo.map((precio) => Math.round(precio * 100));
  const sumaCatalogo = catalogoCents.reduce((sum, cents) => sum + cents, 0);
  const partes: number[] = [];
  let asignado = 0;

  for (let index = 0; index < catalogoCents.length; index++) {
    if (index === catalogoCents.length - 1) {
      partes.push((totalCents - asignado) / 100);
      break;
    }
    const parte = sumaCatalogo > 0
      ? Math.round((totalCents * catalogoCents[index]) / sumaCatalogo)
      : Math.floor(totalCents / catalogoCents.length);
    partes.push(parte / 100);
    asignado += parte;
  }

  return partes;
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
      paquete_id: item.paquete_id ?? null,
      precio_base_snap: item.precio_base_snap ?? item.precio_snap,
      gananciaPctInput:
        item.ganancia_pct != null &&
        initialData &&
        item.ganancia_pct !== initialData.ganancia_pct
          ? String(item.ganancia_pct)
          : "",
      cerrado: false,
    })) ?? [],
  );
  const [descuentoPct, setDescuentoPct] = useState(
    initialData ? String(initialData.descuento_pct) : "",
  );
  const [gananciaPct, setGananciaPct] = useState(
    initialData ? String(initialData.ganancia_pct) : "",
  );
  const [tasaBs, setTasaBs] = useState(initialTasa ? String(initialTasa.tasa) : initialData ? String(initialData.tasa_bs) : "");

  const [paquetePanelOpen, setPaquetePanelOpen] = useState(false);
  const [paquetes, setPaquetes] = useState<PaqueteResumenItem[]>([]);
  const [paquetesLoading, setPaquetesLoading] = useState(false);
  const [paquetesError, setPaquetesError] = useState<string | null>(null);
  const [paqueteElegido, setPaqueteElegido] = useState<PaqueteResumenItem | null>(null);
  const [cargandoPaqueteId, setCargandoPaqueteId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedExamIds = useMemo(() => lineas.map((linea) => linea.examen_id), [lineas]);

  const subtotal = useMemo(
    () => lineas.reduce((sum, linea) => sum + linea.precio_base_snap, 0),
    [lineas],
  );

  const descuentoNum = toNumber(descuentoPct);
  const gananciaNum = toNumber(gananciaPct);
  const tasaNum = toNumber(tasaBs);
  const tasaValida = hasValue(tasaBs) && tasaNum > 0;
  const descuentoValido =
    !hasValue(descuentoPct) || (descuentoNum >= 0 && descuentoNum <= 100);
  const gananciaValida = !hasValue(gananciaPct) || gananciaNum >= 0;
  const gananciaPorLineaValida = lineas.every(
    (linea) => !hasValue(linea.gananciaPctInput) || toNumber(linea.gananciaPctInput) >= 0,
  );

  const totals = useMemo(() => {
    if (!tasaValida || lineas.length === 0) return null;
    return calcularTotales({
      descuentoPct: descuentoNum,
      gananciaPct: gananciaNum,
      tasa: tasaNum,
      lineas: lineas.map((linea) => ({
        precioBase: linea.precio_base_snap,
        ...(hasValue(linea.gananciaPctInput)
          ? { gananciaPct: toNumber(linea.gananciaPctInput) }
          : {}),
      })),
    });
  }, [lineas, descuentoNum, gananciaNum, tasaNum, tasaValida]);

  const pacienteOk =
    (modoPaciente === "registrado" && Boolean(selectedPaciente?.id)) ||
    (modoPaciente === "libre" && nombreLibre.trim().length > 0);
  const canSubmit =
    pacienteOk &&
    lineas.length > 0 &&
    descuentoValido &&
    gananciaValida &&
    gananciaPorLineaValida &&
    tasaValida;

  useEffect(() => {
    if (!paquetePanelOpen) {
      setPaqueteElegido(null);
      setPaquetesError(null);
      setPaquetesLoading(false);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        setPaquetesLoading(true);
        setPaquetesError(null);
        const payload = await requestJson<PaqueteResumenItem[]>("/api/paquetes", {
          signal: controller.signal,
        });
        setPaquetes(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPaquetesError(toHumanError(error));
      } finally {
        if (!controller.signal.aborted) setPaquetesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [paquetePanelOpen]);

  function addExamen(examen: ExamenCatalogoItem): void {
    setLineas((current) => {
      if (current.some((linea) => linea.examen_id === examen.id)) return current;
      return [
        ...current,
        {
          examen_id: examen.id,
          nombre_snap: examen.nombre,
          precio_snap: examen.precio_usd,
          paquete_id: null,
          precio_base_snap: examen.precio_usd,
          gananciaPctInput: "",
          cerrado: false,
        },
      ];
    });
  }

  function incorporarPaquete(
    paquete: PaqueteResumenItem,
    nuevas: PresupuestoLineaForm[],
  ): void {
    const idsNuevos = new Set(nuevas.map((linea) => linea.examen_id));
    const conflicto = lineas.find(
      (linea) =>
        linea.paquete_id !== null &&
        linea.paquete_id !== paquete.id &&
        idsNuevos.has(linea.examen_id),
    );

    if (conflicto) {
      setMessage(
        `"${conflicto.nombre_snap}" ya forma parte de otro paquete cargado. Quitá ese paquete primero si querés cambiar de modalidad.`,
      );
      return;
    }

    setLineas((current) => {
      const sinCopiasSueltas = current.filter(
        (linea) => !(linea.paquete_id === null && idsNuevos.has(linea.examen_id)),
      );
      return [...sinCopiasSueltas, ...nuevas];
    });
    setMessage(null);
    setPaquetePanelOpen(false);
    setPaqueteElegido(null);
  }

  async function cargarPaqueteElegido(modo: ModoCargaPaquete): Promise<void> {
    const paquete = paqueteElegido;
    if (!paquete || cargandoPaqueteId) return;

    try {
      setCargandoPaqueteId(paquete.id);
      setMessage(null);

      const examenes = await requestJson<PaqueteExamenItem[]>(
        `/api/paquetes/${paquete.id}/examenes`,
      );

      if (examenes.length === 0) {
        setMessage(`El paquete "${paquete.nombre}" no tiene exámenes activos para cargar.`);
        return;
      }

      const precios = examenes.map((examen) => Number(examen.precio_usd));
      const bases =
        modo === "cerrado"
          ? distribuirPrecioBase(Number(paquete.precio_base), precios)
          : precios;

      incorporarPaquete(
        paquete,
        examenes.map((examen, index) => ({
          examen_id: examen.id,
          nombre_snap: examen.nombre,
          precio_snap: precios[index],
          paquete_id: paquete.id,
          precio_base_snap: bases[index],
          gananciaPctInput: "",
          cerrado: modo === "cerrado",
        })),
      );
    } catch (error) {
      setMessage(toHumanError(error));
    } finally {
      setCargandoPaqueteId(null);
    }
  }

  function removeLinea(index: number): void {
    const linea = lineas[index];
    if (!linea) return;

    if (linea.cerrado && linea.paquete_id) {
      setLineas((current) => current.filter((item) => item.paquete_id !== linea.paquete_id));
      return;
    }

    setLineas((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateGananciaLinea(index: number, value: string): void {
    setLineas((current) =>
      current.map((linea, currentIndex) =>
        currentIndex === index ? { ...linea, gananciaPctInput: value } : linea,
      ),
    );
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
        examenes: lineas.map((linea) => ({
          examen_id: linea.examen_id,
          ...(linea.paquete_id ? { paquete_id: linea.paquete_id } : {}),
          precio_base_snap: linea.precio_base_snap,
          ...(hasValue(linea.gananciaPctInput)
            ? { ganancia_pct: toNumber(linea.gananciaPctInput) }
            : {}),
        })),
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
              Agregá exámenes individuales o cargá un paquete en modo cerrado o desglosado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaquetePanelOpen((open) => !open)}
            >
              <PackageOpen className="h-4 w-4" />
              Cargar paquete
            </Button>
          </div>
        </div>

        {paquetePanelOpen ? (
          <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
            <p className="text-sm font-medium text-foreground">
              Elegí un paquete y después el modo de carga
            </p>

            {paquetesLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">Cargando paquetes…</p>
            ) : null}
            {paquetesError ? (
              <p className="mt-2 text-xs text-destructive">{paquetesError}</p>
            ) : null}
            {!paquetesLoading && !paquetesError && paquetes.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Todavía no hay paquetes creados.
              </p>
            ) : null}

            <ul className="mt-3 space-y-2">
              {paquetes.map((paquete) => {
                const elegido = paqueteElegido?.id === paquete.id;
                const cargando = cargandoPaqueteId === paquete.id;
                const precioBase = Number(paquete.precio_base);

                return (
                  <li
                    key={paquete.id}
                    className={`rounded-lg border px-4 py-3 transition ${
                      elegido ? "border-primary/50 bg-primary/5" : "border-border"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPaqueteElegido(elegido ? null : paquete)}
                      disabled={Boolean(cargandoPaqueteId)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span>
                        <span className="text-sm font-medium text-foreground">
                          {paquete.nombre}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {paquete.examenes_count}{" "}
                          {paquete.examenes_count === 1 ? "examen" : "exámenes"} · Base{" "}
                          {formatUsd(precioBase)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-primary">
                        {elegido ? "Elegí el modo" : "Seleccionar"}
                      </span>
                    </button>

                    {elegido ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void cargarPaqueteElegido("cerrado")}
                          disabled={cargando}
                        >
                          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Modo A · Cerrado ({formatUsd(precioBase)})
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void cargarPaqueteElegido("desglosado")}
                          disabled={cargando}
                        >
                          Modo B · Desglosado ({paquete.examenes_count})
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">Agregar examen individual</label>
          <ExamenAutocomplete
            onSelect={addExamen}
            selectedIds={selectedExamIds}
            autoFocusOnSelect
            placeholder="Buscá por nombre del examen"
          />
          <p className="text-xs text-muted-foreground">
            Buscá y agregá con Enter o clic; el campo recupera el foco para seguir cargando.
          </p>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Examen</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Precio base USD</th>
                <th className="px-4 py-3 font-medium">Ganancia %</th>
                <th className="px-4 py-3 text-right font-medium">Precio final USD</th>
                <th className="px-4 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Todavía no agregaste exámenes. Usá el buscador o cargá un paquete.
                  </td>
                </tr>
              ) : (
                lineas.map((linea, index) => {
                  const gananciaInvalida =
                    hasValue(linea.gananciaPctInput) && toNumber(linea.gananciaPctInput) < 0;
                  const precioFinalLinea = totals?.lineas?.[index]?.precioFinal;

                  return (
                    <tr key={`${linea.examen_id}-${index}`} className={linea.cerrado ? "bg-muted/20" : ""}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {linea.nombre_snap}
                      </td>
                      <td className="px-4 py-3">
                        {linea.paquete_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <PackageOpen className="h-3 w-3" />
                            {linea.cerrado ? "Paquete cerrado" : "Paquete desglosado"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Individual</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {formatUsd(linea.precio_base_snap)}
                      </td>
                      <td className="px-4 py-3">
                        {linea.cerrado ? (
                          <span className="text-xs text-muted-foreground">Global</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={linea.gananciaPctInput}
                            onChange={(event) => updateGananciaLinea(index, event.target.value)}
                            placeholder="Global"
                            aria-label={`Ganancia % de ${linea.nombre_snap}`}
                            className={`h-9 w-24 rounded-md border bg-background px-2 text-sm ${
                              gananciaInvalida
                                ? "border-destructive text-destructive"
                                : "border-input"
                            }`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground">
                        {precioFinalLinea === undefined ? "—" : formatUsd(precioFinalLinea)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLinea(index)}
                          title={
                            linea.cerrado
                              ? "Quitar el paquete completo"
                              : `Quitar ${linea.nombre_snap}`
                          }
                          aria-label={
                            linea.cerrado
                              ? "Quitar el paquete completo"
                              : `Quitar ${linea.nombre_snap}`
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {lineas.some((linea) => linea.cerrado) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Los paquetes cerrados se quitan completos para mantener su precio pactado.
          </p>
        ) : null}
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
                  {totals === null ? "—" : formatUsd(totals.totalUsd)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Total Bs</span>
                <span className="font-mono text-lg font-semibold text-foreground">
                  {totals === null ? "—" : formatBs(totals.totalBs)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              El PDF del presupuesto muestra el precio final de cada línea con la ganancia ya
              incluida; el porcentaje aplicado no se desglosa en el documento.
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
