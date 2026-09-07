"use client";

import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@labo/ui/feedback";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";
import { AssetUploader } from "./AssetUploader";

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

export function ConfigForm({ preloadedConfig, preloadedTasa }: ConfigFormProps) {
  const config = preloadedConfig;
  const [latestTasa, setLatestTasa] = useState<TasaPreloaded | null>(preloadedTasa);

  const [savingConfig, setSavingConfig] = useState(false);
  const [updatingTasa, setUpdatingTasa] = useState(false);
  const [refreshingBcv, setRefreshingBcv] = useState(false);
  const [tasaInput, setTasaInput] = useState("");
  const [tasaMotivo, setTasaMotivo] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
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

  async function setManualTasa(data: { tasa: number; motivo?: string }): Promise<void> {
    const res = await fetch("/api/tasa/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Error al actualizar la tasa.");
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

  async function handleTasaSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(tasaInput);
    if (Number.isNaN(value) || value <= 0) {
      notifyError("La tasa debe ser un número positivo.");
      return;
    }
    setUpdatingTasa(true);
    try {
      await setManualTasa({ tasa: value, motivo: tasaMotivo || undefined });
      setLatestTasa({
        tasa: value,
        fuente: "manual",
        scraped_at: new Date().toISOString(),
        motivo: tasaMotivo || null,
        stale: false,
      });
      notifySuccess("Tasa actualizada.");
      setTasaInput("");
      setTasaMotivo("");
    } catch (err) {
      notifyError(err);
    } finally {
      setUpdatingTasa(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Columna principal (2/3) */}
      <form onSubmit={handleSubmit(onSaveConfig)} className="lg:col-span-2 flex flex-col gap-4">
        {/* Identidad */}
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

        {/* Contacto */}
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

        {/* Personalización PDF */}
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

        {/* Presupuestos */}
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

        <div className="flex justify-end">
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
      </form>

      {/* Columna lateral (1/3) */}
      <aside className="flex flex-col gap-4">
        {/* Assets */}
        <Card className="shadow-none">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-sm font-semibold">Identidad visual</CardTitle>
            <CardDescription className="text-xs">
              PNG/JPG hasta 2 MB. Se incrusta en los PDF.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            <AssetUploader
              type="logo"
              label="Logo del Laboratorio"
              description="Ideal cuadrado, PNG con fondo transparente."
              onSuccess={notifySuccess}
              onError={notifyError}
            />
            <Separator />
            <AssetUploader
              type="firma"
              label="Firma del validante"
              description="PNG transparente."
              onSuccess={notifySuccess}
              onError={notifyError}
            />
            <Separator />
            <AssetUploader
              type="sello"
              label="Sello del laboratorio"
              description="PNG transparente."
              onSuccess={notifySuccess}
              onError={notifyError}
            />
          </CardContent>
        </Card>

        {/* Tasa BCV */}
        <Card className="shadow-none">
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
                  Motivo <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="tasa-motivo"
                  type="text"
                  placeholder="Ej. Ajuste manual"
                  value={tasaMotivo}
                  onChange={(e) => setTasaMotivo(e.target.value)}
                  disabled={updatingTasa}
                  className="h-8"
                />
              </div>
              <Button type="submit" size="sm" disabled={updatingTasa}>
                {updatingTasa ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Actualizando…
                  </>
                ) : (
                  "Actualizar tasa"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </aside>
    </div>
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
