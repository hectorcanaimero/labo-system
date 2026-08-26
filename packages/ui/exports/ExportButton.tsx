"use client";

import { useState } from "react";
import { notifyError } from "../feedback/toast";

export interface ExportButtonProps {
  actionName: string;
  filters?: Record<string, unknown>;
  className?: string;
}

const DownloadIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

const LoaderIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export function ExportButton({ actionName, filters = {}, className }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  // Feature flag NEXT_PUBLIC_FEATURE_EXPORTACION.
  // Enabled by default unless explicitly disabled via "false".
  const isEnabled = process.env.NEXT_PUBLIC_FEATURE_EXPORTACION !== "false";

  if (!isEnabled) {
    return null;
  }

  const handleExport = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/export/${actionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ filters }),
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
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `REQUEST_FAILED_${response.status}`);
      }

      const data = await response.json();
      if (!data?.url) {
        throw new Error("No se pudo generar la URL de descarga.");
      }

      // Open signed URL to start CSV download
      window.open(data.url, "_blank");
    } catch (error) {
      console.error(`Error exporting ${actionName}:`, error);
      notifyError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleExport}
      className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 gap-2 h-11 shrink-0 ${
        className || ""
      }`}
    >
      {loading ? (
        <LoaderIcon className="h-4 w-4 animate-spin" />
      ) : (
        <DownloadIcon className="h-4 w-4" />
      )}
      {loading ? "Exportando..." : "Exportar"}
    </button>
  );
}
