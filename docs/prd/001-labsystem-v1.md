---
type: prd
project_id: labo-system
version: 0.1
generated_by: orch-prd
generated_at: 2026-08-23
title: LabSystem — Sistema de Gestión de Laboratorio Clínico (v1)
---

# PRD: LabSystem — Sistema de Gestión de Laboratorio Clínico (v1)

> Migración del plugin WordPress `RV Laboratorio v1.2.1` a una aplicación web
> moderna independiente, con dashboard, búsqueda eficiente, exportación de
> datos y doble moneda USD/Bs para el mercado venezolano.

## 1. Problema y motivación

El laboratorio clínico opera hoy sobre un plugin WordPress (`rv-laboratorio`
v1.2.1) que gestiona el flujo completo: pacientes, catálogo de exámenes,
resultados con PDF, presupuestos con doble moneda USD/Bs y paquetes
reutilizables. En producción viven **204+ pacientes, 250+ exámenes en 6
grupos, 652 resultados, 545 presupuestos y 9 paquetes**.

El sistema actual tiene limitaciones que ya afectan la operación diaria:

- **No hay dashboard** — el panel de inicio está en blanco, no hay visibilidad
  del estado del laboratorio.
- **No hay búsqueda ni filtros** en listas grandes (200+ pacientes, 650+
  resultados, 500+ presupuestos). Encontrar un registro es lento.
- **Tasa de cambio USD/Bs se ingresa a mano por presupuesto**, sin fuente
  única. Alto riesgo de error y esfuerzo repetitivo.
- **Campo "Nombre del Laboratorio" puede quedar vacío**, lo que genera PDFs
  sin identificar (bug crítico documentado en la auditoría, afecta validez
  legal de los informes).
- **Duplicados en catálogo** ("CULTIVO Y ANTIBIOGRAMA" x2, "Estradiol" x2,
  etc.) porque el sistema no valida al crear.
- **Cédulas con formato inconsistente** (`V-21197865`, `V- 33338896`, sin
  puntos, con espacios) — impide búsqueda confiable.
- **No hay exportación de datos** para reportes contables o análisis externos.
- **Dependencia de WordPress**, con toda su carga operativa (actualizaciones,
  seguridad, performance).

**Objetivo de negocio**: eliminar la dependencia de WordPress, ganar
velocidad y confiabilidad en la generación de PDFs, habilitar
búsqueda/filtrado en listas grandes, y agregar capacidades nuevas
(dashboard, exportación, tasa de cambio automática, presupuestos ágiles)
sin perder ni un byte de datos históricos.

## 2. Usuarios y personas

Sistema mono-tenant (un solo laboratorio en v1). Dos roles.

### Persona A: Rosa — Directora del laboratorio (Admin)

- **Rol**: dueña / directora clínica, revisa todo, firma informes, cierra
  cuentas del mes.
- **Contexto**: 45-55 años, Caracas / interior de Venezuela. Trabaja desde
  laptop en el laboratorio, ocasionalmente desde casa. Conocimiento tecnológico
  medio: usa Excel, WhatsApp Business, sistema de facturación básico.
- **Dolor actual**: no ve el estado del negocio de un vistazo, tiene que
  entrar módulo por módulo. No puede exportar a Excel para su contador.
  Cambia la tasa BCV una vez al día y la carga a mano en cada presupuesto.
- **Objetivo con este producto**: dashboard con KPIs del mes, exportación
  a Excel/CSV, tasa BCV automática, gestión del catálogo sin depender del
  proveedor de WordPress.

### Persona B: Carla — Recepcionista / bioanalista jr (Operador)

- **Rol**: recibe pacientes, arma órdenes de trabajo, imprime PDFs de
  resultados y presupuestos, cobra.
- **Contexto**: 25-35 años, jornada completa en el laboratorio. Usa PC de
  escritorio (Chrome). Volumen: 20-40 interacciones diarias con el sistema.
- **Dolor actual**: buscar un paciente entre 200+ es lento; a veces un
  paciente llega apurado y sólo quiere "un presupuesto rápido" sin dar
  ni el nombre completo; cargar exámenes uno a uno cuando hay un paquete
  típico es tedioso.
