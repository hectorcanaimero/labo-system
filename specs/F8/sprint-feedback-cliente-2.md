---
type: spec
project_id: labo-system
phase: 8
version: 0.1
depends_on:
  - specs/F7/sprint-feedback-cliente.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-16
title: "F8 — Segunda ronda de feedback del cliente (16 sep 2026)"
---

# F8 — Segunda ronda de feedback del cliente

Origen: lista de Miguel Franchi del 16 de septiembre de 2026. Borrar paquetes, que el
presupuesto con nombre libre cargue al paciente, quitar el estado del PDF y del link
público, revisar la fecha de resultado, número correlativo visible y buscable en
presupuestos y resultados, y pasar los textos de voseo argentino a español de Venezuela.

Decisiones tomadas con el equipo el 16 de septiembre:

- Borrar un paquete es borrado lógico (`activo = false`), igual que exámenes y pacientes. `presupuestos_examenes.paquete_id` es `ON DELETE RESTRICT` y un borrado físico falla con 500 en cuanto el paquete está en algún presupuesto.
- El presupuesto con nombre libre crea una **ficha incompleta**: un paciente con nombre, apellido y teléfono o email, con cédula, fecha de nacimiento y sexo vacíos. La ficha se completa antes de convertir el presupuesto en orden.
- Los resultados reciben un correlativo nuevo `RS-{año}-{000123}`, como `PR-` en presupuestos. Los PDFs ya entregados mostraban los primeros 8 caracteres del UUID; ese código deja de usarse.

Reglas para todas las tareas: todo texto nuevo va en tuteo (tú), nunca en voseo. Las migraciones se aplican en la instancia hosted como indica `docs/deploy/insforge-vps.md`, sección “Aplicar una migración en la instancia hosted”. Cada migración tiene número fijo en su tarea para que las tareas paralelas no choquen.

Fuera de este sprint: orina y heces con campos cualitativos, e inventario de reactivos (siguen pendientes de spec propio).

Pendiente de confirmar con el cliente: qué parte exacta de “ver lo de la fecha de resultado” le molesta. F8.3.T4 corrige los desfases de zona horaria y las etiquetas, que son los defectos que se ven en el código.

## F8.1 — Package: paquetes

### F8.1.T1 — Borrar paquetes desde la interfaz (borrado lógico)

Hoy existe `DELETE /api/paquetes/[id]` (`apps/web/app/api/paquetes/[id]/route.ts`, solo admin), pero ninguna pantalla lo llama. Además hace borrado físico (`packages/db/repos/paquetes.ts`, función `deletePaquete`), que falla con 500 `ERROR_GENERICO` cuando el paquete aparece en una línea de presupuesto (FK `ON DELETE RESTRICT` de `0007`).

Qué hacer:
- Migración `packages/db/migrations/0022_paquetes_activo.sql`: `ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true`. Cabecera de comentario al estilo de `0013`.
- `repos/paquetes.ts`: el borrado pasa a `update ... set activo = false`. `list` devuelve solo activos. `getById` sigue devolviendo inactivos, porque los presupuestos viejos los muestran. `setExamenes`, `setContenido`, `setTitulos` y `update` rechazan un paquete inactivo con el mismo error que un id inexistente.
- UI: botón “Eliminar paquete” (variante destructiva) en el constructor `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`, visible solo para admin. Pide confirmación con `window.confirm` (así lo hacen `PacientesList.tsx` y `TitulosNavigator.tsx`), muestra un toast de éxito o error como el resto de las acciones de escritura (commit 4042bbd) y vuelve a `/paquetes`.
- Aplicar la migración en la instancia hosted.

Listo cuando: un admin elimina un paquete que está en un presupuesto y no sale error; el paquete desaparece de `/paquetes` y del selector “Cargar paquete” del presupuesto; el detalle del presupuesto viejo sigue mostrando sus líneas; un operador no ve el botón y `DELETE` le responde 403.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 2.5h
- **Razón**: Migración de una columna y un botón con patrón ya existente en el repo.
- **Dependencies**:
- **Files**:
  - `packages/db/migrations/0022_paquetes_activo.sql`
  - `packages/db/repos/paquetes.ts`
  - `apps/web/app/api/paquetes/[id]/route.ts`
  - `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`
  - `apps/web/app/(app)/paquetes/[id]/page.tsx`

## F8.2 — Package: presupuestos

