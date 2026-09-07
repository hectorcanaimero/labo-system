"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
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
import { formatBs, formatUsd, roundHalfUp } from "@labo/lib/bs-format";
import { calcularTotales } from "@labo/lib/calcular-totales";
import {
  gananciaGlobalGuardada,
  reconstruirLineaGuardada,
} from "@labo/lib/presupuesto-lineas";
import type { EstadoPresupuesto } from "@labo/lib/schemas/presupuesto";
import { ExamenAutocomplete } from "@labo/ui/examenes/ExamenAutocomplete";
import {
  PacienteAutocomplete,
  type PacienteAutocompleteItem,
} from "@labo/ui/pacientes/PacienteAutocomplete";
import { StaleTasaBadge } from "@labo/ui/tasa/StaleTasaBadge";

import { apiFetch } from "@/lib/api-client";
import { aItemAutocomplete, valoresInicialesDesdeBusqueda } from "@/lib/paciente-quick-create";
import { PacienteFormDialog, type PacienteFormValues } from "@/app/(app)/pacientes/PacienteFormDialog";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";
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
  toma_muestra_usd: number;
  domicilio_usd: number;
  estado: EstadoPresupuesto;
  lineas: Array<{
    examen_id: string;
    nombre_snap: string;
    precio_snap: number;
    paquete_id?: string | null;
    precio_base_snap?: number;
    ganancia_pct?: number;
    cerrado?: boolean;
  }>;
}

interface PresupuestoFormProps {
  mode: PresupuestoMode;
  initialData?: PresupuestoFormInitialData;
  initialTasa?: { tasa: number; fuente: string; scraped_at: string; stale: boolean } | null;
  /**
   * F7.2.T6 — tasa vigente al editar, para avisar si difiere de la guardada
   * (`initialData.tasa_bs`, la que de verdad se usa). No aplica al crear:
   * ahí no hay "guardada" todavía, `initialTasa` YA es la vigente.
   */
  vigenteTasa?: { tasa: number; fuente: string; scraped_at: string } | null;
  /** Valor por defecto de "Toma de muestra" (Config). Sólo aplica al crear. */
  tomaMuestraDefault?: number;
  /**
   * F7.2.T6 — ganancia con la que arranca cada línea abierta nueva (Config).
   * Aplica siempre que se agrega una línea, tanto al crear como al editar.
   */
  gananciaDefault?: number;
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
  vigenteTasa,
  tomaMuestraDefault = 0,
  gananciaDefault = 0,
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
  const [crearPacienteOpen, setCrearPacienteOpen] = useState(false);
  const [crearPacienteInicial, setCrearPacienteInicial] = useState<Partial<PacienteFormValues>>({});
  const [pacienteLabel, setPacienteLabel] = useState<string | null>(null);

  function abrirCrearPaciente(query: string): void {
    setCrearPacienteInicial(valoresInicialesDesdeBusqueda(query));
    setCrearPacienteOpen(true);
  }
  const [nombreLibre, setNombreLibre] = useState(initialData?.paciente_nombre_libre ?? "");
  const [lineas, setLineas] = useState<PresupuestoLineaForm[]>(
    initialData?.lineas.map((item) => ({
      examen_id: item.examen_id,
      nombre_snap: item.nombre_snap,
      precio_snap: item.precio_snap,
      // `cerrado`, el reparto y la ganancia por línea se derivan de lo
      // guardado: fijarlos a mano perdía el precio pactado del paquete.
      ...reconstruirLineaGuardada(item),
    })) ?? [],
  );
  const [descuentoPct, setDescuentoPct] = useState(
    initialData ? String(initialData.descuento_pct) : "",
  );
  // F7.2.T6 — ganancia GLOBAL, sólo relevante (y sólo se muestra) si hay un
  // paquete cerrado. Al editar, se prioriza la que de verdad gobierna las
  // líneas cerradas guardadas sobre el header (deberían coincidir siempre,
  // pero las líneas son la fuente de la verdad de lo que se cobró).
  const [gananciaPct, setGananciaPct] = useState(
    initialData
      ? String(gananciaGlobalGuardada(initialData.lineas) ?? initialData.ganancia_pct)
      : "",
  );
  // F7.2.T6 — la tasa deja de ser editable: "guardada" (edit) sale de
  // initialData.tasa_bs y nunca cambia por acción del usuario en este form;
  // "vigente" (create, o informativa al editar) sale de la última
  // registrada. tasaNum más abajo es el valor que de verdad se usa.
  const tasaGuardada = initialData?.tasa_bs ?? null;

