import { ResetForm } from "./ResetForm";

export const metadata = {
  title: "Nueva contraseña — RV Laboratorio",
};

interface Props {
  searchParams: { email?: string };
}

export default function ResetPasswordPage({ searchParams }: Props) {
  const email = typeof searchParams.email === "string" ? searchParams.email : "";

  return (
    <div className="w-full max-w-sm rounded-md border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-5 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">RV Laboratorio</h1>
        <p className="text-xs text-muted-foreground">
          Ingresá el código y elegí tu nueva contraseña
        </p>
      </div>
      <ResetForm email={email} />
    </div>
  );
}