### F8.2.T1 — Ficha incompleta de paciente: base, schemas y repos

Hoy un presupuesto con nombre libre guarda `presupuestos.paciente_nombre_libre` sin `paciente_id` (check `presupuestos_paciente_xor` de `0001`). No se puede enviar: `api/presupuestos/[id]/enviar/route.ts` devuelve `PACIENTE_LIBRE_REQUIERE_FICHA`. Tampoco aparece en Pacientes. La decisión es crear una ficha incompleta.

Qué hacer:
- Migración `packages/db/migrations/0023_pacientes_ficha_incompleta.sql`:
  - `cedula`, `fecha_nacimiento` y `sexo` pasan a aceptar NULL. `pacientes_cedula_unique` se mantiene, porque Postgres permite varios NULL.
  - Nuevo `CHECK pacientes_identificable`: `cedula IS NOT NULL OR telefono IS NOT NULL OR email IS NOT NULL`.
  - Sin columna nueva: una ficha es incompleta cuando le falta cédula, fecha de nacimiento o sexo. Exponer esa regla como función pura `esFichaIncompleta(p)` en `packages/lib/schemas/paciente.ts`, con test.
- `packages/lib/schemas/paciente.ts`: `pacienteProvisionalSchema` con `nombre`, `apellido`, `telefono?` y `email?`; exige teléfono o email (código `CONTACTO_REQUERIDO`). `pacienteCreateSchema` no cambia: la ficha completa sigue exigiendo todo.
- `packages/lib/schemas/presupuesto.ts`: `presupuestoCreateSchema` acepta `paciente_provisional` como tercera alternativa a `paciente_id` y `paciente_nombre_libre`, y exactamente una de las tres debe venir. `paciente_nombre_libre` sigue siendo válido para no romper clientes, pero la UI deja de usarlo (F8.2.T2).
- `packages/db/repos/pacientes.ts`: `createProvisional(db, input)` inserta la ficha incompleta. `update` permite completar la ficha; al completarla valida cédula, fecha y sexo con las mismas reglas de `pacienteCreateSchema`. Los tipos de fila pasan `cedula`, `fecha_nacimiento` y `sexo` a `string | null`; corregir en este paquete los usos que dejen de compilar.
- `packages/db/repos/presupuestos.ts`: `create` con `paciente_provisional` crea la ficha y guarda el presupuesto con ese `paciente_id`. Si falla el presupuesto, borra la ficha recién creada. `convertToOrden` rechaza con `PACIENTE_FICHA_INCOMPLETA` si el paciente asignado tiene la ficha incompleta.
- `packages/lib/error-messages.ts`: mensajes en tuteo para `CONTACTO_REQUERIDO` (“Indica un teléfono o un email para poder enviarle el presupuesto.”) y `PACIENTE_FICHA_INCOMPLETA` (“Completa la cédula, la fecha de nacimiento y el sexo del paciente antes de crear la orden.”).
- Aplicar la migración en la instancia hosted.

No hace: UI (F8.2.T2 y F8.2.T3), ni migrar los presupuestos viejos con nombre libre, que no tienen datos de contacto.

Listo cuando: pasan los tests de `schemas/paciente`, `schemas/presupuesto` y `presupuestos.integration.test.ts`, con casos nuevos para crear un presupuesto con `paciente_provisional` solo con teléfono, rechazar uno sin teléfono ni email, y rechazar la conversión a orden con la ficha incompleta; `pnpm typecheck` pasa en todo el monorepo.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 4h
- **Razón**: Relaja NOT NULL en una tabla con datos clínicos; toca reglas de integridad y la conversión a orden.
- **Dependencies**:
- **Files**:
  - `packages/db/migrations/0023_pacientes_ficha_incompleta.sql`
  - `packages/lib/schemas/paciente.ts`
  - `packages/lib/schemas/paciente.test.ts`
  - `packages/lib/schemas/presupuesto.ts`
  - `packages/lib/schemas/presupuesto.test.ts`
  - `packages/lib/error-messages.ts`
  - `packages/db/repos/pacientes.ts`
  - `packages/db/repos/presupuestos.ts`
  - `packages/db/repos/presupuestos.integration.test.ts`

### F8.2.T2 — Presupuesto con paciente nuevo: formulario y envío