- **Objetivo con este producto**: búsqueda en tiempo real, presupuestos
  con nombre libre sin ficha completa, carga de paquetes con un clic,
  conversión de presupuesto aprobado a resultado en un botón.

### Persona C: Rubén — Contador externo (consumidor secundario)

- **Rol**: no usa el sistema directamente, pero recibe exportes de Rosa
  para cerrar el mes.
- **Necesidad**: recibir XLSX/CSV limpios con presupuestos, costos y
  totales del período.

## 3. Objetivos y métricas de éxito

| Objetivo | Métrica | Target 3M | Target 6M |
|----------|---------|-----------|-----------|
| Reemplazar el plugin WP en producción | % de operaciones diarias en LabSystem | 100% | 100% |
| Cero pérdida de datos históricos | Registros migrados / registros origen | 100% (204 pacientes, 652 resultados, 545 presupuestos, 9 paquetes) | — |
| Búsqueda instantánea en listas grandes | Tiempo p95 de respuesta de búsqueda | ≤ 300 ms | ≤ 300 ms |
| PDFs generados rápido | Tiempo p95 de generación de PDF | ≤ 3 s | ≤ 2 s |
| Reducción de errores por tasa BCV | % presupuestos con tasa cargada a mano | ≤ 20% (con override manual disponible) | ≤ 5% |
| Adopción de exportación | Cantidad de exportes/mes | ≥ 4 | ≥ 12 |
| Eliminar PDFs sin nombre de laboratorio | Cantidad de PDFs con encabezado vacío | 0 | 0 |
| Disponibilidad | Uptime mensual | 99.5% | 99.5% |

## 4. Alcance

### 4.1 In scope (v1)

**Módulos funcionales (8)**:

- **F1 · Dashboard** *(NUEVO — no existe en el plugin actual)*
  - KPIs del mes: pacientes, resultados, presupuestos, ingresos estimados USD.
  - Gráfico de resultados por mes (últimos 6 meses) con Recharts.
  - Actividad reciente: últimos 5 resultados y últimos 5 presupuestos.
  - Accesos directos a los módulos operativos.

- **F2 · Configuración de Empresa** *(solo Admin)*
  - Nombre del laboratorio (obligatorio, valida no vacío antes de guardar).
  - Dirección (obligatorio), teléfono, email, RIF venezolano.
  - Logo, firma del responsable, sello del laboratorio (assets en Convex
    File Storage, embebidos en PDFs).
  - Mensaje de pie de página PDF.
  - Bloqueo de generación de PDFs si el nombre está vacío.
  - Campo global de "última tasa BCV usada" para pre-rellenar presupuestos.

- **F3 · Pacientes**
  - CRUD con cédula única normalizada (formato `V-12345678` o `E-...`,
    sin espacios ni puntos).
  - Búsqueda en tiempo real (debounce 300 ms) por nombre y cédula.
  - Ficha con historial de resultados y presupuestos ordenados desc.
  - Cálculo automático de edad.

- **F4 · Catálogo de Exámenes**
  - Jerarquía: Título (grupo) → Examen.
  - CRUD flexible de Títulos y Exámenes (sin IDs de grupo hardcoded en
    schema; el cliente puede reestructurar sin migración destructiva).
  - Importación masiva desde Excel (xlsx / SheetJS) con reporte de creados,
    actualizados y duplicados.
  - Búsqueda en tiempo real dentro del catálogo, con highlight del término.
  - Validación de duplicados por nombre exacto dentro del mismo Título.
  - Soporte de veterinaria como un Título más (sin tratamiento especial).

- **F5 · Resultados**
  - Autocomplete de paciente por nombre/cédula.
  - Agregar exámenes uno a uno o cargar un Paquete completo.
  - Snapshot de nombre y precio por línea (`nombre_snap`, `precio_snap`)
    para que editar el catálogo no afecte registros históricos.
  - Fechas de muestra y de resultado, médico solicitante, valor por examen,
    observaciones.
  - Estados: Pendiente / Completado.
  - Generación de PDF con `@react-pdf/renderer`, con encabezado del
    laboratorio, datos del paciente, tabla de exámenes, firma y sello.
  - Búsqueda por nombre/cédula/rango de fechas.

