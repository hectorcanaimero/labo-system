"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "[LabSystem] Falta la variable de entorno NEXT_PUBLIC_CONVEX_URL. " +
      "Defínela en apps/web/.env.local apuntando a tu deployment de Convex " +
      "(ver .env.example). Sin ella el cliente Convex no puede conectarse.",
  );
}

const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