Usa la base de F8.2.T1. En `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`, el modo “libre” deja de pedir un nombre suelto y pide Nombre, Apellido, Teléfono y Email, con la ayuda “Indica al menos un teléfono o un email para poder enviarle el presupuesto”. Al guardar se envía `paciente_provisional`. Los faltantes del botón guardar (F7.2.T1) incluyen “Falta teléfono o email”.

En `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`:
- Si el paciente tiene la ficha incompleta, mostrar la etiqueta “Ficha incompleta” junto al nombre, con enlace a `/pacientes/[id]`.
- El diálogo de convertir a orden, con la ficha incompleta, explica que hay que completarla y enlaza a la ficha, en vez de fallar al confirmar.
- Los botones de envío (`packages/ui/envio/EnviarButtons.tsx`) ya se habilitan con el teléfono o el email del paciente; comprobar que funcionan con la ficha incompleta sin cambiar el componente.

Listo cuando: crear un presupuesto “libre” con nombre, apellido y teléfono deja al paciente en `/pacientes` y el botón WhatsApp del detalle queda habilitado; sin teléfono ni email, guardar muestra el faltante; convertir con la ficha incompleta muestra el aviso con enlace.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 3h
- **Razón**: UI sobre un contrato ya definido en F8.2.T1.
- **Dependencies**: F8.2.T1
- **Files**:
  - `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`
  - `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`

### F8.2.T3 — Pacientes: mostrar y completar la ficha incompleta

Usa `esFichaIncompleta` de F8.2.T1.
- `apps/web/app/(app)/pacientes/PacientesList.tsx`: etiqueta “Ficha incompleta” en la fila y “—” donde falten cédula, fecha o edad. No debe romperse con `cedula` o `fecha_nacimiento` en null (revisar `packages/lib/edad.ts` y `packages/lib/cedula.ts` en ese flujo).
- Ficha `apps/web/app/(app)/pacientes/[id]/page.tsx` y `FichaTabs.tsx`: aviso arriba “Faltan datos para poder crear órdenes: cédula, fecha de nacimiento, sexo” (solo los que falten), con botón que abre `PacienteFormDialog.tsx` en modo edición.
- `PacienteFormDialog.tsx`: editar una ficha incompleta exige los tres campos para guardar.

Listo cuando: la ficha creada desde un presupuesto aparece con la etiqueta en la lista, se abre sin errores y, al completarla, la etiqueta desaparece y el presupuesto ya puede convertirse en orden.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 2.5h
- **Razón**: Ajustes de UI con nulos; sin lógica de dominio nueva.
- **Dependencies**: F8.2.T1
- **Files**:
  - `apps/web/app/(app)/pacientes/PacientesList.tsx`
  - `apps/web/app/(app)/pacientes/PacienteFormDialog.tsx`
  - `apps/web/app/(app)/pacientes/[id]/page.tsx`
  - `apps/web/app/(app)/pacientes/[id]/FichaTabs.tsx`

### F8.2.T4 — Quitar el Estado del PDF de presupuesto

`packages/pdf/PresupuestoPDF.tsx`, líneas 269-270 aproximadamente, imprime la etiqueta `Estado` con `data.estado` en el bloque de datos. Quitar ese campo del PDF y reacomodar el bloque para que no quede un hueco. `estado` puede seguir en `PresupuestoPDFData`, porque lo usa quien arma los datos. `ResultadoPDF.tsx` no imprime el estado: no tocarlo.

Listo cuando: el PDF de un presupuesto (`/api/pdf/...` o el test de `packages/pdf/render.test.tsx`) no contiene el texto “Estado” y `render.test.tsx` pasa.

- **Modelo**: claude/claude-haiku-4-5
- **Estimación**: 0.5h
- **Razón**: Quitar un campo de un componente.
- **Dependencies**:
- **Files**:
  - `packages/pdf/PresupuestoPDF.tsx`
  - `packages/pdf/render.test.tsx`

### F8.2.T5 — Número de presupuesto visible en la lista y búsqueda que funcione

El número `PR-2026-000123` (`numero_correlativo` de `0013`, formateado con `packages/lib/numero-presupuesto.ts`) ya sale en el detalle y en el PDF, pero no en la lista ni en el tablero. Además la búsqueda está rota:
- `api/presupuestos/route.ts` devuelve el array de `search()`, mientras que `PresupuestosList.tsx` lee `data.items`, así que cualquier término deja la lista vacía.
- `search()` ignora el estado, las fechas y la paginación.
- `search()` no busca por número ni por cédula.

