"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileSpreadsheet, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface ImportResult {
  titulos_creados: number;
  examenes_creados: number;
  examenes_actualizados: number;
  duplicados_ignorados: number;
  errores: { row: number; msg: string }[];
}

export function ImportWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile!);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]!);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    setResult(null);

    // Accept xlsx
    if (!selectedFile.name.endsWith(".xlsx") && selectedFile.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      setError("Por favor selecciona un archivo XLSX válido.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("El archivo es demasiado grande. El máximo permitido es 10 MB.");
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/examenes/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al procesar el archivo");
      }

      setResult(data as ImportResult);
      router.refresh();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Descarga de plantilla */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-blue-900">Plantilla de Excel</h3>
          <p className="text-sm text-blue-700 mt-1">
            Usa nuestra plantilla para asegurar que el formato sea correcto.
          </p>
        </div>
        <a href="/plantilla-import.xlsx" download>
          <Button variant="outline" className="bg-white hover:bg-gray-50 text-blue-700 border-blue-300">
            <Download className="w-4 h-4 mr-2" />
            Descargar
          </Button>
        </a>
      </div>

      {/* 2. Área de Drag & Drop */}
      {!result && (
        <div 
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
          } ${file ? 'bg-gray-50 border-solid border-gray-400' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".xlsx" 
            className="hidden" 
          />
          
          {file ? (
            <div className="flex flex-col items-center">
              <FileSpreadsheet className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <div className="mt-6 flex space-x-3">
                <Button variant="outline" onClick={resetState} disabled={loading}>
                  Cambiar archivo
                </Button>
                <Button onClick={handleUpload} disabled={loading}>
                  {loading ? "Procesando..." : "Importar Datos"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <UploadCloud className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-900">
                Arrastra y suelta tu archivo XLSX aquí
              </p>
              <p className="text-xs text-gray-500 mt-1 mb-4">
                o haz clic para explorar en tu computadora
              </p>
              <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                Seleccionar archivo
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Errores de validación previa o de red */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 shrink-0" />
          <div>
            <h3 className="font-medium text-red-900">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Resultados de la importación */}
      {result && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 mr-3" />
              <h2 className="text-lg font-semibold text-green-900">Importación finalizada</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-card p-4 rounded-md border border-border text-center">
                <p className="text-2xl font-bold text-gray-900">{result.titulos_creados}</p>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">Grupos Creados</p>
              </div>
              <div className="bg-card p-4 rounded-md border border-border text-center">
                <p className="text-2xl font-bold text-gray-900">{result.examenes_creados}</p>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">Exámenes Creados</p>
              </div>
              <div className="bg-card p-4 rounded-md border border-border text-center">
                <p className="text-2xl font-bold text-gray-900">{result.examenes_actualizados}</p>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">Exámenes Actualizados</p>
              </div>
              <div className="bg-card p-4 rounded-md border border-border text-center">
                <p className="text-2xl font-bold text-gray-900">{result.errores.length}</p>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">Filas con Error</p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-green-200">
              <Button variant="outline" onClick={resetState}>
                Realizar otra importación
              </Button>
            </div>
          </div>

          {result.errores && result.errores.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
              <div className="bg-gray-50 border-b px-4 py-3">
                <h3 className="font-medium text-gray-900">Detalle de errores ({result.errores.length})</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-medium w-24">Fila</th>
                      <th className="px-4 py-3 font-medium">Descripción del error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.errores.map((err, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">#{err.row}</td>
                        <td className="px-4 py-3 text-red-600">{err.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