  // Servicios: la toma de muestra siempre se cobra y arranca con el valor de
  // Config; el domicilio es opcional y su monto sólo se pide si está marcado.
  const [tomaMuestraUsd, setTomaMuestraUsd] = useState(
    initialData ? String(initialData.toma_muestra_usd) : String(tomaMuestraDefault),
  );
  const [domicilioActivo, setDomicilioActivo] = useState(
    initialData ? initialData.domicilio_usd > 0 : false,
  );
  const [domicilioUsd, setDomicilioUsd] = useState(
    initialData && initialData.domicilio_usd > 0 ? String(initialData.domicilio_usd) : "",
  );

  const [paquetePanelOpen, setPaquetePanelOpen] = useState(false);
  const [paquetes, setPaquetes] = useState<PaqueteResumenItem[]>([]);
  const [paquetesLoading, setPaquetesLoading] = useState(false);
  const [paquetesError, setPaquetesError] = useState<string | null>(null);
  const [paqueteElegido, setPaqueteElegido] = useState<PaqueteResumenItem | null>(null);
  const [cargandoPaqueteId, setCargandoPaqueteId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  const pacienteSectionRef = useRef<HTMLElement>(null);
  const examenesSectionRef = useRef<HTMLElement>(null);
  const ajustesSectionRef = useRef<HTMLElement>(null);

  const selectedExamIds = useMemo(() => lineas.map((linea) => linea.examen_id), [lineas]);

  const subtotal = useMemo(
    () => lineas.reduce((sum, linea) => sum + linea.precio_base_snap, 0),
    [lineas],
  );

  // F7.2.T6 — el modo se DERIVA de las líneas, no de un toggle: hay cerrado
  // si alguna línea es de un paquete cargado en modo cerrado; hay abierta si
  // alguna no lo es (suelta o paquete desglosado). El campo global y la
  // columna por línea se muestran según esto, no según lo que el usuario
  // haya tocado.
  const hayLineaCerrada = lineas.some((linea) => linea.cerrado);
  const hayLineaAbierta = lineas.some((linea) => !linea.cerrado);
  const mostrarGananciaGlobal = hayLineaCerrada;
  const mostrarColumnaGanancia = hayLineaAbierta;

  const descuentoNum = toNumber(descuentoPct);
  const gananciaNum = toNumber(gananciaPct);
  // F7.2.T6 — tasa de solo lectura: "guardada" al editar (nunca cambia acá),
  // la vigente al crear (no hay guardada todavía).
  const tasaNum = mode === "edit" ? (tasaGuardada ?? 0) : (initialTasa?.tasa ?? 0);
  const tasaValida = tasaNum > 0;
  const descuentoValido =
    !hasValue(descuentoPct) || (descuentoNum >= 0 && descuentoNum <= 100);
  const gananciaValida = !mostrarGananciaGlobal || !hasValue(gananciaPct) || gananciaNum >= 0;
  const gananciaPorLineaValida = lineas.every(
    (linea) =>
      linea.cerrado || !hasValue(linea.gananciaPctInput) || toNumber(linea.gananciaPctInput) >= 0,
  );

  const tomaMuestraNum = toNumber(tomaMuestraUsd);
  const domicilioNum = domicilioActivo ? toNumber(domicilioUsd) : 0;
  const tomaMuestraValida = !hasValue(tomaMuestraUsd) || tomaMuestraNum >= 0;
  const domicilioValido = !domicilioActivo || (!hasValue(domicilioUsd) || domicilioNum >= 0);
  const serviciosUsd = tomaMuestraNum + domicilioNum;

  const totals = useMemo(() => {
    if (!tasaValida || lineas.length === 0) return null;
    return calcularTotales({
      descuentoPct: descuentoNum,
      gananciaPct: gananciaNum,
      tasa: tasaNum,
      serviciosUsd,
      lineas: lineas.map((linea) => ({
        precioBase: linea.precio_base_snap,
        // Cerrada: no manda ganancia propia, cae a la global (gananciaPct de
        // arriba). Abierta: SIEMPRE manda la suya, nunca hereda la global —
        // aunque esté vacía (0), porque el campo global puede ni mostrarse.
        ...(linea.cerrado ? {} : { gananciaPct: toNumber(linea.gananciaPctInput) }),
      })),
    });
  }, [lineas, descuentoNum, gananciaNum, tasaNum, tasaValida, serviciosUsd]);

  // Fila "Ganancia" del resumen, ANTES del descuento (que se muestra aparte):
  // paquete cerrado → precio base repartido × % global; líneas abiertas → cada
  // una con su %. Se muestra siempre, así Subtotal + Ganancia + servicios
  // cierra con el total y el operador ve de dónde sale cada centavo.
  const gananciaMontoPaquete = useMemo(() => {
    const baseCerrado = lineas
      .filter((linea) => linea.cerrado)
      .reduce((sum, linea) => sum + linea.precio_base_snap, 0);
    return roundHalfUp((baseCerrado * gananciaNum) / 100, 2);
  }, [lineas, gananciaNum]);
  const gananciaMontoLineas = useMemo(
    () =>
      roundHalfUp(
        lineas
          .filter((linea) => !linea.cerrado)
          .reduce(
            (sum, linea) =>
              sum + (linea.precio_base_snap * toNumber(linea.gananciaPctInput)) / 100,
            0,
          ),
        2,
      ),
    [lineas],
  );
  const gananciaMontoTotal = roundHalfUp(gananciaMontoPaquete + gananciaMontoLineas, 2);
  const gananciaEtiqueta =
    hayLineaCerrada && hayLineaAbierta
      ? `Ganancia (${hasValue(gananciaPct) ? gananciaNum : 0}% del paquete + por línea)`
      : hayLineaCerrada
        ? `Ganancia (${hasValue(gananciaPct) ? gananciaNum : 0}% del paquete)`
        : "Ganancia (por línea)";

  const pacienteOk =
    (modoPaciente === "registrado" && Boolean(selectedPaciente?.id)) ||
    (modoPaciente === "libre" && nombreLibre.trim().length > 0);
  const canSubmit =
    pacienteOk &&
    lineas.length > 0 &&
    descuentoValido &&
    gananciaValida &&
    gananciaPorLineaValida &&
    tomaMuestraValida &&
    domicilioValido &&
    tasaValida;

  const faltantes = useMemo(() => {
    const items: string[] = [];
    if (!pacienteOk) items.push("Falta elegir paciente");
    if (lineas.length === 0) items.push("Agregá al menos un examen");
    if (!descuentoValido) items.push("El descuento debe estar entre 0 y 100");
    if (!gananciaValida) items.push("La ganancia global no puede ser negativa");
    if (!gananciaPorLineaValida) items.push("La ganancia por línea no puede ser negativa");
    if (!tomaMuestraValida) items.push("La toma de muestra no puede ser negativa");
    if (!domicilioValido) items.push("El servicio a domicilio no puede ser negativo");
    if (!tasaValida) items.push("No hay tasa registrada — cargala en Configuración");
    return items;
  }, [
    pacienteOk,
    lineas.length,
    descuentoValido,
    gananciaValida,
    gananciaPorLineaValida,
    tomaMuestraValida,
    domicilioValido,
    tasaValida,
  ]);

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
          // F7.2.T6 — modo abierto: arranca con el default de Config,
          // editable por línea de acá en adelante.
          gananciaPctInput: String(gananciaDefault),
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
          // F7.2.T6 — cerrado: sin input propio, lo gobierna el % global de
          // arriba. Desglosado: modo abierto, arranca con el default de
          // Config como cualquier línea suelta.
          gananciaPctInput: modo === "cerrado" ? "" : String(gananciaDefault),
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
    setIntentoGuardar(true);

    if (!canSubmit) {
      const target = !pacienteOk
        ? pacienteSectionRef.current
        : lineas.length === 0
          ? examenesSectionRef.current
          : ajustesSectionRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        toma_muestra_usd: tomaMuestraNum,
        // Desmarcar el check manda 0: es lo que lo saca del PDF y del total.
        domicilio_usd: domicilioNum,
        examenes: lineas.map((linea) => ({
          examen_id: linea.examen_id,
          ...(linea.paquete_id ? { paquete_id: linea.paquete_id } : {}),
          precio_base_snap: linea.precio_base_snap,
          // F7.2.T6 — `cerrado` es lo que el backend usa para decidir de
          // dónde sale la ganancia: si es true, ignora lo que venga en
          // `ganancia_pct` para esa línea y usa SIEMPRE la global del
          // payload (`ganancia_pct` de arriba). Una línea abierta manda
          // siempre la suya, explícita.
          cerrado: linea.cerrado,
          ...(linea.cerrado ? {} : { ganancia_pct: toNumber(linea.gananciaPctInput) }),
        })),
      };

      const response = await requestJson<{ id: string }>(
        mode === "create" ? "/api/presupuestos" : `/api/presupuestos/${initialData!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );

      notifySuccess(mode === "create" ? "Presupuesto guardado." : "Presupuesto actualizado.");
      if (onSaved) {
        onSaved(response.id);
        return;
      }

      router.push(`/presupuestos/${response.id}`);
      router.refresh();
    } catch (error) {
      setMessage(toHumanError(error));
      notifyError(error);
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

      <section
        ref={pacienteSectionRef}
        className={`grid gap-6 rounded-2xl border bg-card p-6 shadow-sm ${
          intentoGuardar && !pacienteOk ? "border-destructive" : "border-border"
        }`}
      >
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
                  onCreate={abrirCrearPaciente}
                  selectedLabel={pacienteLabel}
                  placeholder="Buscar por nombre, apellido o cédula"
                />
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

      <section ref={examenesSectionRef} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
                {mostrarColumnaGanancia ? (
                  <th className="px-4 py-3 font-medium">Ganancia %</th>
                ) : null}
                <th className="px-4 py-3 text-right font-medium">Precio final USD</th>
                <th className="px-4 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineas.length === 0 ? (
                <tr>
                  <td
                    colSpan={mostrarColumnaGanancia ? 6 : 5}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
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
                      {mostrarColumnaGanancia ? (
                        <td className="px-4 py-3">
                          {linea.cerrado ? (
                            <span className="text-xs text-muted-foreground">— (global)</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={linea.gananciaPctInput}
                              onChange={(event) => updateGananciaLinea(index, event.target.value)}
                              placeholder="0"
                              aria-label={`Ganancia % de ${linea.nombre_snap}`}
                              className={`h-9 w-24 rounded-md border bg-background px-2 text-sm ${
                                gananciaInvalida
                                  ? "border-destructive text-destructive"
                                  : "border-input"
                              }`}
                            />
                          )}
                        </td>
                      ) : null}
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
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-foreground">Servicios</h2>
          <p className="text-xs text-muted-foreground">
            Se cobran aparte de los exámenes: no les aplica el descuento ni la ganancia.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            <span>Toma de muestra (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={tomaMuestraUsd}
              onChange={(event) => setTomaMuestraUsd(event.target.value)}
              placeholder="0.00"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            {!tomaMuestraValida ? (
              <span className="text-xs text-destructive">No puede ser negativa.</span>
            ) : null}
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={domicilioActivo}
                onChange={(event) => {
                  const activo = event.target.checked;
                  setDomicilioActivo(activo);
                  if (!activo) setDomicilioUsd("");
                }}
                className="h-4 w-4 rounded border-input"
              />
              Servicio a domicilio
            </label>

            {domicilioActivo ? (
              <>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={domicilioUsd}
                  onChange={(event) => setDomicilioUsd(event.target.value)}
                  placeholder="0.00"
                  aria-label="Monto del servicio a domicilio en USD"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                {!domicilioValido ? (
                  <span className="text-xs text-destructive">No puede ser negativo.</span>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Marcalo si la muestra se toma en el domicilio del paciente.
              </p>
            )}
          </div>
        </div>
      </section>

      <section ref={ajustesSectionRef} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="space-y-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1.5">
                  Tasa Bs
                  <StaleTasaBadge />
                </span>
                {/* F7.2.T6 — de sólo lectura: se cambia desde Configuración,
                    no acá. "Guardada" es la que de verdad se usa al editar;
                    si la vigente difiere, se avisa sin tocar la guardada. */}
                {tasaValida ? (
                  <div className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-muted/30 px-3 text-sm">
                    <span className="font-mono tabular-nums text-foreground">
                      {tasaNum.toFixed(2)} Bs/USD
                    </span>
                    {mode === "create" && initialTasa ? (
                      <span className="text-xs capitalize text-muted-foreground">
                        {initialTasa.fuente}
                      </span>
                    ) : mode === "edit" ? (
                      <span className="text-xs text-muted-foreground">guardada</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex h-11 w-full items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      No hay tasa registrada.{" "}
                      <Link href="/config?tab=tasa" className="font-medium underline">
                        Cargala en Configuración
                      </Link>
                      .
                    </span>
                  </div>
                )}
                {mode === "edit" && vigenteTasa && vigenteTasa.tasa !== tasaNum ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      La tasa vigente es {vigenteTasa.tasa.toFixed(2)} Bs/USD ({vigenteTasa.fuente}
                      ). Este presupuesto mantiene la que tenía guardada.
                    </span>
                  </p>
                ) : null}
              </div>
            </div>

            {mostrarGananciaGlobal ? (
              <label className="block max-w-xs space-y-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <BadgePercent className="h-4 w-4 text-muted-foreground" />
                  Ganancia % (paquete cerrado)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={gananciaPct}
                  onChange={(event) => setGananciaPct(event.target.value)}
                  placeholder="0"
                  aria-label="Ganancia % del paquete cerrado"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                {!gananciaValida ? (
                  <span className="text-xs text-destructive">No puede ser negativa.</span>
                ) : (
                  <span className="block text-xs text-muted-foreground">
                    Se aplica sobre el precio base del paquete cerrado. Los exámenes sueltos usan
                    su propia columna.
                  </span>
                )}
              </label>
            ) : null}
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
                <span className="text-muted-foreground">{gananciaEtiqueta}</span>
                <span className="font-mono text-foreground">
                  {lineas.length === 0 ? "—" : formatUsd(gananciaMontoTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Toma de muestra</span>
                <span className="font-mono text-foreground">{formatUsd(tomaMuestraNum)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Servicio a domicilio</span>
                <span className="font-mono text-foreground">
                  {domicilioActivo ? formatUsd(domicilioNum) : "—"}
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

      <div className="flex flex-col items-end gap-3">
        {intentoGuardar && faltantes.length > 0 ? (
          <ul className="w-full space-y-1 text-right text-sm text-destructive sm:w-auto">
            {faltantes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {mode === "edit" && onCancelEdit ? (
            <Button type="button" variant="outline" onClick={onCancelEdit}>
              Cancelar
            </Button>
          ) : null}
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando…" : mode === "create" ? "Guardar presupuesto" : "Guardar cambios"}
          </Button>
        </div>
      </div>
      <PacienteFormDialog
        open={crearPacienteOpen}
        initialValues={crearPacienteInicial}
        onOpenChange={setCrearPacienteOpen}
        onSaved={(paciente) => {
          const item = aItemAutocomplete(paciente);
          setSelectedPaciente(item);
          setEditingPaciente(false);
          setPacienteLabel(`${item.nombre} ${item.apellido}`.trim());
        }}
      />
    </div>
  );
}
