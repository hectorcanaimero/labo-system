---
type: spec
phase: F6
package: branding
project_id: labo-system
version: 0.1
depends_on:
  - F1.config
blocks:
  - F6.catalogo
  - F6.presupuestos
generated_by: orch-spec
generated_at: 2026-08-25
title: "F6.branding — Branding & Templates Reales de RV Laboratorio"
---

# F6.6 · Branding & Templates Reales de RV Laboratorio

Incorporación del diseño real de PDFs, identidad visual corporativa y assets reales de RV Laboratorio:
1. Schemas & Config Institucional: flexibilizar `RIF_REGEX` en `@labo/lib/schemas/config.ts` (`^[VJGPEC]-\d{7,9}-\d$`), enriquecer campos institucionales (`colegio_bioanalistas`, `mpps`, `telefono`, `email`) y actualizar migración/seed de `laboratorio_config` con los datos de Lcda. Yuna Ramírez.
2. Plantillas `@react-pdf/renderer` de RV Laboratorio: rediseñar `PDFHeader.tsx`, `PacienteInfo.tsx`, `ExamenesTable.tsx`, `PDFFooter.tsx`, `ResultadoPDF.tsx` y `PresupuestoPDF.tsx` con paleta teal `#0E9090`, bandas `#DCDCDC`/`#E6E6E6`, columnas `PRUEBA | RESULTADO | UNIDAD | VALOR NORMAL | METODO`, cláusula médica legal y nota de validez de 24h.
3. Assets & Storage Seed: procesar y optimizar `1.png` (logo), firma y sello de `docs/logoypdfsrvlaboratorio/`, configurar script de seed/subida a InsForge Storage bucket `assets`, y validar resolución en endpoints `/api/pdf/*`.

---

## F6.6.T1 — Schemas & Config Institucional (RIF_REGEX, campos bioanálisis y seed)

### Objetivo

Flexibilizar la validación del RIF en `@labo/lib/schemas/config.ts` para aceptar personas naturales y jurídicas venezolanas (`^[VJGPEC]-\d{7,9}-\d$`), enriquecer la entidad institucional con `colegio_bioanalistas` y `mpps`, y actualizar la migración/seed de `laboratorio_config` con los datos profesionales de Lcda. Yuna Ramírez.

### Alcance

Sí hace:
- Actualizar `RIF_REGEX` en `packages/lib/schemas/config.ts` al patrón flexible `/^[VJGPEC]-\d{7,9}-\d$/`.
- Enriquecer `configUpdateSchema` y `configUpdatePartialSchema` con los campos opcionales `colegio_bioanalistas` y `mpps`.
- Crear migración SQL `packages/db/migrations/0008_laboratorio_config_institucional.sql` para añadir `colegio_bioanalistas text` y `mpps text` a la tabla `laboratorio_config`.
- Actualizar `packages/db/schema.sql` y `packages/db/repos/config.ts` para persistir, leer y auditar los nuevos campos.
- Actualizar el seed de configuración inicial con los datos oficiales: Lcda. Yuna Ramírez, Colegio de Bioanalistas N° 713, MPPS 10738, RIF institucional, teléfono y correo electrónico.
- Crear tests unitarios en `packages/lib/schemas/config.test.ts` y tests de repo en `packages/db/repos/config.integration.test.ts`.

No hace:
- Modificación de plantillas visuales `@react-pdf/renderer` (asignado a F6.6.T2).
- Carga de imágenes o assets binarios (asignado a F6.6.T3).

### Criterios de aceptación

- [ ] `RIF_REGEX` valida correctamente RIFs de personas naturales y jurídicas (`V-14794920-8`, `J-12345678-9`, `G-20000123-4`, etc.).
- [ ] La migración `0008_laboratorio_config_institucional.sql` aplica limpia sobre PostgreSQL.
- [ ] `laboratorio_config` persiste y retorna `colegio_bioanalistas` y `mpps`.
- [ ] Suite de tests unitarios y de integración de configuración pasa 100% en verde.

### Archivos afectados

- `packages/lib/schemas/config.ts`
- `packages/lib/schemas/config.test.ts`
- `packages/db/migrations/0008_laboratorio_config_institucional.sql`
- `packages/db/schema.sql`
- `packages/db/repos/config.ts`

### Dependencias

- Ninguna

### Estimación

1.5h

---

## F6.6.T2 — Plantillas @react-pdf/renderer de RV Laboratorio

### Objetivo

Rediseñar los componentes y documentos de `@react-pdf/renderer` (`PDFHeader.tsx`, `PacienteInfo.tsx`, `ExamenesTable.tsx`, `PDFFooter.tsx`, `ResultadoPDF.tsx` y `PresupuestoPDF.tsx`) con la identidad visual corporativa de RV Laboratorio: paleta Teal `#0E9090`, bandas de contraste `#DCDCDC` / `#E6E6E6`, columnas `PRUEBA | RESULTADO | UNIDAD | VALOR NORMAL | METODO`, cláusula médica legal y nota de validez de 24h.

### Alcance

