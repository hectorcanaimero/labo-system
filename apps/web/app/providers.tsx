"use client";

import { createClient } from "@insforge/sdk";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Providers de la ruta `(auth)` (ADR-11 / F0.2.T8).
 *
 * Reemplaza `ConvexAuthNextjsProvider`. Instancia un cliente InsForge
 * (@insforge/sdk) y lo expone a los descendientes vía contexto para futuros
 * consumidores (LogoutButton, forms de reset/invitación, etc.).
 *
 * Nota: el login (F0.2.T8) se hace server-side vía `POST /api/me` para poder
 * imponer rate limit y audit log del lado servidor. El SDK cliente queda
 * disponible para operaciones no-sensibles (leer sesión, refresh, logout best
 * effort) sin depender de que cada consumer haga wiring manual.
 */

type InsforgeClient = ReturnType<typeof createClient>;

const InsforgeContext = createContext<InsforgeClient | null>(null);

function readEnv(): { baseUrl: string; anonKey: string } {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  if (!baseUrl || baseUrl.length === 0) {
    throw new Error(
      "[LabSystem] Falta NEXT_PUBLIC_INSFORGE_URL en el entorno del cliente. " +
        "Definila en apps/web/.env.local apuntando al backend InsForge.",
    );
  }
  if (!anonKey || anonKey.length === 0) {
    throw new Error(
      "[LabSystem] Falta NEXT_PUBLIC_INSFORGE_ANON_KEY en el entorno del cliente.",
    );
  }
  return { baseUrl, anonKey };
}

export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const { baseUrl, anonKey } = readEnv();
    return createClient({ baseUrl, anonKey });
  }, []);

  return (
    <InsforgeContext.Provider value={client}>
      {children}
    </InsforgeContext.Provider>
  );
}

/**
 * Hook para acceder al cliente InsForge desde componentes cliente.
 * Lanza si se usa fuera de `<Providers>` — falla temprano en vez de silencio.
 */
export function useInsforge(): InsforgeClient {
  const client = useContext(InsforgeContext);
  if (!client) {
    throw new Error(
      "[LabSystem] useInsforge() debe usarse dentro de <Providers>.",
    );
  }
  return client;
}
