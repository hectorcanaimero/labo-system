import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold text-red-500">Dashboard</h1>
      <p className="text-muted-foreground">
        Placeholder — LabSystem (F0.1.T2)
      </p>
      <Button>Botón shadcn</Button>
    </main>
  );
}
