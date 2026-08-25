import { ConfigForm } from "./ConfigForm";

export default async function ConfigPage() {
  const preloadedConfig = null;
  const preloadedTasa = null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración del Laboratorio</h1>
        <p className="text-muted-foreground text-sm">
          Gestioná la identidad del laboratorio, datos de contacto, firmas, sellos, tasas de cambio y usuarios.
        </p>
      </div>
      <ConfigForm 
        preloadedConfig={preloadedConfig} 
        preloadedTasa={preloadedTasa} 
      />
    </div>
  );
}
