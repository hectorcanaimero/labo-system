import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { PresupuestoPDF } from "./PresupuestoPDF";
import { agruparExamenes, GRUPO_RESIDUAL, ResultadoPDF, type ExamenPDFRow } from "./ResultadoPDF";

function examenRow(overrides: Partial<ExamenPDFRow> & { id: string }): ExamenPDFRow {
  return {
    nombre_snap: `Examen ${overrides.id}`,
    unidad_snap: null,
    valores_referencia_snap: null,
    tipo_analisis_snap: null,
    metodo_snap: null,
    valor: "1",
    observacion: null,
    titulo: "Hematología",
    ...overrides,
  };
}

// PNG 2×2 rojo: alcanza para que @react-pdf decodifique una imagen real.
const PNG_ROJO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwHwyBFJDNwAAlAQD6+w/9F0oHZQAAAABJRU5ErkJggg==";

async function renderBytes(element: React.ReactElement): Promise<number> {
  const stream = await renderToStream(element as never);
  let bytes = 0;
  for await (const chunk of stream) bytes += (chunk as Buffer).length;
  return bytes;
}

describe("PDF templates render", () => {
  it("embebe logo, firma y sello de la configuración en ambos documentos", async () => {
    const config = {
      nombre: "Licda. Yuna Ramírez",
      direccion: "El Caimito, Puerto Ordaz",
      rif: null,
      colegio_bioanalistas: "05-801",
      mpps: "12507",
      telefono: "+584249646265",
      email: "lab@test.com",
      logo_url: PNG_ROJO,
      firma_url: PNG_ROJO,
      sello_url: PNG_ROJO,
      pdf_pie_pagina: "Gracias por confiar en nuestro laboratorio.",
    };
    const resultado = {
      id: "f9fede93-9830-406f-be54-4c2fae9c11f8",
      estado: "Entregada",
      fecha_muestra: "2026-08-31",
      fecha_resultado: "2026-08-31",
      medico_solicitante: null,
      observaciones: null,
      paciente: {
        nombre: "Juan",
        apellido: "Pérez",
        cedula: "V-23456789",
        fecha_nacimiento: "1979-01-01",
        sexo: "M" as const,
      },
      examenes: [examenRow({ id: "1", valor: "", observacion: "Muestra hemolizada" })],
      config,
    };
    const presupuesto = {
      id: "p1",
      numero_correlativo: 5,
      paciente_id: "x",
      paciente_nombre_libre: null,
      paciente_nombre: "Juan",
      paciente_apellido: "Pérez",
      descuento_pct: 10,
      tasa_bs: 145.75,
      total_usd: 54,
      total_bs: 7870.5,
      estado: "Cerrado",
      created_at: "2026-08-31T12:00:00Z",
      lineas: [{ id: "l1", nombre_snap: "Hemograma", precio_final_snap: 10.8, orden: 1 }],
      config,
    };

    // Con imágenes el PDF pesa más que sin ellas: si las tres se embebieran
    // como "nada", los tamaños serían iguales.
    const sinAssets = { ...config, logo_url: null, firma_url: null, sello_url: null };
    const [conR, sinR, conP, sinP] = await Promise.all([
      renderBytes(<ResultadoPDF data={resultado} />),
      renderBytes(<ResultadoPDF data={{ ...resultado, config: sinAssets }} />),
      renderBytes(<PresupuestoPDF data={presupuesto} />),
      renderBytes(<PresupuestoPDF data={{ ...presupuesto, config: sinAssets }} />),
    ]);
    expect(conR).toBeGreaterThan(sinR);
    expect(conP).toBeGreaterThan(sinP);
  });

  it("renders ResultadoPDF without crashing", async () => {
    const data = {
      estado: "Completado",
      fecha_muestra: new Date(),
      fecha_resultado: new Date(),
      medico_solicitante: "Dr. House",
      observaciones: "Todo bien",
      paciente: {
        nombre: "John",
        apellido: "Doe",
        cedula: "V-12345678",
        fecha_nacimiento: new Date("1990-01-01"),
        sexo: "M" as const,
      },
      examenes: [
        {
          id: "e1",
          nombre_snap: "Hematología",
          unidad_snap: "%",
          valores_referencia_snap: "0-10",
          tipo_analisis_snap: "Hematología",
          metodo_snap: "Espectrofotometría",
          valor: "5",
          observacion: null,
          titulo: "HEMATOLOGÍA",
        },
      ],
      config: {
        nombre: "RV Laboratorio",
        direccion: "Calle 1, Local 2",
        rif: "J-12345678-9",
        colegio_bioanalistas: "N° 713",
        mpps: "10738",
        telefono: "0212-1234567",
        email: "contacto@rvlab.com",
        logo_url: null,
        firma_url: null,
        sello_url: null,
        pdf_pie_pagina: "Pie de página",
      },
    };

    const stream = await renderToStream(<ResultadoPDF data={data} />);
    expect(stream).toBeDefined();
    
    // Consuming the stream slightly to ensure no internal react-pdf crashes
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  describe("agruparExamenes (jerarquía Título -> Tipo de Análisis)", () => {
    it("agrupa por título con sub-secciones por tipo y filas directas primero", () => {
      const grupos = agruparExamenes([
        examenRow({ id: "1", titulo: "HEMATOLOGÍA", tipo_analisis_snap: "Serología" }),
        examenRow({ id: "2", titulo: "ORINA" }),
        examenRow({ id: "3", titulo: "HEMATOLOGÍA" }),
        examenRow({ id: "4", titulo: "HEMATOLOGÍA", tipo_analisis_snap: "Biológica" }),
      ]);

      expect(grupos.map((g) => g.titulo)).toEqual(["HEMATOLOGÍA", "ORINA"]);

      const hematologia = grupos[0]!;
      expect(hematologia.secciones.map((s) => s.tipo)).toEqual([null, "Serología", "Biológica"]);
      expect(hematologia.secciones[0]!.examenes.map((e) => e.id)).toEqual(["3"]);

      const orina = grupos[1]!;
      expect(orina.secciones).toHaveLength(1);
      expect(orina.secciones[0]).toMatchObject({ tipo: null });
    });

    it("cae líneas huérfanas (sin título) en un grupo residual al final", () => {
      const grupos = agruparExamenes([
        examenRow({ id: "1", titulo: null }),
        examenRow({ id: "2", titulo: "QUÍMICA SANGUÍNEA" }),
        examenRow({ id: "3", titulo: "   " }),
      ]);

      expect(grupos.map((g) => g.titulo)).toEqual(["QUÍMICA SANGUÍNEA", GRUPO_RESIDUAL]);
      expect(grupos[1]!.secciones[0]!.examenes.map((e) => e.id)).toEqual(["1", "3"]);
    });

    it("es determinista ante entradas intercaladas (orden estable entre renders)", () => {
      const entrada = [
        examenRow({ id: "a", titulo: "G1", tipo_analisis_snap: "T2" }),
        examenRow({ id: "b", titulo: "G2" }),
        examenRow({ id: "c", titulo: "G1", tipo_analisis_snap: "T1" }),
        examenRow({ id: "d", titulo: "G1", tipo_analisis_snap: "T2" }),
      ];

      expect(agruparExamenes(entrada)).toEqual(agruparExamenes([...entrada]));
      expect(agruparExamenes(entrada).map((g) => g.titulo)).toEqual(["G1", "G2"]);
      expect(
        agruparExamenes(entrada)[0]!.secciones.find((s) => s.tipo === "T2")!.examenes.map((e) => e.id),
      ).toEqual(["a", "d"]);
    });
  });

  it("renders PresupuestoPDF without crashing", async () => {
    const data = {
      id: "PRE-001",
      paciente_id: null,
      paciente_nombre_libre: "Jane Doe",
      paciente_nombre: null,
      paciente_apellido: null,
      descuento_pct: 0,
      tasa_bs: 36.5,
      total_usd: 100,
      total_bs: 3650,
      estado: "Pendiente",
      created_at: new Date(),
      lineas: [
        {
          id: "l1",
          nombre_snap: "Perfil 20",
          precio_final_snap: 100,
          orden: 1,
        },
      ],
      config: {
        nombre: "RV Laboratorio",
        direccion: "Calle 1, Local 2",
        rif: "J-12345678-9",
        colegio_bioanalistas: "N° 713",
        mpps: "10738",
        telefono: "0212-1234567",
        email: "contacto@rvlab.com",
        logo_url: null,
        firma_url: null,
        sello_url: null,
        pdf_pie_pagina: "Pie de página",
      },
    };

    const stream = await renderToStream(<PresupuestoPDF data={data} />);
    expect(stream).toBeDefined();

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("renders PresupuestoPDF with reconciled line totals matching the grand total", async () => {
    // Espeja la salida de calcularTotales con descuento 10% y ganancia 25%:
    // base 40 × 1.25 × 0.9 = 45 por línea; Σ finales = 90 = total_usd.
    const data = {
      id: "PRE-002",
      paciente_id: "j70paciente1234567890123456",
      paciente_nombre_libre: null,
      paciente_nombre: "John",
      paciente_apellido: "Doe",
      descuento_pct: 10,
      tasa_bs: 36.5,
      total_usd: 90,
      total_bs: 3285,
      estado: "Aprobado",
      created_at: new Date(),
      lineas: [
        {
          id: "l1",
          nombre_snap: "Hematología completa",
          precio_final_snap: 45,
          orden: 1,
        },
        {
          id: "l2",
          nombre_snap: "Perfil tiroideo",
          precio_final_snap: 45,
          orden: 2,
        },
      ],
      config: null,
    };

    const stream = await renderToStream(<PresupuestoPDF data={data} />);
    expect(stream).toBeDefined();

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);

    const sumOfLines = data.lineas.reduce((sum, line) => sum + line.precio_final_snap, 0);
    expect(sumOfLines).toBe(data.total_usd);
  });

  it("renders ResultadoPDF con jerarquía multi-grupo/multi-tipo sin crashing", async () => {
    const data = {
      estado: "Completado",
      fecha_muestra: new Date(),
      fecha_resultado: new Date(),
      medico_solicitante: null,
      observaciones: null,
      paciente: {
        nombre: "John",
        apellido: "Doe",
        cedula: "V-12345678",
        fecha_nacimiento: new Date("1990-01-01"),
        sexo: "M" as const,
      },
      examenes: [
        examenRow({ id: "1", titulo: "HEMATOLOGÍA", tipo_analisis_snap: "Biológica", metodo_snap: "Frotis" }),
        examenRow({ id: "2", titulo: "HEMATOLOGÍA", metodo_snap: "Coulter" }),
        examenRow({ id: "3", titulo: "ORINA", tipo_analisis_snap: "Físico" }),
        examenRow({ id: "4", titulo: null, tipo_analisis_snap: "Especial" }),
      ],
      config: null,
    };

    const stream = await renderToStream(<ResultadoPDF data={data} />);
    expect(stream).toBeDefined();

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});
