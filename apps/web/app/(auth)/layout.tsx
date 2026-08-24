import type { ReactNode } from "react";

import { Providers } from "@/app/providers";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-6">
        {children}
      </main>
    </Providers>
  );
}