Qué hacer:
- `packages/lib/numero-presupuesto.ts`: `parseNumeroPresupuesto(term)` acepta `PR-2026-000123`, `pr-2026-123`, `000123` y `123`, y devuelve el entero o null. Con test.
- `packages/db/repos/presupuestos.ts`: unificar la búsqueda dentro de `list`, con un filtro `term` que devuelve la misma forma paginada `{ items, total, ... }`. Si el término es un número, filtra `numero_correlativo = n`; si no, busca con ilike en `paciente_nombre_libre`, nombre, apellido y cédula del paciente. El término se combina con estado, desde y hasta. Eliminar `search` si nadie más lo usa.
- `api/presupuestos/route.ts`: siempre `list`, pasando `term`.
- `PresupuestosList.tsx`: mostrar el número en la tarjeta del tablero (hoy calcula `numeroLegible` y no lo muestra) y como primera columna “Nº” en la vista tabla. Placeholder: “Buscar por nº, paciente o cédula…”.

Listo cuando: buscar `PR-2026-000001`, `1` o un apellido devuelve el presupuesto en ambas vistas; buscar con el estado “Borrador” seleccionado respeta el filtro; `presupuestos.integration.test.ts` tiene un caso por número y pasa.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 3h
- **Razón**: Corrige un bug de contrato API↔UI y reescribe una consulta con filtros combinados.
- **Dependencies**: F8.2.T1
- **Files**:
  - `packages/lib/numero-presupuesto.ts`
  - `packages/lib/numero-presupuesto.test.ts`
  - `packages/db/repos/presupuestos.ts`
  - `packages/db/repos/presupuestos.integration.test.ts`
  - `apps/web/app/api/presupuestos/route.ts`
  - `apps/web/app/(app)/presupuestos/PresupuestosList.tsx`

## F8.3 — Package: resultados

### F8.3.T1 — Quitar el Estado de la página pública del resultado

`apps/web/app/r/[slug]/page.tsx`, líneas 86-89 aproximadamente, muestra `Estado` con el valor crudo de `orden.estado` (“Validando”, “En proceso”) en el link que se envía al paciente. Quitar ese campo y reacomodar la grilla. Se mantiene el 404 para órdenes anuladas (línea 51). `v/[slug]` y `p/[slug]` no muestran el estado: no tocarlos.

Listo cuando: abrir un link `/r/<slug>` de una orden en cualquier estado no muestra la palabra “Estado”.

- **Modelo**: claude/claude-haiku-4-5
- **Estimación**: 0.5h
- **Razón**: Quitar un campo de una página.
- **Dependencies**:
- **Files**:
  - `apps/web/app/r/[slug]/page.tsx`

### F8.3.T2 — Número correlativo de resultado: base y PDF

`ordenes` no tiene número: el “Nº” del PDF es `id.split("-")[0].toUpperCase()` (`packages/pdf/ResultadoPDF.tsx`, función `referencia`, que recibe los datos de `getForPDF` en `packages/db/repos/ordenes.ts`).

Qué hacer:
- Migración `packages/db/migrations/0024_ordenes_numero_correlativo.sql`, sin usar `ADD COLUMN serial` directo, que numera en orden físico y no cronológico:
  1. `ADD COLUMN numero_correlativo integer`.
  2. Rellenar con `row_number() OVER (ORDER BY created_at, id)`.
  3. `CREATE SEQUENCE ordenes_numero_correlativo_seq OWNED BY ordenes.numero_correlativo`, `setval` al máximo y `DEFAULT nextval(...)`.
  4. `SET NOT NULL` e índice único.
  Todo en una transacción y con la cabecera de comentario de `0013`.
- `packages/lib/numero-orden.ts` y su test, igual que `numero-presupuesto.ts`: `formatNumeroOrden(n, createdAt)` devuelve `RS-{año}-{000123}` y `parseNumeroOrden(term)` acepta `RS-2026-000123`, `rs-2026-123`, `000123` y `123`.
- `repos/ordenes.ts`: incluir `numero_correlativo` en los tipos y en los select de `getById`, `list`, `search` y `getForPDF`. No cambiar filtros (eso es F8.3.T4).
- `ResultadoPDF.tsx`: “Nº” muestra `formatNumeroOrden`. Eliminar `referencia` basada en el UUID.
- Aplicar la migración en la instancia hosted.

