import { LoginForm } from "./login/LoginForm";

interface Props {
  searchParams: { reset?: string };
}

export default function LoginPage({ searchParams }: Props) {
  const resetOk = searchParams.reset === "ok";

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
      {resetOk ? (
        <div className="mb-4 rounded-md bg-green-600/10 p-3 text-sm font-medium text-green-700">
          Contraseña actualizada correctamente. Ingresá con tu nueva contraseña.
        </div>
      ) : null}
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <img
          src="/logo.png"
          alt="RV Laboratorio"
          className="h-16 w-16 rounded-xl object-contain"
        />
        <h1 className="text-2xl font-bold tracking-tight">RV Laboratorio</h1>
        <p className="text-sm text-muted-foreground">
          Ingresá tus credenciales para continuar
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
