"use client";

import { useForm, type FieldErrors, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import { configUpdateSchema, type ConfigUpdateInput } from "@labo/lib/schemas/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@labo/ui/feedback";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";
import { AssetUploader } from "./AssetUploader";
import { CatalogoPanel } from "../catalogo/tipos-y-metodos/CatalogoPanel";

export interface ConfigPreloaded {
  nombre: string;
  direccion: string;
  telefono: string | null;
  email: string | null;
  rif: string | null;
  colegio_bioanalistas: string | null;
  mpps: string | null;
  pdf_pie_pagina: string | null;
  toma_muestra_default_usd: number;
}

export interface TasaPreloaded {
  tasa: number;
  fuente: string;
  scraped_at: string;
  motivo: string | null;
  stale: boolean;
}

interface ConfigFormProps {
  preloadedConfig: ConfigPreloaded | null;
  preloadedTasa: TasaPreloaded | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Pestañas (F7.6.T1)
// ────────────────────────────────────────────────────────────────────────────

const TAB_IDS = ["laboratorio", "presupuestos", "imagen", "tasa", "catalogo"] as const;
type TabId = (typeof TAB_IDS)[number];
const DEFAULT_TAB: TabId = "laboratorio";

function isTabId(value: string | null): value is TabId {
  return !!value && (TAB_IDS as readonly string[]).includes(value);
}

/**
 * A qué pestaña salta el submit si el error de validación cae en un campo
 * de otra pestaña. Sólo hace falta mapear los campos que `configUpdateSchema`
 * puede rechazar (nombre, direccion, rif, toma_muestra_default_usd); el
 * resto son `.optional()` sin `.refine()`, así que nunca entran a `errors`.
 */
const FIELD_TAB: Partial<Record<keyof ConfigUpdateInput, TabId>> = {
  nombre: "laboratorio",
  direccion: "laboratorio",
  rif: "laboratorio",
  toma_muestra_default_usd: "presupuestos",
};

const FORM_TABS = new Set<TabId>(["laboratorio", "presupuestos", "imagen"]);

function ErrorDot() {
  return (
    <span
      aria-hidden
      className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-destructive"
    />
  );
}

export function ConfigForm({ preloadedConfig, preloadedTasa }: ConfigFormProps) {
  const config = preloadedConfig;
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const fromUrl = searchParams.get("tab");
    return isTabId(fromUrl) ? fromUrl : DEFAULT_TAB;
  });

  // Cambiar de pestaña actualiza la URL a mano con la History API en vez de
  // `router.replace`: esta página es `force-dynamic`, así que un
  // `router.replace`/`push` de Next re-navega y vuelve a correr el Server
  // Component — nueva referencia de `preloadedConfig`, el efecto de abajo
  // dispara `reset()` y se pierde lo que el usuario escribió en otra
  // pestaña. La URL igual queda enlazable (`?tab=tasa`) y el botón
  // atrás/adelante del navegador la sigue (listener de `popstate`), pero
  // sin pasar por el router de Next ni recargar datos del server.
  useEffect(() => {
    function onPopState() {
      const fromUrl = new URLSearchParams(window.location.search).get("tab");
      if (isTabId(fromUrl)) setActiveTab(fromUrl);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function changeTab(next: string) {
    if (!isTabId(next)) return;
    setActiveTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  const [latestTasa, setLatestTasa] = useState<TasaPreloaded | null>(preloadedTasa);

  const [savingConfig, setSavingConfig] = useState(false);
  const [updatingTasa, setUpdatingTasa] = useState(false);
  const [refreshingBcv, setRefreshingBcv] = useState(false);
  const [tasaInput, setTasaInput] = useState("");
  const [tasaMotivo, setTasaMotivo] = useState("");
  /**
   * Datos del último rechazo por outlier. Mientras esté seteado, el formulario
   * ofrece forzar la carga: es la salida del admin cuando la tasa se movió de
   * verdad más que el umbral. No se ofrece de entrada para que forzar sea una
   * decisión consciente y no el camino por defecto.
   */
  const [tasaRechazada, setTasaRechazada] = useState<
    { tasa: number; anterior: number | null } | null
  >(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ConfigUpdateInput>({
    resolver: zodResolver(configUpdateSchema),
    defaultValues: {
      nombre: config?.nombre || "",
      direccion: config?.direccion || "",
      telefono: config?.telefono || "",
      email: config?.email || "",
      rif: config?.rif || "",
      colegio_bioanalistas: config?.colegio_bioanalistas || "",
      mpps: config?.mpps || "",
      pdf_pie_pagina: config?.pdf_pie_pagina || "",
      toma_muestra_default_usd: config?.toma_muestra_default_usd ?? 0,
    },
  });

  useEffect(() => {
    if (config) {
      reset({
        nombre: config.nombre,
        direccion: config.direccion,
        telefono: config.telefono || "",
        email: config.email || "",
        rif: config.rif || "",
        colegio_bioanalistas: config.colegio_bioanalistas || "",
        mpps: config.mpps || "",
        pdf_pie_pagina: config.pdf_pie_pagina || "",
        toma_muestra_default_usd: config.toma_muestra_default_usd,
      });
    }
  }, [config, reset]);

  async function updateConfig(data: ConfigUpdateInput): Promise<void> {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Error al guardar la configuración.");
    }
  }

  async function onSaveConfig(data: ConfigUpdateInput) {
    setSavingConfig(true);
    try {
      await updateConfig(data);
      notifySuccess("Configuración guardada.");
    } catch (err) {
      notifyError(err);
    } finally {
      setSavingConfig(false);
    }
  }

  /**
   * Un campo inválido puede estar en una pestaña que no es la activa (p.ej.
   * el RIF quedó mal en Laboratorio mientras se estaba mirando Presupuestos).
   * Saltar a la primera pestaña con error para que el usuario no tenga que
   * buscarlo.
   */
  function onInvalidConfig(formErrors: FieldErrors<ConfigUpdateInput>) {
    const firstField = (Object.keys(formErrors) as (keyof ConfigUpdateInput)[]).find(
      (field) => FIELD_TAB[field] !== undefined,
    );
    const tab = firstField ? FIELD_TAB[firstField] : undefined;
    if (tab && tab !== activeTab) {
      changeTab(tab);
    }
  }

  async function handleRefreshBcv() {
    setRefreshingBcv(true);
    try {
      const res = await fetch("/api/tasa/refresh-bcv", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            reason?: string;
            tasa?: number;
            fuente?: "bcv" | "dolartoday";
            scraped_at?: string;
            tasa_intentada?: number;
            primary_message?: string;
            fallback_message?: string;
          }
        | null;

      if (!res.ok || !payload?.ok) {
        const code = payload?.error ?? `HTTP_${res.status}`;
        if (code === "REJECTED_OUTLIER") {
          notifyError(
            `Tasa rechazada (variación fuera de rango): ${payload?.tasa_intentada?.toFixed(2)}`,
          );
        } else if (code === "SCRAPE_FAILED") {
          notifyError(
            `BCV y fallback fallaron. ${payload?.primary_message ?? ""}`.trim(),
          );
        } else {
          notifyError(`No se pudo actualizar (${code}).`);
        }
        return;
      }

      setLatestTasa({
        tasa: payload.tasa ?? 0,
        fuente: payload.fuente ?? "bcv",
        scraped_at: payload.scraped_at ?? new Date().toISOString(),
        motivo: null,
        stale: false,
      });
      notifySuccess(
        `Tasa actualizada desde ${payload.fuente === "bcv" ? "BCV" : "fallback"}: ${payload.tasa?.toFixed(2)} Bs/USD.`,
      );
    } catch (err) {
      notifyError(err);
    } finally {
      setRefreshingBcv(false);
    }
  }

  // El botón pasa a "Forzar tasa" sólo si el rechazo previo fue por el valor
  // que está escrito ahora: cambiar el número vuelve al flujo normal.
  const forzandoTasa =
    tasaRechazada !== null && parseFloat(tasaInput) === tasaRechazada.tasa;

  async function handleTasaSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(tasaInput);
    if (Number.isNaN(value) || value <= 0) {
      notifyError("La tasa debe ser un número positivo.");
      return;
    }
    // Sólo se fuerza si el rechazo previo fue por ESTA misma tasa: cambiar el
    // número reinicia el flujo y vuelve a pasar por la guarda.
    const forzando = tasaRechazada !== null && tasaRechazada.tasa === value;
    const motivo = tasaMotivo.trim();

    if (forzando && motivo.length === 0) {
      notifyError("Para forzar la tasa hay que escribir un motivo.");
      return;
    }

    setUpdatingTasa(true);
    try {
      const res = await fetch("/api/tasa/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasa: value,
          motivo: motivo || undefined,
          ...(forzando ? { force: true } : {}),
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; tasa_anterior?: number; tasa_intentada?: number }
        | null;

      if (!res.ok || !payload?.ok) {
        const code = payload?.error ?? `HTTP_${res.status}`;
        if (code === "TASA_RECHAZADA_OUTLIER") {
          setTasaRechazada({ tasa: value, anterior: payload?.tasa_anterior ?? null });
          notifyError(
            `Tasa rechazada (variación fuera de rango): intentaste ${payload?.tasa_intentada?.toFixed(2)}, la anterior sigue en ${payload?.tasa_anterior?.toFixed(2)}.`,
          );
        } else if (code === "MOTIVO_REQUERIDO_PARA_FORZAR") {
          notifyError("Para forzar la tasa hay que escribir un motivo.");
        } else {
          notifyError(`No se pudo actualizar la tasa (${code}).`);
        }
        return;
      }

      setLatestTasa({
        tasa: value,
        fuente: "manual",
        scraped_at: new Date().toISOString(),
        motivo: motivo || null,
        stale: false,
      });
      notifySuccess(forzando ? "Tasa forzada y registrada en auditoría." : "Tasa actualizada.");
      setTasaInput("");
      setTasaMotivo("");
      setTasaRechazada(null);
    } catch (err) {
      notifyError(err);
    } finally {
      setUpdatingTasa(false);
    }
  }

  const laboratorioHasError = Boolean(errors.nombre || errors.direccion || errors.rif);
  const presupuestosHasError = Boolean(errors.toma_muestra_default_usd);

  return (
    <Tabs value={activeTab} onValueChange={changeTab} className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="laboratorio">
          Laboratorio
          {laboratorioHasError ? <ErrorDot /> : null}
        </TabsTrigger>
        <TabsTrigger value="presupuestos">
          Presupuestos
          {presupuestosHasError ? <ErrorDot /> : null}
        </TabsTrigger>
        <TabsTrigger value="imagen">Imagen</TabsTrigger>
        <TabsTrigger value="tasa">Tasa de cambio</TabsTrigger>
        <TabsTrigger value="catalogo">Tipos y métodos</TabsTrigger>
      </TabsList>

      {/*
        Un solo <form> para Laboratorio + Presupuestos + Imagen: cambiar de
        pestaña no desmonta react-hook-form (no usa `shouldUnregister`), así
        que lo escrito en una pestaña sobrevive el viaje a otra. `className
        ="contents"` para que el <form> no meta un nivel extra en el layout
        de <Tabs> (TabsList / TabsContent siguen siendo "hermanos" a efectos
        de flex/grid) sin dejar de ser un elemento real donde puede caer el
        submit. Tasa y Catálogo quedan AFUERA a propósito: cada uno tiene su
        propio submit (o ninguno) y un <form> no puede anidar otro <form>.
      */}
      <form onSubmit={handleSubmit(onSaveConfig, onInvalidConfig)} className="contents">
        <TabsContent value="laboratorio" className="flex flex-col gap-4">
          <Card className="shadow-none">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-sm font-semibold">Identidad</CardTitle>
              <CardDescription className="text-xs">
                Nombre y datos fiscales para documentos legales.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <FieldText
                id="nombre"
                label="Nombre del Laboratorio"
                required
                placeholder="Ej. Laboratorio Clínico Central"
                register={register("nombre")}
                disabled={savingConfig}
                error={errors.nombre ? "El nombre es requerido." : undefined}
              />
              <FieldText
                id="rif"
                label="RIF"
                placeholder="J-12345678-9"
                register={register("rif")}
                disabled={savingConfig}
                error={
                  errors.rif
                    ? "Formato inválido (ej. J-12345678-9)."
                    : undefined
                }
              />
              <FieldText
                id="colegio_bioanalistas"
                label="Colegio de Bioanalistas"
                placeholder="Ej. N° 713"
                register={register("colegio_bioanalistas")}
                disabled={savingConfig}
              />
              <FieldText
                id="mpps"
                label="MPPS"
                placeholder="Ej. 10738"
                register={register("mpps")}
                disabled={savingConfig}
              />
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-sm font-semibold">Contacto</CardTitle>
              <CardDescription className="text-xs">
                Dirección y canales que aparecen en la cabecera de los PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-4">
              <FieldText
                id="direccion"
                label="Dirección Física"
                required
                placeholder="Av. Francisco de Miranda, Edif. Centro, Piso 1"
                register={register("direccion")}
                disabled={savingConfig}
                error={errors.direccion ? "La dirección es requerida." : undefined}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldText
                  id="telefono"
                  label="Teléfono"
                  placeholder="+58 212-555-1234"
                  register={register("telefono")}
                  disabled={savingConfig}
                />
                <FieldText
                  id="email"
                  label="Correo Electrónico"
                  type="email"
                  placeholder="contacto@laboratorio.com"
                  register={register("email")}
                  disabled={savingConfig}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-sm font-semibold">
                Personalización de documentos
              </CardTitle>
              <CardDescription className="text-xs">
                Texto legal que se imprime al pie de cada PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <FieldText
                id="pdf_pie_pagina"
                label="Pie de página del PDF"
                placeholder="Ej. Consulte a su médico. No válido para efectos forenses."
                register={register("pdf_pie_pagina")}
                disabled={savingConfig}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presupuestos">
          <Card className="shadow-none">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-sm font-semibold">Presupuestos</CardTitle>
              <CardDescription className="text-xs">
                Valor con el que se precarga la toma de muestra en un presupuesto nuevo. Se
                puede cambiar en cada presupuesto.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <FieldText
                id="toma_muestra_default_usd"
                label="Toma de muestra por defecto (USD)"
                type="number"
                placeholder="0.00"
                register={register("toma_muestra_default_usd", {
                  // El input devuelve string; el schema espera number y el campo
                  // es opcional, así que el vacío tiene que llegar como undefined
                  // en vez de como NaN.
                  setValueAs: (value) =>
                    value === "" || value === null || value === undefined
                      ? undefined
                      : Number(value),
                })}
                disabled={savingConfig}
                error={errors.toma_muestra_default_usd?.message}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imagen">
          <Card className="shadow-none">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-sm font-semibold">Identidad visual</CardTitle>
              <CardDescription className="text-xs">
                PNG/JPG hasta 2 MB. Se incrusta en los PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
              <AssetUploader
                type="logo"
                label="Logo del Laboratorio"
                description="Ideal cuadrado, PNG con fondo transparente."
                onSuccess={notifySuccess}
                onError={notifyError}
              />
              <AssetUploader
                type="firma"
                label="Firma del validante"
                description="PNG transparente."
                onSuccess={notifySuccess}
                onError={notifyError}
              />
              <AssetUploader
                type="sello"
                label="Sello del laboratorio"
                description="PNG transparente."
                onSuccess={notifySuccess}
                onError={notifyError}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {FORM_TABS.has(activeTab) ? (
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:shadow-sm">
            <span className="text-xs text-muted-foreground">
              {isDirty ? "Cambios sin guardar." : "Todo guardado."}
            </span>
            <Button type="submit" size="sm" disabled={savingConfig}>
              {savingConfig ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </div>
        ) : null}
      </form>

      <TabsContent value="tasa">
        <Card className="mx-auto max-w-lg shadow-none">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-sm font-semibold">Tasa de cambio BCV</CardTitle>
            <CardDescription className="text-xs">
              Bs por USD, usada al cotizar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full justify-center"
              onClick={() => void handleRefreshBcv()}
              disabled={refreshingBcv || updatingTasa}
            >
              {refreshingBcv ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Consultando BCV…
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Actualizar desde BCV
                </>
              )}
            </Button>

            {latestTasa ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-border bg-muted/30 p-3 text-xs">
                <dt className="text-muted-foreground">Tasa actual</dt>
                <dd className="text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                  {latestTasa.tasa.toFixed(2)}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    Bs/USD
                  </span>
                </dd>
                <dt className="text-muted-foreground">Fuente</dt>
                <dd className="text-right font-medium capitalize text-foreground">
                  {latestTasa.fuente}
                </dd>
                <dt className="text-muted-foreground">Actualizada</dt>
                <dd className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {new Date(latestTasa.scraped_at).toLocaleString("es-VE", {
                    timeZone: "America/Caracas",
                  })}
                </dd>
                {latestTasa.motivo ? (
                  <>
                    <dt className="col-span-2 mt-1 text-muted-foreground">Motivo</dt>
                    <dd className="col-span-2 italic text-foreground">
                      {latestTasa.motivo}
                    </dd>
                  </>
                ) : null}
                {latestTasa.stale ? (
                  <div className="col-span-2 mt-1 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Más de 24h desde la última actualización.</span>
                  </div>
                ) : null}
              </dl>
            ) : (
              <EmptyState
                compact
                icon={<AlertCircle className="h-5 w-5" />}
                title="Sin tasa registrada"
                description="Cargá la tasa para poder cotizar presupuestos."
              />
            )}

            <form onSubmit={handleTasaSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tasa-valor" className="text-xs">
                  Nueva tasa <span className="text-muted-foreground">(Bs/USD)</span>
                </Label>
                <Input
                  id="tasa-valor"
                  type="number"
                  step="0.01"
                  required
                  placeholder="36.50"
                  value={tasaInput}
                  onChange={(e) => setTasaInput(e.target.value)}
                  disabled={updatingTasa}
                  className="h-8 font-mono tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tasa-motivo" className="text-xs">
                  Motivo{" "}
                  <span className="text-muted-foreground">
                    {forzandoTasa ? "(obligatorio para forzar)" : "(opcional)"}
                  </span>
                </Label>
                <Input
                  id="tasa-motivo"
                  type="text"
                  placeholder={forzandoTasa ? "Ej. Devaluación del 60% del 7/9" : "Ej. Ajuste manual"}
                  value={tasaMotivo}
                  onChange={(e) => setTasaMotivo(e.target.value)}
                  disabled={updatingTasa}
                  className="h-8"
                />
              </div>

              {forzandoTasa ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    La guarda rechazó {tasaRechazada?.tasa.toFixed(2)} por variación fuera de
                    rango
                    {tasaRechazada?.anterior != null
                      ? ` contra ${tasaRechazada.anterior.toFixed(2)}`
                      : ""}
                    . Si la tasa se movió de verdad, escribí el motivo y volvé a enviar: se
                    guarda igual y queda registrado en auditoría.
                  </span>
                </div>
              ) : null}

              <Button
                type="submit"
                size="sm"
                variant={forzandoTasa ? "destructive" : "default"}
                disabled={updatingTasa}
              >
                {updatingTasa ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Actualizando…
                  </>
                ) : forzandoTasa ? (
                  "Forzar tasa"
                ) : (
                  "Actualizar tasa"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="catalogo" className="flex flex-col gap-4">
        <CatalogoPanel
          titulo="Tipos de análisis"
          descripcion="Clasificación del examen. Es obligatoria al crearlo y agrupa los resultados en el PDF."
          endpoint="/api/examenes/tipos-analisis"
          singular="tipo"
          placeholderNuevo="Ej. Análisis Citogenético"
        />
        <CatalogoPanel
          titulo="Métodos"
          descripcion="Técnica con la que se procesa el examen. Es opcional."
          endpoint="/api/examenes/metodos"
          singular="método"
          placeholderNuevo="Ej. Quimioluminiscencia"
        />
      </TabsContent>
    </Tabs>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: field con Label + Input + error
// ────────────────────────────────────────────────────────────────────────────

interface FieldTextProps {
  id: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  register: UseFormRegisterReturn;
  disabled?: boolean;
  error?: string;
}

function FieldText({
  id,
  label,
  required,
  placeholder,
  type = "text",
  register,
  disabled,
  error,
}: FieldTextProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-9 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
        {...register}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
