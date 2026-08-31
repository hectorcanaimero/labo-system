import { ForgotForm } from "./ForgotForm";

export const metadata = {
  title: "Recuperar contraseña — RV Laboratorio",
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm rounded-md border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-5 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">RV Laboratorio</h1>
        <p className="text-xs text-muted-foreground">
          Ingresá tu email para recibir un código de recuperación
        </p>
      </div>
      <ForgotForm />
    </div>
  );
}
