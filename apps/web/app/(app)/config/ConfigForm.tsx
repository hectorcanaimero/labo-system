"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect } from "react";
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  AlertCircle 
} from "lucide-react";

import { configUpdateSchema, type ConfigUpdateInput } from "@labo/lib/schemas/config";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@labo/ui/feedback";
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

  const updateConfig = async (data: ConfigUpdateInput): Promise<void> => {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Error al guardar la configuración.");
    }
  };

  const setManualTasa = async (data: { tasa: number; motivo?: string }): Promise<void> => {
    const res = await fetch("/api/tasa/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "Error al actualizar la tasa.");
    }
  };

  const [savingConfig, setSavingConfig] = useState(false);
  const [updatingTasa, setUpdatingTasa] = useState(false);
  const [tasaInput, setTasaInput] = useState("");
  const [tasaMotivo, setTasaMotivo] = useState("");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (toast) {
      timer = setTimeout(() => {
        setToast(null);
      }, 5000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [toast]);

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
      });
    }
  }, [config, reset]);

  const onSaveConfig = async (data: ConfigUpdateInput) => {
    setSavingConfig(true);
    try {
      await updateConfig(data);
      showToast("Configuración del laboratorio guardada correctamente.", "success");
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Error al guardar la configuración.", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTasaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tasaInput) {
      showToast("Ingresá un valor de tasa válido.", "error");
      return;
    }

    const value = parseFloat(tasaInput);
    if (isNaN(value) || value <= 0) {
      showToast("La tasa debe ser un número positivo.", "error");
      return;
    }

    setUpdatingTasa(true);
    try {
      await setManualTasa({
        tasa: value,
        motivo: tasaMotivo || undefined,
      });
      setLatestTasa({
        tasa: value,
        fuente: "manual",
        scraped_at: new Date().toISOString(),
        motivo: tasaMotivo || null,
        stale: false,
      });
      showToast("Tasa de cambio actualizada correctamente.", "success");
      setTasaInput("");
      setTasaMotivo("");
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Error al actualizar la tasa.", "error");
    } finally {
      setUpdatingTasa(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Toast Alert Fijo */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-xl transition-all duration-300 animate-in slide-in-from-bottom-2 ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-2 text-white/80 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Columna Principal: Identidad, Contacto y PDF */}
      <div className="lg:col-span-2 space-y-6">
        <form onSubmit={handleSubmit(onSaveConfig)} className="space-y-6">
          {/* Tarjeta Identidad */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-1.5 border-b pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Identidad del Laboratorio</h2>
              <p className="text-xs text-muted-foreground text-sm">
                Configurá el nombre principal y RIF para documentos legales y presupuestos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="nombre" className="text-sm font-medium leading-none text-foreground">
                  Nombre del Laboratorio <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="nombre"
                    type="text"
                    placeholder="Ej. Laboratorio Clínico Central"
                    {...register("nombre")}
                    disabled={savingConfig}
                    className={`flex h-10 w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.nombre ? "border-destructive focus-visible:ring-destructive" : "border-input"}`}
                  />
                </div>
                {errors.nombre && (
                  <p className="text-xs font-medium text-destructive">
                    El nombre del laboratorio es requerido.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="rif" className="text-sm font-medium leading-none text-foreground">
                  RIF (Opcional)
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="rif"
                    type="text"
                    placeholder="J-12345678-9"
                    {...register("rif")}
                    disabled={savingConfig}
                    className={`flex h-10 w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.rif ? "border-destructive focus-visible:ring-destructive" : "border-input"}`}
                  />
                </div>
                {errors.rif && (
                  <p className="text-xs font-medium text-destructive">
                    El RIF debe tener el formato J-XXXXXXXX-X (ej. J-12345678-9).
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="colegio_bioanalistas" className="text-sm font-medium leading-none text-foreground">
                  Colegio de Bioanalistas
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="colegio_bioanalistas"
                    type="text"
                    placeholder="Ej. N° 713"
                    {...register("colegio_bioanalistas")}
                    disabled={savingConfig}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="mpps" className="text-sm font-medium leading-none text-foreground">
                  MPPS
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="mpps"
                    type="text"
                    placeholder="Ej. 10738"
                    {...register("mpps")}
                    disabled={savingConfig}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta Contacto */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-1.5 border-b pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Información de Contacto</h2>
              <p className="text-xs text-muted-foreground text-sm">
                Dirección y canales de atención que se mostrarán en la cabecera de reportes.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="direccion" className="text-sm font-medium leading-none text-foreground">
                Dirección Física <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                <input
                  id="direccion"
                  type="text"
                  placeholder="Ej. Av. Francisco de Miranda, Edif. Centro, Piso 1, Ofic. 12"
                  {...register("direccion")}
                  disabled={savingConfig}
                  className={`flex h-10 w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.direccion ? "border-destructive focus-visible:ring-destructive" : "border-input"}`}
                />
              </div>
              {errors.direccion && (
                <p className="text-xs font-medium text-destructive">
                  La dirección es requerida.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="telefono" className="text-sm font-medium leading-none text-foreground">
                  Teléfono de Contacto
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="telefono"
                    type="text"
                    placeholder="Ej. +58 212-5551234"
                    {...register("telefono")}
                    disabled={savingConfig}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-medium leading-none text-foreground">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <input
                    id="email"
                    type="email"
                    placeholder="Ej. contacto@laboratorio.com"
                    {...register("email")}
                    disabled={savingConfig}
                    className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta Personalización PDF */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-1.5 border-b pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Personalización de Documentos</h2>
              <p className="text-xs text-muted-foreground text-sm">
                Configurá el texto informativo que aparecerá al pie de página en los reportes PDF.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="pdf_pie_pagina" className="text-sm font-medium leading-none text-foreground">
                Mensaje de Pie de Página en PDF
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                <input
                  id="pdf_pie_pagina"
                  type="text"
                  placeholder="Ej. Resultados de referencia clínica. Consulte a su médico. No válido para efectos forenses."
                  {...register("pdf_pie_pagina")}
                  disabled={savingConfig}
                  className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <Button type="submit" disabled={savingConfig} className="w-full sm:w-auto">
              {savingConfig ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Columna Lateral: Assets, BCV & Usuarios */}
      <div className="space-y-6">
        {/* Sección Assets (Logo, Firma, Sello) */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-1.5 border-b pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Identidad Visual</h2>
            <p className="text-xs text-muted-foreground text-sm">
              Imágenes en formato PNG/JPG de hasta 2 MB. Se incrustarán automáticamente en reportes.
            </p>
          </div>

          <div className="space-y-4">
            <AssetUploader
              type="logo"
              label="Logo del Laboratorio"
              description="PNG o JPG, tamaño ideal cuadrado (máx. 2MB)"
              onSuccess={(msg) => showToast(msg, "success")}
              onError={(msg) => showToast(msg, "error")}
            />
            <AssetUploader
              type="firma"
              label="Firma de Validante"
              description="PNG transparente recomendado (máx. 2MB)"
              onSuccess={(msg) => showToast(msg, "success")}
              onError={(msg) => showToast(msg, "error")}
            />
            <AssetUploader
              type="sello"
              label="Sello del Laboratorio"
              description="PNG transparente recomendado (máx. 2MB)"
              onSuccess={(msg) => showToast(msg, "success")}
              onError={(msg) => showToast(msg, "error")}
            />
          </div>
        </div>

        {/* Sección Tasa BCV Manual */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-1.5 border-b pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Tasa de Cambio BCV</h2>
            <p className="text-xs text-muted-foreground text-sm">
              Valor del Bolívar respecto al Dólar para cotizar presupuestos.
            </p>
          </div>

          {latestTasa ? (
            <div className="rounded-lg bg-muted/30 p-4 space-y-2 text-xs border border-border">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tasa actual:</span>
                <span className="font-bold text-foreground text-sm">
                  {latestTasa.tasa.toFixed(2)} Bs./USD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Fuente:</span>
                <span className="capitalize font-medium text-foreground">{latestTasa.fuente}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Actualizada:</span>
                <span className="font-medium text-foreground">
                  {new Date(latestTasa.scraped_at).toLocaleString("es-VE", { timeZone: "America/Caracas" })}
                </span>
              </div>
              {latestTasa.motivo && (
                <div className="flex justify-between items-start gap-2 border-t pt-2 mt-2">
                  <span className="text-muted-foreground shrink-0">Motivo:</span>
                  <span className="italic text-foreground text-right">{latestTasa.motivo}</span>
                </div>
              )}
              
              {latestTasa.stale && (
                <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-2.5 text-xs font-medium text-yellow-600 border border-yellow-500/20 mt-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>La tasa actual tiene más de 24 horas (stale). Considere actualizarla.</span>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<AlertCircle className="h-5 w-5" />}
              title="Aún no hay tasa registrada"
              description="Cargá la tasa de cambio BCV para poder cotizar los presupuestos."
            />
          )}

          <form onSubmit={handleTasaSubmit} className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tasa-valor" className="text-xs font-medium text-foreground">
                Nueva Tasa (Bs./USD)
              </label>
              <input
                id="tasa-valor"
                type="number"
                step="0.01"
                required
                placeholder="Ej. 36.50"
                value={tasaInput}
                onChange={(e) => setTasaInput(e.target.value)}
                disabled={updatingTasa}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tasa-motivo" className="text-xs font-medium text-foreground">
                Motivo (Opcional)
              </label>
              <input
                id="tasa-motivo"
                type="text"
                placeholder="Ej. Ajuste manual de tasa"
                value={tasaMotivo}
                onChange={(e) => setTasaMotivo(e.target.value)}
                disabled={updatingTasa}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <Button type="submit" disabled={updatingTasa} className="w-full h-9 text-xs">
              {updatingTasa ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Actualizando...
                </>
              ) : (
                "Actualizar Tasa"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