- **F6 · Presupuestos**
  - Autocomplete de paciente O **nombre libre sin ficha** (nuevo — atiende
    "a veces el paciente no quiere ni dar el nombre, o hay que generarlo
    rápido"). Schema: `paciente_id?: Id<"pacientes">` +
    `paciente_nombre_libre?: string`; exactamente uno de los dos poblado.
  - Selección de exámenes o carga de Paquete.
  - Descuento %, Ganancia % (interno, no aparece en PDF), tasa Bs/USD
    pre-rellenada desde Config Empresa (editable por presupuesto).
  - Cálculo en tiempo real: `Total USD = subtotal × (1 - descuento%) × (1 + ganancia%)`;
    `Total Bs = Total USD × tasa`. Bs con formato de miles.
  - Estados: Borrador / Aprobado / Convertido.
  - **Convertir Presupuesto → Resultado** en un botón, precargando
    paciente y exámenes.
  - PDF con doble moneda (sin mostrar la ganancia interna).

- **F7 · Paquetes**
  - Agrupaciones reutilizables de exámenes.
  - Constructor con drag-and-drop (**dnd-kit**), split view catálogo ↔ paquete.
  - Nombre único por paquete.
  - Cargables desde Resultados y Presupuestos con un clic.

- **F8 · Migración WP → Convex** *(one-shot, herramienta interna Admin)*
  - Script/wizard que importa las tablas custom del plugin:
    pacientes, títulos, exámenes, paquetes, resultados (+ detalle),
    presupuestos (+ detalle).
  - Normalización de cédulas (`V- 21.197.865` → `V-21197865`).
  - Snapshot de nombre/precio en tablas de detalle.
  - Reporte de ítems migrados, errores, duplicados detectados.
  - Idempotente (re-ejecutable sin duplicar).

- **F9 · Auth y Roles**
  - **Convex Auth** nativo (credenciales propias, sin OAuth en v1).
  - Roles: Admin (todo) / Operador (sin Config Empresa ni Catálogo).
  - Sesiones ~8 h.

- **F10 · Exportación de datos** *(NUEVO — pedido cliente)*
  - Exportación CSV / XLSX por listado: Pacientes, Presupuestos, Resultados,
    Costos (histórico de precios por examen).
  - Botón "Exportar" por lista, respetando filtros aplicados.
  - Se ejecuta como Convex action (parseo/generación server-side vía SheetJS).

**Requerimientos no funcionales**:

- Rendimiento: PDF ≤ 3 s p95, búsqueda ≤ 300 ms p95.
- Disponibilidad: 99.5% mensual (Convex Cloud + Vercel).
- Seguridad: HTTPS obligatorio, datos médicos cifrados en tránsito
  (TLS de plataforma), autenticación Convex Auth.
- Usabilidad: Chrome/Firefox/Edge últimas 2 versiones. Responsive hasta
  tablet 768px. Mobile NO es prioridad v1.
- Escalabilidad: soportar 10.000 resultados sin degradación.
- Backup: retención 30 días (feature nativo de Convex Cloud).

### 4.2 Out of scope (deferido)

- **Multi-tenant** (varios laboratorios sobre la misma instancia) — se
  evalúa en Fase 2 como nice-to-have del PRD original.
- **App mobile nativa** — v1 es web-only.
- **OAuth / SSO** (Google, Microsoft) — sólo credenciales propias en v1.
- **Facturación electrónica SENIAT** — fuera del alcance clínico.
- **Portal de pacientes** (que el paciente vea sus resultados) — evaluar en
  Fase 3.
- **Integración con equipos de laboratorio** (LIS / analizadores) — fuera
  del alcance v1.
- **Notificaciones por WhatsApp / email** al paciente — Fase 2.

### 4.3 Non-goals

- **NO** replicamos la UI de WordPress. Rediseño completo con shadcn/ui.
- **NO** mantenemos el plugin en paralelo después del cutover — es reemplazo,
  no coexistencia.
- **NO** hacemos historial clínico completo (HCE). Somos gestor de laboratorio,
  no EMR.
- **NO** exponemos API pública v1. Es app cerrada.
- **NO** hacemos internacionalización. Español (VE) fijo.

## 5. Restricciones y trade-offs

### 5.1 Restricciones técnicas

- **Stack confirmado (NO negociable)**:
  - Backend: **Convex** (DB, queries, mutations, actions, file storage).
  - Auth: **Convex Auth** nativo.
  - PDF: **@react-pdf/renderer** (no Puppeteer — descartado por costo
    operativo y complejidad en runtime serverless).
  - Frontend: **Next.js 14 App Router** + **shadcn/ui** + Tailwind.
  - Charts: Recharts. Drag & drop: dnd-kit. Excel: xlsx (SheetJS).
  - Monorepo: **pnpm workspaces + turborepo**.
  - Deploy: Vercel (frontend) + Convex Cloud (backend).

  ```
  apps/web            — Next.js 14 App Router
  packages/convex     — schema, queries, mutations, actions
  packages/ui         — shadcn compartido
  packages/lib        — types + utils compartidos
  packages/pdf        — plantillas @react-pdf
  ```

- **Runtime PDF**: `@react-pdf/renderer` corre server-side. Definir dónde
  vive el rendering (Convex action node runtime vs Next route handler) es
  un SPIKE — impacta la latencia y el modelo de streaming del PDF al cliente.

- **Migración de datos**: la fuente son tablas custom de WordPress
  (MySQL). El mapping a las colecciones Convex es un SPIKE dedicado.

- **Sin Puppeteer, sin Chromium** en producción. Toda generación de PDF
  debe ser 100% React-PDF.

### 5.2 Restricciones de negocio

- **Contexto Venezuela**: doble moneda USD/Bs, RIF, cédula V-/E-, tasa BCV
  volátil (a veces cambia intra-día).
- **Presupuesto limitado y timeline agresivo**: cliente espera core
  operativo en semanas, no meses.
- **Cero downtime tolerable** en el cutover: la migración debe ejecutarse en
  ventana corta con rollback preparado.
- **Idioma español rioplatense/venezolano** en toda la UI y documentación.

### 5.3 Trade-offs conscientes

- **Convex sobre Postgres/Prisma**: elegimos productividad y realtime
  built-in sobre madurez del ecosistema SQL. Riesgo: vendor lock-in y
  algunos patrones (reportes analíticos, joins complejos) son más verbosos.
  Mitigación: exportación de datos como escape hatch.
- **@react-pdf sobre Puppeteer**: elegimos simplicidad de deploy y coste
  bajo sobre control tipográfico total. Trade-off: layouts complejos
  requieren más código React.
- **Convex Auth sobre Clerk**: elegimos cero-dependencias-externas sobre
  ecosistema maduro. Fallback: Clerk queda como plan B si Convex Auth
  no está prod-ready para nuestro caso (ver SPIKE).
- **Mono-tenant sobre multi-tenant**: elegimos velocidad de entrega sobre
  reutilización. Un solo `laboratorio_config` singleton; multi-tenant
  entra en Fase 2 con refactor de schema.
- **Web-only sobre PWA/mobile**: el operador trabaja desde escritorio;
  mobile no aporta valor en v1.

## 6. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Migración WP pierde datos históricos | Media | **Alta** | Script idempotente + dry-run + backup MySQL previo + reporte de diffs. Validación fila-por-fila post-import. |
| `@react-pdf` no rinde suficiente en Convex actions | Media | Alta | SPIKE dedicado. Fallback: Next route handler con streaming; o pre-render diferido con job. |
| Scraper BCV se rompe (bcv.org.ve cambia HTML) | **Alta** | Media | SPIKE con dos opciones: fetch+cheerio + API tercero (DolarToday) como fallback. Alerta a Admin si la última tasa tiene > 24 h. |
| Convex Auth no cubre casos edge (recuperación de contraseña, invitaciones) | Media | Media | SPIKE prod-readiness. Plan B: migrar a Clerk sin tocar dominio. |
| Cédulas duplicadas o inconsistentes en origen | Alta | Media | Script de normalización con reporte de conflictos; resolución manual asistida antes del cutover. |
| Exportación de listas grandes (500+) satura navegador | Media | Baja | SPIKE performance. Streaming server-side con SheetJS; paginación en la UI. |
| Cliente cambia estructura de grupos de exámenes mid-project | Alta | Media | Schema flexible sin IDs hardcoded. SPIKE reestructuración post-reunión con cliente. |
| Doble moneda con redondeo Bs mal calculado | Media | Alta | SPIKE formato/redondeo Bs (tributario, decimales). Tests unitarios exhaustivos. |
| Vendor lock-in Convex | Baja | Media | Exportación de datos como salida siempre disponible. Documentar procedimiento de export completo. |
| Turnover de conocimiento (plugin WP legacy nadie lo mantiene) | Alta | Baja | Auditoría escrita del plugin (ya hecha) + documentación de mapping en el módulo F8. |

## 7. Dependencias

- **Acceso a la base de datos MySQL** del WordPress actual (dump o
  credenciales de sólo-lectura) para la migración F8.
- **Credenciales de Convex Cloud** (organización, proyecto, deploy keys).
- **Cuenta de Vercel** para el frontend.
- **Assets de identidad del laboratorio**: logo (PNG/JPG ≤ 2 MB), firma
  del responsable (PNG), sello (PNG), nombre legal, RIF, dirección.
- **Reunión de definición con el cliente** para cerrar reestructuración
  del catálogo de exámenes (SPIKE F4).
- **Confirmación de fuente para tasa BCV**: bcv.org.ve (scraping) o API
  tercero (DolarToday, otro).
- **Ventana de cutover acordada** con el laboratorio (fin de semana o
  fuera de horario operativo).

## 8. Rollout & rollback

**Rollout** (secuencial, sin big-bang):

1. **Semana 1-3 · Fundación**
   - Setup monorepo pnpm + turborepo, apps/web + packages/*.
   - Deploy inicial Vercel + Convex Cloud (dev/preview/prod).
   - Schema Convex + Convex Auth con roles Admin/Operador.
   - Módulo F2 Config Empresa con validaciones.
   - **F8** — script de migración WP → Convex (dry-run funcional).
   - F4 Catálogo con importación Excel.

2. **Semana 4-7 · Core Operativo**
   - F3 Pacientes con búsqueda en tiempo real.
   - F7 Paquetes con drag-and-drop.
   - F5 Resultados con PDF (`@react-pdf`).
   - F6 Presupuestos con doble moneda, nombre libre y conversión a resultado.

3. **Semana 8-9 · Cierre**
   - F1 Dashboard con KPIs y actividad reciente.
   - F10 Exportación CSV/XLSX.
   - SPIKE Scraper BCV → cron Convex action diaria.
   - Hardening (validaciones, mensajes de error, empty states).

4. **Semana 10 · Cutover**
   - Dry-run migración completa contra copia MySQL.
   - Validación diff-a-diff con Admin.
   - Ventana de cutover con downtime del plugin WP.
   - Ejecución migración final + smoke tests.
   - Go-live LabSystem, plugin WP en modo read-only backup.

**Feature flags**: rollout progresivo por módulo detrás de flags simples
(env vars Convex + Next); permite habilitar F10 Exportación separado del
core si el SPIKE demora.

**Rollback**:

- **Antes del cutover**: rollback = no promocionar la app a prod, seguir
  operando con el plugin WP. Sin impacto.
- **Durante el cutover**: si la migración falla → abortar, restaurar
  dump MySQL, mantener plugin WP. LabSystem queda en preview.
- **Post-cutover (primer mes)**: mantener plugin WP en modo read-only
  como backup. Si LabSystem tiene bug bloqueante → fallback a WP para
  operar mientras se hotfixea. Datos nuevos post-cutover se re-exportan
  con `orch export` y se reimportan al plugin (procedimiento documentado).
- **Post-cutover (después del primer mes)**: dump periódico de Convex
  (feature nativo) + export XLSX mensual como respaldo humano-legible.

## 9. Success criteria

- [ ] 100% de los 204+ pacientes, 250+ exámenes, 652 resultados, 545
      presupuestos y 9 paquetes migrados sin pérdida de datos.
- [ ] Búsqueda en Pacientes / Resultados / Presupuestos / Catálogo
      responde en ≤ 300 ms p95 con el dataset completo.
- [ ] PDF de resultado y presupuesto se genera en ≤ 3 s p95.
- [ ] Ningún PDF sale sin nombre de laboratorio (validación bloqueante
      confirmada por QA).
- [ ] Presupuesto con nombre libre funciona sin crear ficha de paciente.
- [ ] Conversión Presupuesto → Resultado precarga paciente y exámenes en
      un solo clic.
- [ ] Exportación CSV/XLSX disponible en Pacientes, Presupuestos,
      Resultados y Costos.
- [ ] Tasa BCV se refresca automáticamente al menos 1 vez al día vía cron
      Convex action, con override manual disponible.
- [ ] Admin puede gestionar Config Empresa y Catálogo; Operador NO ve
      esos módulos (test de permisos).
- [ ] Auditoría del plugin actual queda 100% resuelta: sin duplicados en
      catálogo, cédulas normalizadas, dashboard con KPIs, búsqueda en
      todas las listas.
- [ ] Uptime ≥ 99.5% en el primer mes post-cutover.
- [ ] Ningún ticket P0/P1 abierto 15 días post-cutover.

## 10. Spikes (investigación previa)

Todo lo que **no** está 100% confirmado se ejecuta como spike antes de
tocar el módulo correspondiente. Cada spike produce un documento con
decisión y trade-offs.

| # | Spike | Módulo | Descripción | Impacto si falla |
|---|-------|--------|-------------|------------------|
| S1 | **Scraper BCV sin Puppeteer** | F6 / F2 | Comparar `fetch + cheerio` sobre `bcv.org.ve` vs API terceros (DolarToday, otros). Runs como Convex cron action. | Presupuestos siguen con carga manual (degradado pero funcional). |
| S2 | **Migración WP → Convex** | F8 | Mapping completo de tablas custom del plugin (`rv_pacientes`, `rv_examenes`, `rv_titulos`, `rv_paquetes`, `rv_resultados*`, `rv_presupuestos*`). Definir estrategia de IDs (UUID nuevos vs preservar), snapshot de nombre/precio, normalización de cédulas. | Bloqueante — sin migración no hay cutover. |
| S3 | **@react-pdf server-side** | F5 / F6 | Dónde renderiza el PDF: Convex action node runtime o Next route handler. Comparar cold-start, bundle size, streaming al cliente, embedding de imágenes (logo/firma/sello desde Convex File Storage). | Bloqueante — sin PDF no hay entregable al paciente. |
| S4 | **Reestructuración grupos de exámenes** | F4 | Reunión pendiente con el cliente. Decidir si conservar los 6 grupos actuales o rediseñar. Schema debe soportar cambios sin migración destructiva (sin IDs hardcoded). | Media — retrasa F4 hasta cerrar la reunión. |
| S5 | **Convex Auth prod-ready vs Clerk** | F9 | Validar: recuperación de contraseña, invitación de usuarios, rate limiting, expiración de sesión, auditoría de accesos. Si Convex Auth no cubre → adoptar Clerk. | Alta — auth es fundacional; cambiar tarde es costoso. |
| S6 | **Exportación CSV/XLSX** | F10 | Formato final (una hoja vs varias), scope (todas las columnas vs subset elegible), performance con 500-10.000 rows. Decidir si generar en Convex action con SheetJS o descargar client-side. | Baja — feature aislada, se puede iterar. |
| S7 | **Formato / redondeo Bs Venezuela** | F6 | Confirmar reglas: cantidad de decimales (2 vs 0), separador de miles (`.` en VE), regla de redondeo (half-up vs banker's), implicancias tributarias. | Alta — cálculos incorrectos afectan cobros. |
| S8 | **Multi-tenant (Fase 2)** | Global | Diseñar cómo se agregaría multi-tenant sin refactor global (schema con `laboratorio_id` opcional desde v1, RLS lógica en queries). Sólo diseño, no implementación. | Baja — sólo prepara terreno para Fase 2. |

## 11. Referencias

- **Fuente**: `LabSystem — PRD.pdf` v1.0 (2026-08-23), 14 páginas — cliente RV / Esmilink.
- **Auditoría**: `RV Laboratorio — Auditoría.pdf`, 4 páginas — análisis del
  plugin actual con hallazgos críticos y de aviso.
- **Plugin origen**: `rv-laboratorio` v1.2.1 (WordPress).
- **Stack overrides**: decisiones de plataforma (Convex, Convex Auth,
  @react-pdf, monorepo pnpm/turborepo) — sustituyen al stack propuesto
  en el PRD fuente (Node.js + PostgreSQL + Prisma + NextAuth + Puppeteer).
