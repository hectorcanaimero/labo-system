import { ResetForm } from "./ResetForm";

export const metadata = {
  title: "Nueva contraseña — LabSystem",
};

interface Props {
  searchParams: { token?: string };
}

export default function ResetPasswordPage({ searchParams }: Props) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
      <div className="mb-6 flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">LabSystem</h1>
        <p className="text-sm text-muted-foreground">
          Elegí tu nueva contraseña
        </p>
      </div>
      <ResetForm token={token} />
    </div>
  );
}
