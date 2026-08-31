import { LoginForm } from "./login/LoginForm";

interface Props {
  searchParams: { reset?: string };
}

export default function LoginPage({ searchParams }: Props) {
  const resetOk = searchParams.reset === "ok";

  return (
    <div className="w-full max-w-sm rounded-md border border-border bg-card p-6 text-card-foreground shadow-sm">
      {resetOk ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          Contraseña actualizada. Ingresá con tu nueva contraseña.
        </div>
      ) : null}
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="RV Laboratorio"
          className="h-12 w-12 rounded-md object-contain"
        />
        <h1 className="text-xl font-semibold tracking-tight">RV Laboratorio</h1>
        <p className="text-xs text-muted-foreground">
          Ingresá tus credenciales para continuar
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
