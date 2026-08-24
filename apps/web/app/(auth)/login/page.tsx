import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
      <div className="mb-6 flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">LabSystem</h1>
        <p className="text-sm text-muted-foreground">
          Ingresá tus credenciales para continuar
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
