"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@labo/ui/feedback/toast";

interface ObservacionesPorGrupoProps {
  ordenId: string;
  estado: string;
  /** Líneas de la orden; de ahí salen los grupos, en orden de primera aparición. */
  examenes: Array<{ titulo_id: string | null; titulo: string | null }>;
  /** Observación de cada grupo, por `titulo_id`. */
  observaciones: Record<string, string>;
  puedeEditar: boolean;
}

/**
 * Una tarjeta por grupo de la orden: su observación (editable) y el botón del
 * PDF de ese grupo solo, para enviárselo al médico que lo lee.
 */
export function ObservacionesPorGrupo({
  ordenId,
  estado,
  examenes,
  observaciones,
  puedeEditar,
}: ObservacionesPorGrupoProps) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);

  const grupos = new Map<string, string>();
  for (const e of examenes) {
    if (e.titulo_id && !grupos.has(e.titulo_id)) grupos.set(e.titulo_id, e.titulo ?? "Grupo");
  }
  if (grupos.size === 0) return null;

  async function guardar(tituloId: string): Promise<void> {
    try {
      setGuardando(true);
      const res = await fetch(`/api/resultados/${ordenId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        // Se manda el mapa completo (el servidor lo reemplaza) y el estado
        // explícito e igual al actual, como en la observación general.
        body: JSON.stringify({
          observaciones_grupos: { ...observaciones, [tituloId]: borrador },
          estado,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `REQUEST_FAILED_${res.status}`);
      }
      notifySuccess("Observación guardada.");
      setEditando(null);
      router.refresh();
    } catch (reason) {
      notifyError(reason);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border p-6">
        <h2 className="text-lg font-semibold">Observaciones por grupo</h2>
        <p className="text-sm text-muted-foreground">
          Cada grupo sale en su hoja del informe y también se puede descargar por separado.
        </p>
      </div>
      <div className="divide-y divide-border">
        {Array.from(grupos, ([id, nombre]) => (
          <div key={id} className="space-y-3 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{nombre}</h3>
              <div className="flex gap-2">
                {puedeEditar && editando !== id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBorrador(observaciones[id] ?? "");
                      setEditando(id);
                    }}
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`/api/pdf/resultado/${ordenId}?grupo=${id}`, "_blank", "noopener,noreferrer")
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF del grupo
                </Button>
              </div>
            </div>
            {editando === id ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={borrador}
                  onChange={(event) => setBorrador(event.target.value)}
                  aria-label={`Observación de ${nombre}`}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditando(null)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" disabled={guardando} onClick={() => void guardar(id)}>
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {observaciones[id]?.trim() || "Sin observación."}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
