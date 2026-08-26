import { ForgotForm } from "./ForgotForm";

export const metadata = {
  title: "Recuperar contraseña — RV Laboratorio",
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
      <div className="mb-6 flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">RV Laboratorio</h1>
        <p className="text-sm text-muted-foreground">
          Ingresá tu email para recibir un link de recuperación
        </p>
      </div>
      <ForgotForm />
    </div>
  );
}
