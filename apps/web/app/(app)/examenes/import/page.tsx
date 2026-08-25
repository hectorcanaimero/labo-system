import { ImportWizard } from "./ImportWizard";

export const metadata = {
  title: "Importar Exámenes",
};

export default function ImportExamenesPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Importar Exámenes (XLSX)</h1>
        <p className="text-gray-600 mt-1">
          Sube un archivo Excel para crear o actualizar el catálogo masivamente.
        </p>
      </div>

      <ImportWizard />
    </div>
  );
}