Listo cuando: después de migrar, la orden más antigua tiene el número 1 y una orden nueva recibe el siguiente; el PDF de resultado muestra `RS-2026-…`; pasan `render.test.tsx` y el test nuevo de `numero-orden`.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 3h
- **Razón**: Migración con relleno y secuencia sobre datos de producción; hay que acertar el orden.
- **Dependencies**: F8.2.T4
- **Files**:
  - `packages/db/migrations/0024_ordenes_numero_correlativo.sql`
  - `packages/lib/numero-orden.ts`
  - `packages/lib/numero-orden.test.ts`
  - `packages/db/repos/ordenes.ts`
  - `packages/pdf/ResultadoPDF.tsx`
  - `packages/pdf/render.test.tsx`

### F8.3.T3 — Número de resultado visible y búsqueda por número en el sistema

Usa `numero_correlativo` y `numero-orden.ts` de F8.3.T2.
- `apps/web/app/(app)/resultados/ResultadosList.tsx`: primera columna “Nº” con `formatNumeroOrden`. Placeholder “Buscar por nº, paciente o cédula…”; hoy dice “o fecha”, pero la búsqueda por fecha no existe, y para eso están los filtros desde y hasta.
- `OrdenesPipelineSection.tsx`: el número en cada tarjeta.
- `resultados/[id]/ResultadoDetalle.tsx`: el número en el encabezado.
- `packages/db/repos/ordenes.ts`: unificar `search` dentro de `list` con un filtro `term`, que hoy descarta desde y hasta y no pagina. Si `parseNumeroOrden(term)` da un número, filtra por `numero_correlativo`; si no, ilike por nombre, apellido y cédula. El término se combina con estado, desde y hasta, y la respuesta es paginada.
- `apps/web/app/api/resultados/route.ts`: siempre `list`, pasando `term`.

Listo cuando: buscar `RS-2026-000005` o `5` encuentra la orden; buscar un apellido con un rango de fechas respeta el rango; el número se ve en la lista, el tablero y el detalle.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 3h
- **Razón**: Reescribe la consulta de búsqueda con filtros combinados y toca tres vistas.
- **Dependencies**: F8.3.T2
- **Files**:
  - `packages/db/repos/ordenes.ts`
  - `apps/web/app/api/resultados/route.ts`
  - `apps/web/app/(app)/resultados/ResultadosList.tsx`
  - `apps/web/app/(app)/resultados/OrdenesPipelineSection.tsx`
  - `apps/web/app/(app)/resultados/[id]/ResultadoDetalle.tsx`

### F8.3.T4 — Fecha de resultado: zona horaria de Caracas y etiquetas claras

El cliente pidió revisar la fecha de resultado. `packages/lib/fecha.ts` ya formatea en `America/Caracas`, pero casi nadie lo usa:
- `packages/pdf/theme.ts` (`formatDateDMY`, con `getUTC*`), `apps/web/app/r/[slug]/page.tsx`, `ResultadosList.tsx`, `OrdenesPipelineSection.tsx` y `ResultadoDetalle.tsx` formatean con `timeZone: "UTC"`. `updateEstado` (`packages/db/repos/ordenes.ts`, al pasar a Entregada) guarda la hora real, así que una entrega después de las 20:00 de Caracas aparece con el día siguiente. Lo mismo pasa con “Emitido el” del PDF, que cae en `new Date()`.
- `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`: `hoyInput()` y `formatDateInput` usan `toISOString().slice(0,10)`, así que después de las 20:00 proponen la fecha de mañana y al editar corren la fecha un día.
- `list` en `ordenes.ts` compara desde y hasta de `fecha_muestra` con límites de día en UTC.
- En el PDF, la cabecera dice “Fecha” pero muestra `fecha_muestra`, mientras que el cuerpo tiene “Fecha de muestra” y “Fecha de resultado”. Cambiar la etiqueta de la cabecera a “Fecha de muestra”.

Qué hacer: que todos esos lugares usen los helpers de `packages/lib/fecha.ts`, agregando los que falten, como “fecha de hoy en Caracas como YYYY-MM-DD” y “límites de un día de Caracas en UTC”, con tests en `fecha.test.ts`. En `ordenes.ts` solo cambian los límites de desde y hasta de `list` (F8.3.T3 ya unificó la búsqueda ahí).

