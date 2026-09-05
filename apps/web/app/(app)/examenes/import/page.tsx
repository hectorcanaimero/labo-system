import { PageHeader } from "@/components/layout/PageHeader";

import { ImportWizard } from "./ImportWizard";

export const metadata = {
  title: "Importar Exámenes",
};

export default function ImportExamenesPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader
        title="Importar exámenes"
        count="XLSX"
        description="Subí un archivo Excel para crear o actualizar el catálogo masivamente."
        back={{ href: "/examenes", label: "Exámenes" }}
      />

      <ImportWizard />
    </div>
  );
}