Sí hace:
- Rediseñar `packages/pdf/components/PDFHeader.tsx` integrando el logo de RV Laboratorio, datos de cabecera institucionales (RIF, Colegio de Bioanalistas, MPPS, teléfonos y dirección) y franja de acento Teal `#0E9090`.
- Rediseñar `packages/pdf/components/PacienteInfo.tsx` con disposición estructurada en bandas `#DCDCDC`/`#E6E6E6`, edad desglosada con etapa clínica, sexo, cédula y fecha de toma de muestra.
- Rediseñar `packages/pdf/components/ExamenesTable.tsx` estructurado con cabecera en `#0E9090`, texto blanco en negrita, filas alternadas y las 5 columnas: `PRUEBA`, `RESULTADO`, `UNIDAD`, `VALOR NORMAL`, `METODO`.
- Rediseñar `packages/pdf/components/PDFFooter.tsx` con áreas designadas para firma digitalizada, sello del laboratorio, pie de página personalizable y cláusula médica legal de validez clínica y confidencialidad.
- Actualizar `packages/pdf/ResultadoPDF.tsx` para agrupar jerárquicamente por Título y Tipo de Análisis, mostrando el método clínico en su columna correspondiente.
- Actualizar `packages/pdf/PresupuestoPDF.tsx` con el nuevo diseño Teal `#0E9090`, desglose transparente de líneas en USD y Bs, y nota legal destacada: "Presupuesto válido por 24 horas a partir de su emisión".
- Crear o actualizar tests de renderizado en `packages/pdf`.

No hace:
- Subida de archivos binarios al storage (asignado a F6.6.T3).
- Lógica de conversión de base de datos (F6.5.T4).

### Criterios de aceptación

- [ ] Todas las plantillas PDF utilizan Teal `#0E9090` como color primario institucional.
- [ ] La tabla de exámenes renderiza exactamente las columnas `PRUEBA | RESULTADO | UNIDAD | VALOR NORMAL | METODO`.
- [ ] El pie de página incluye la cláusula médica legal de bioanálisis y validez clínica.
- [ ] `PresupuestoPDF.tsx` incluye la cláusula explícita de validez por 24 horas y montos transparentes en USD/Bs.
- [ ] Renderizado sin desbordes de página ni solapamiento de elementos en `@react-pdf/renderer`.

### Archivos afectados

- `packages/pdf/components/PDFHeader.tsx`
- `packages/pdf/components/PacienteInfo.tsx`
- `packages/pdf/components/ExamenesTable.tsx`
- `packages/pdf/components/PDFFooter.tsx`
- `packages/pdf/ResultadoPDF.tsx`
- `packages/pdf/PresupuestoPDF.tsx`

### Dependencias

- F6.6.T1

### Estimación

2.5h

---

## F6.6.T3 — Assets & Storage Seed (Logo, Firma, Sello y Endpoint Resolution)

### Objetivo

Procesar y optimizar los assets visuales corporativos (`1.png`, firma y sello de `docs/logoypdfsrvlaboratorio/`), construir script de seed / carga al bucket `assets` de InsForge Storage y verificar la resolución de URLs en los endpoints de generación de PDF.

### Alcance

Sí hace:
- Procesar y optimizar `docs/logoypdfsrvlaboratorio/1.png` para generar el logo oficial liviano (< 150KB) en formato PNG transparente.
- Extraer y vectorizar/optimizar los assets de firma y sello de la bioanalista responsable desde los documentos de muestra en `docs/logoypdfsrvlaboratorio/`.
- Crear script de inicialización `packages/db/scripts/seed-assets.ts` para sincronizar los assets al bucket `assets` de InsForge Storage y registrar sus `object_key` en `laboratorio_config`.
- Disponer copias de fallback en `apps/web/public/assets/` para generación local y testing offline.
- Verificar que los Route Handlers `apps/web/app/api/pdf/resultado/[id]/route.ts` y `apps/web/app/api/pdf/presupuesto/[id]/route.ts` resuelvan correctamente las URLs públicas firmadas de los assets sin bloqueos de red.
- Tests de integración de resolución de assets para exportación PDF.

No hace:
- Estructura de plantillas JSX de `@react-pdf/renderer` (F6.6.T2).

### Criterios de aceptación

- [ ] Logo, firma y sello optimizados están disponibles con fondo transparente y peso liviano (< 200KB).
- [ ] El script de seed de assets ejecuta idempotentemente y actualiza `laboratorio_config`.
- [ ] Los endpoints `/api/pdf/resultado/[id]` y `/api/pdf/presupuesto/[id]` descargan y embeben los assets en el PDF generado sin errores.
- [ ] Tests de integración de endpoints PDF pasan en verde.

### Archivos afectados

- `packages/db/scripts/seed-assets.ts`
- `apps/web/app/api/pdf/resultado/[id]/route.ts`
- `apps/web/app/api/pdf/presupuesto/[id]/route.ts`
- `apps/web/public/assets/logo.png`
- `apps/web/public/assets/firma.png`
- `apps/web/public/assets/sello.png`

### Dependencias

- F6.6.T1

### Estimación

1.5h