Listo cuando: una orden entregada el 16/09 a las 22:30 de Caracas muestra 16/09/2026 en la lista, el detalle, el tablero, `/r/<slug>` y el PDF; a las 21:00 de Caracas el formulario nuevo propone la fecha de hoy; filtrar desde 16/09 hasta 16/09 incluye una muestra tomada a las 22:00 de Caracas; pasan `fecha.test.ts` y `render.test.tsx`.

- **Modelo**: claude/claude-sonnet-5
- **Estimación**: 3h
- **Razón**: Bugs de zona horaria repartidos en siete archivos; hay que razonar bien los límites de día.
- **Dependencies**: F8.3.T1, F8.3.T3
- **Files**:
  - `packages/lib/fecha.ts`
  - `packages/lib/fecha.test.ts`
  - `packages/pdf/theme.ts`
  - `packages/pdf/ResultadoPDF.tsx`
  - `packages/db/repos/ordenes.ts`
  - `apps/web/app/r/[slug]/page.tsx`
  - `apps/web/app/(app)/resultados/ResultadosList.tsx`
  - `apps/web/app/(app)/resultados/OrdenesPipelineSection.tsx`
  - `apps/web/app/(app)/resultados/[id]/ResultadoDetalle.tsx`
  - `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`

## F8.4 — Package: idioma

### F8.4.T1 — Textos de voseo argentino a español de Venezuela

El cliente pidió “quitar español argentino y usar español venezolano”. El locale ya es correcto: todo usa `es-VE` y `America/Caracas`, sin ningún `es-AR`. El problema es la redacción: hay unas 155 formas de voseo en 44 archivos. Va al final para no pisar a las demás tareas de F8, que tocan muchos de esos archivos.

Qué hacer:
- Pasar a tuteo todo texto visible para el usuario: UI, `packages/lib/error-messages.ts`, emails (`packages/lib/server/email.ts` y el HTML de `apps/web/app/api/usuarios/invite/route.ts`), las páginas públicas `v/[slug]`, `r/[slug]` y `p/[slug]`, y la leyenda del QR de `packages/pdf/components/PDFQr.tsx`. Ejemplos: tenés → tienes, hacé clic → haz clic, intentá → intenta, querés → quieres, cargala → cárgala, acá → aquí. El “Vos” de `usuarios/UsuariosList.tsx` pasa a “Tú”.
- Quitar giros argentinos: “arrancamos bien, sin vueltas” (`PacientesList.tsx`) y “arrancar” (`PresupuestosList.tsx`). Tono neutro y cordial.
- Los mensajes de WhatsApp (`enlace-resultado.ts`, `enlace-presupuesto.ts`) ya están en “usted”: no tocarlos.
- `apps/web/app/layout.tsx`: `<html lang="es-VE">`.
- Actualizar los e2e que buscan por texto: `apps/web/e2e/resultado.spec.ts` y `apps/web/e2e/presupuesto.spec.ts` (`getByPlaceholder("Buscá por nombre del examen")`).
- Los comentarios de código no son necesarios.

Para encontrar todo: `grep -rnP "\b(\w+(á|é|í)(s)?|tenés|podés|querés|sos|vos|acá|fijate|asegurate|\w+ala|\w+alo)\b"` en `apps/web` y `packages/{ui,lib,pdf}`, excluyendo `node_modules` y `.next`, y revisar cada resultado a mano (hay falsos positivos como “está”, “más” o “aquí”).

Listo cuando: ese grep no devuelve voseo en textos visibles; `pnpm typecheck`, `pnpm lint` y los tests unitarios pasan; los e2e modificados usan los textos nuevos.

- **Modelo**: claude/claude-haiku-4-5
- **Estimación**: 3h
- **Razón**: Reemplazo mecánico de textos en muchos archivos; no tiene lógica.
- **Dependencies**: F8.1.T1, F8.2.T2, F8.2.T3, F8.2.T4, F8.2.T5, F8.3.T4
- **Files**:
  - `apps/web/app/**`
  - `apps/web/components/**`
  - `apps/web/e2e/resultado.spec.ts`
  - `apps/web/e2e/presupuesto.spec.ts`
  - `packages/ui/**`
  - `packages/lib/error-messages.ts`
  - `packages/lib/server/email.ts`
  - `packages/pdf/components/PDFQr.tsx`
