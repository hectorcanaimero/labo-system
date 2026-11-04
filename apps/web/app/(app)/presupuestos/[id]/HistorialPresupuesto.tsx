import { Download, History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HistorialEvento } from "@labo/db/repos/presupuestos";
import {
  diffSnapshots,
  type CambioHistorial,
  type SnapshotPresupuesto,
} from "@labo/lib/presupuesto-historial";

function titulo(evento: HistorialEvento): string {
  const m = evento.metadata;
  switch (evento.accion) {
    case "presupuestos.create":
      return "Presupuesto creado";
    case "presupuestos.update":
      return "Presupuesto editado";
    case "presupuestos.update_estado":
      return `Estado: ${String(m.estado_anterior ?? "?")} → ${String(m.estado ?? "?")}`;
    case "presupuestos.convert_to_orden":
      return "Convertido en orden";
    default:
      return evento.accion;
  }
}

function cambios(evento: HistorialEvento): CambioHistorial[] {
  const { antes, despues } = evento.metadata as {
    antes?: SnapshotPresupuesto;
    despues?: SnapshotPresupuesto;
  };
  return antes && despues ? diffSnapshots(antes, despues) : [];
}

function fecha(value: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Caracas",
  }).format(new Date(value));
}

export function HistorialPresupuesto({
  presupuestoId,
  eventos,
}: {
  presupuestoId: string;
  eventos: HistorialEvento[];
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border py-3">
        <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" />
          Historial
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {eventos.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">Sin movimientos registrados.</p>
        ) : (
          <ol className="divide-y divide-border">
            {eventos.map((evento) => {
              const lista = cambios(evento);
              return (
                <li key={evento.id} className="space-y-1 px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">{titulo(evento)}</span>
                    <span className="text-muted-foreground">
                      {fecha(evento.created_at)} · {evento.usuario_nombre ?? "Sistema"}
                    </span>
                  </div>
                  {(evento.metadata as { despues?: unknown }).despues ? (
                    <a
                      href={`/api/pdf/presupuesto/${presupuestoId}?evento=${evento.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Download className="h-3 w-3" />
                      PDF de esta versión
                    </a>
                  ) : null}
                  {lista.length > 0 ? (
                    <ul className="space-y-0.5 text-muted-foreground">
                      {lista.map((c) => (
                        <li key={c.campo}>
                          {c.campo}:{" "}
                          <span className="font-mono tabular-nums">
                            {c.antes} → {c.despues}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
