"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Upload, FileImage } from "lucide-react";
import { validateAssetFile } from "@labo/lib/schemas/config";
import { Skeleton } from "@labo/ui/feedback";
import type { UploadStrategyResponse } from "@labo/lib/storage";

interface AssetUploaderProps {
  type: "logo" | "firma" | "sello";
  label: string;
  description: string;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export function AssetUploader({ type, label, description, onSuccess, onError }: AssetUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [currentAssetUrl, setCurrentAssetUrl] = useState<string | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar el asset actual (URL firmada de descarga) al montar.
  useEffect(() => {
    let cancelled = false;
    setLoadingAsset(true);
    fetch(`/api/config/assets/url?type=${type}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url?: string | null } | null) => {
        if (cancelled) return;
        setCurrentAssetUrl(data && typeof data.url === "string" ? data.url : null);
        setLoadingAsset(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentAssetUrl(null);
        setLoadingAsset(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación lado cliente
    const errorMsg = validateAssetFile({ type: file.type, size: file.size });
    if (errorMsg) {
      if (errorMsg === "ASSET_TAMANO_EXCEDIDO") {
        onError("El archivo supera el tamaño máximo permitido de 2 MB.");
      } else if (errorMsg === "ASSET_MIME_INVALIDO") {
        onError("Formato de archivo no válido. Solo se admiten imágenes.");
      } else {
        onError(`Error de validación: ${errorMsg}`);
      }
      return;
    }

    // Preview local inmediato
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);

    setUploading(true);
    try {
      // 1. Pedir upload strategy + key a InsForge
      const uploadRes = await fetch("/api/config/assets/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      if (!uploadRes.ok) {
        throw new Error("No se pudo iniciar la subida del archivo.");
      }
      const { strategy, key } = (await uploadRes.json()) as {
        strategy: UploadStrategyResponse;
        key: string;
      };

      // 2. Subir el archivo a InsForge Storage
      if (strategy.method === "presigned") {
        await fetch(strategy.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
      } else {
        const form = new FormData();
        for (const [field, value] of Object.entries(strategy.fields ?? {})) {
          form.append(field, value);
        }
        form.append("file", file);
        await fetch(strategy.uploadUrl, { method: "POST", body: form });
      }

      // 3. Confirmar la subida (verifica existencia y metadatos en Storage)
      await fetch("/api/config/assets/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          size: file.size,
          contentType: file.type,
          confirmUrl: strategy.confirmUrl,
        }),
      });

      // 4. Asociar el asset a la configuración
      const setRes = await fetch("/api/config/assets/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, key }),
      });
      if (!setRes.ok) {
        throw new Error("No se pudo asociar el archivo a la configuración.");
      }

      setCurrentAssetUrl(objectUrl);
      setLocalPreview(null);
      onSuccess(`¡Se actualizó el ${label} correctamente!`);
    } catch (err) {
      console.error(err);
      onError(err instanceof Error ? err.message : `Ocurrió un error al subir el ${label}.`);
      setLocalPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCardClick = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const activePreview = localPreview || currentAssetUrl;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>

      {loadingAsset && !localPreview ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div
          onClick={handleCardClick}
          className={`relative flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 transition-all hover:bg-muted/50 ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Subiendo...</span>
          </div>
        ) : activePreview ? (
          <div className="relative h-full w-full p-3 flex items-center justify-center">
            <img
              src={activePreview}
              alt={label}
              className="max-h-full max-w-full rounded-md object-contain"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
              <Upload className="h-5 w-5 text-white" />
              <span className="ml-1.5 text-xs text-white font-medium">Reemplazar</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <FileImage className="h-8 w-8 text-muted-foreground/60" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-primary">Subir {label}</span>
              <span className="text-[10px] text-muted-foreground">{description}</span>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
