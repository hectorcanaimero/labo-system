---
type: spec
phase: F7
package: feedback-cliente
project_id: labo-system
version: 0.1
depends_on:
  - F6.presupuestos-pipeline
blocks:
  - F8.orina-heces
  - F8.inventario
generated_by: manual
generated_at: 2026-09-07
title: "F7 — Sprint de feedback del cliente (6 sep 2026)"
---

# F7 · Sprint de feedback del cliente

Origen: pruebas de Miguel Franchi del 5 y 6 de septiembre, capturas del PDF “Sistema RV”,
y acta de la reunión del 6 de septiembre. Análisis técnico en
`docs/feedback/2026-09-07-analisis-tecnico.html`.

Duración: dos semanas (8 al 19 de septiembre). Total estimado: 36h en 13 tareas.

Objetivo del sprint: que el cliente pueda cargar el catálogo, armar paquetes y emitir
presupuestos con toma de muestra y domicilio sin toparse con ninguno de los bloqueos
reportados, y que la página pública de resultados deje de exponer datos.

## Orden de ejecución

| Semana | Tareas | Por qué |
|---|---|---|
| 1, días 1-2 | F7.1.T1, F7.1.T2, F7.2.T1, F7.3.T1 | Bloqueos del cliente y privacidad. Sin base. Deploy al terminar. |
| 1, días 3-5 | F7.2.T2, F7.2.T3, F7.2.T4, F7.1.T3 | Presupuesto completo y paquetes. Una migración. Deploy y aviso al cliente. |
| 2, días 1-3 | F7.4.T1, F7.4.T2, F7.3.T3, F7.5.T1 | Catálogo, pacientes, IA en el detalle, tasa. Dos migraciones. |
| 2, días 4-5 | F7.3.T2 | QR y verificación. Depende de F7.3.T1. |

## Fuera del sprint

- **Orina y heces con campos cualitativos.** Requiere la sesión con la licenciada Nayhin Ramírez para definir la plantilla. Va a F8.
- **Inventario de reactivos.** Módulo nuevo con cuatro tablas. Va a F8 con spec propio.
- **Marketing y fidelización.** Pospuesto por acuerdo de la reunión.
- **Migración del servidor de Alemania a hardware local.** Infraestructura, fuera del código.

## Decisiones que hay que confirmar con el cliente durante el sprint

1. Si la ganancia por línea se oculta o se elimina (F7.2.T4).
2. Valor por defecto de la toma de muestra (F7.2.T3). En la demo dijeron “normalmente 4 USD”.
3. Qué teléfono de WhatsApp atiende las verificaciones por QR (F7.3.T2).

---

# F7.1 · Correcciones de interfaz

## F7.1.T1 — Migrar los siete modales a mano al Dialog de shadcn

### Objetivo

Reemplazar los overlays `fixed inset-0` armados a mano por el `Dialog` de `apps/web/components/ui/dialog.tsx`, que ya trae portal, foco, Escape y scroll interno. Cierra el bug del botón oculto que reportó el cliente en exámenes y previene el mismo fallo en el resto.

### Alcance

Sí hace:
- Migrar `ExamenFormDialog`, `TituloFormDialog`, `PacienteFormDialog`, `InviteUserDialog`, el modal de `PresupuestosList`, el de `ResultadoForm` (orden nueva) y `CargarPaqueteButton`.
- Pie con los botones siempre visible: `max-h-[90vh]`, cuerpo con `overflow-y-auto`, pie `sticky bottom-0`.
- Probar en 1366×768 y en tablet 768×1024.

No hace:
- Cambiar campos ni validaciones de los formularios.

### Criterios de aceptación

- [ ] En 1366×768 con zoom 100% el botón “Crear examen” es visible y clickeable sin achicar el zoom.
- [ ] Escape y click fuera cierran cada modal, salvo mientras guarda.
- [ ] No queda ningún `fixed inset-0` fuera de `components/ui`.

### Archivos afectados

- `apps/web/app/(app)/examenes/ExamenFormDialog.tsx`
- `apps/web/app/(app)/examenes/TituloFormDialog.tsx`
- `apps/web/app/(app)/pacientes/PacienteFormDialog.tsx`
- `apps/web/app/(app)/usuarios/InviteUserDialog.tsx`
- `apps/web/app/(app)/presupuestos/PresupuestosList.tsx`
- `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`
- `packages/ui/paquetes/CargarPaqueteButton.tsx`

### Dependencias

- Ninguna

### Estimación

4h

---

## F7.1.T2 — Mensajes de error faltantes y registro del 500 en exámenes

### Objetivo

Traducir los códigos de dominio que hoy caen en “Algo salió mal” y dejar rastro en el log cuando una ruta devuelve 500, para poder diagnosticar el error que el cliente vio al crear un examen en el grupo Caninas.

### Alcance

Sí hace:
- Agregar a `DOMAIN_ERROR_MESSAGES`: `EXAMEN_DUPLICADO_EN_TITULO`, `GANANCIA_NEGATIVA`, `EXAMENES_REQUERIDOS`, `TASA_INVALIDA`, `PRECIO_INVALIDO`.
- En `toStatus` de `api/examenes/route.ts` y en `response` de `api/presupuestos/route.ts`, `console.error` con el mensaje original antes de devolver `ERROR_GENERICO`.
- Buscar en los logs de Coolify el POST a `/api/examenes` del 2026-09-06 entre 02:35 y 02:45 UTC y anotar la causa en el spec.

No hace:
- Cambiar el contrato de las rutas.

### Criterios de aceptación

- [ ] Crear dos veces el mismo examen en un grupo muestra “Ya existe un examen con ese nombre en este grupo”.
- [ ] Un 500 en exámenes o presupuestos deja el mensaje original en el log del contenedor.

### Archivos afectados

- `packages/lib/error-messages.ts`
- `apps/web/app/api/examenes/route.ts`
- `apps/web/app/api/presupuestos/route.ts`

### Dependencias

- Ninguna

### Estimación

1h

---

## F7.1.T3 — Paquetes: botón Agregar en vez de arrastrar y guardado en un solo request

### Objetivo

Quitar el arrastre entre columnas del constructor de paquetes, que hoy no agrega nada porque `DndContext` no tiene sensores y `SortableList` no es un `SortableContext`, y dejar un botón explícito por fila. Unificar el guardado que hoy son tres requests en paralelo.

### Alcance

Sí hace:
- Fila del catálogo: botón “Agregar” a la derecha; sin `useDraggable`.
- Reorden dentro del paquete: `useSensors(PointerSensor{distance:6}, KeyboardSensor)` y `SortableContext` con `verticalListSortingStrategy`.
- Nuevo `PUT /api/paquetes/[id]` que reciba `precio_base`, `examenIds` y `tituloIds` y los aplique en orden; el builder llama solo a ese.
- Texto vacío del paquete: “Hacé clic en Agregar o incluí un grupo completo”.

No hace:
- Cambiar el cálculo de suma sugerida ni de ahorro.

### Criterios de aceptación

- [ ] Clic en “Agregar” suma el examen al paquete y lo deshabilita en el catálogo.
- [ ] Reordenar con el mouse y con teclado funciona y persiste al guardar.
- [ ] Si falla el guardado, el paquete queda como estaba antes.

### Archivos afectados

- `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`
- `packages/ui/dnd/SortableList.tsx`
- `apps/web/app/api/paquetes/[id]/route.ts`
- `packages/db/repos/paquetes.ts`

### Dependencias

- Ninguna

### Estimación

3h

---

# F7.2 · Presupuestos

## F7.2.T1 — Decir qué falta para guardar el presupuesto

### Objetivo

El botón “Guardar presupuesto” se deshabilita por seis condiciones sin decir cuál falla. El cliente vio un botón gris y no supo que faltaba el paciente. Mostrar la lista de faltantes y llevar al campo.

### Alcance

Sí hace:
- Derivar `faltantes: string[]` de las mismas condiciones de `canSubmit`.
- Botón siempre habilitado; al hacer clic con faltantes, mostrarlos junto al botón y hacer scroll al primero.
- Marcar en rojo el bloque de paciente cuando está vacío.

No hace:
- Cambiar las reglas de validación.

### Criterios de aceptación

- [ ] Con dos exámenes y sin paciente, clic en guardar muestra “Falta elegir paciente” y lleva al campo.
- [ ] Con todo cargado, guarda como hasta ahora.

### Archivos afectados

- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`

### Dependencias

- Ninguna

### Estimación

2h

---

## F7.2.T2 — Toma de muestra y domicilio: base, schema y cálculo

### Objetivo

Agregar los dos cargos por servicio que el laboratorio cobra aparte de los exámenes, como columnas planas del presupuesto para no tocar la FK de líneas ni la conversión a orden.

### Alcance

Sí hace:
- Migración `0015_presupuestos_servicios.sql`: `toma_muestra_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (>= 0)` y `domicilio_usd` igual, en `presupuestos`.
- `laboratorio_config`: `toma_muestra_default_usd numeric(12,2) DEFAULT 0`.
- `presupuestoCreateSchema` y `presupuestoUpdateSchema`: ambos campos opcionales, no negativos.
- `calcularTotales`: nuevo input `serviciosUsd` que se suma al total después de descuento y ganancia, en USD y Bs. Tests.
- `repos/presupuestos.ts` create y update persisten y devuelven los campos. La conversión a orden no los copia.
- Aplicar la migración en la instancia hosted por el endpoint de migraciones (ver `docs/deploy/insforge-vps.md`).

No hace:
- UI ni PDF (F7.2.T3).

### Criterios de aceptación

- [ ] Un presupuesto con subtotal 13, ganancia 0, toma 4 y domicilio 6 da total 23 USD y el Bs correspondiente.
- [ ] Los tests de `calcular-totales` y `schemas/presupuesto` pasan.

### Archivos afectados

- `packages/db/migrations/0015_presupuestos_servicios.sql`
- `packages/lib/schemas/presupuesto.ts`
- `packages/lib/calcular-totales.ts`
- `packages/lib/calcular-totales.test.ts`
- `packages/db/repos/presupuestos.ts`

### Dependencias

- Ninguna

### Estimación

3h

---

## F7.2.T3 — Toma de muestra y domicilio en formulario, detalle y PDF, más hora de emisión

### Objetivo

Exponer los cargos por servicio como se acordó en la reunión: campo “Toma de muestra” siempre visible con valor por defecto de Config, y check “Servicio a domicilio” que abre el monto. Mostrarlos en el detalle y en el PDF, y agregar la hora a la fecha de emisión.

### Alcance

Sí hace:
- Formulario: bloque “Servicios” entre la tabla de exámenes y el resumen.
- Resumen en vivo con dos filas nuevas antes del total.
- `PresupuestoDetalle` muestra ambos montos.
- `PresupuestoPDF`: dos filas bajo la tabla de exámenes, y “Emitido el dd/mm/aaaa hh:mm” en zona `America/Caracas`.
- Config: campo para el valor por defecto de toma de muestra.

No hace:
- Servicios en la orden ni en el PDF de resultados.

### Criterios de aceptación

- [ ] El PDF muestra tasa, fecha y hora de emisión y los dos servicios como filas separadas de los exámenes.
- [ ] Desmarcar “Servicio a domicilio” lo pone en 0 y lo quita del PDF.

### Archivos afectados

- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`
- `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`
- `packages/pdf/PresupuestoPDF.tsx`
- `apps/web/app/(app)/config/ConfigForm.tsx`

### Dependencias

- F7.2.T2

### Estimación

3h

---

## F7.2.T4 — Ganancia: ocultar detrás de Ajustes avanzados y corregir el paquete cerrado

### Objetivo

El cliente escribió valores en la columna de ganancia por línea sin saber qué era y el total cambió. Ocultar ganancia global y por línea detrás de un toggle plegado, y corregir que en paquete cerrado la ganancia global se aplique sobre el precio ya repartido.

### Alcance

Sí hace:
- Toggle “Ajustes avanzados” plegado por defecto que muestra ganancia global y la columna por línea.
- Con el toggle cerrado no se manda `ganancia_pct` por línea.
- Paquete cerrado: las líneas del paquete llevan `ganancia_pct: 0` explícito, para que el total del paquete sea el precio base fijado por el admin.
- Confirmar con el cliente antes de mergear si la ganancia se queda o se elimina del todo.

No hace:
- Cambiar el PDF, que ya no desglosa el porcentaje.

### Criterios de aceptación

- [ ] Cargar un paquete cerrado de precio base 15 da total 15 con ganancia global 10.
- [ ] Con el toggle cerrado, la tabla no muestra la columna Ganancia %.

### Archivos afectados

- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`
- `packages/lib/calcular-totales.test.ts`

### Dependencias

- Ninguna

### Estimación

2h

---

# F7.3 · Resultados y privacidad

## F7.3.T1 — Enmascarar la página pública del resultado

### Objetivo

La página `/r/[slug]` muestra nombre completo, cédula completa y valores. Enmascarar la cédula y quitar los valores de la vista web, dejando el PDF como único lugar con el resultado.

### Alcance

Sí hace:
- Cédula como `V-***.***.*45`.
- Quitar la tabla de valores de la página; dejar laboratorio, paciente, fecha, botón de descarga del PDF y aviso de vencimiento.

No hace:
- QR ni vista de verificación (F7.3.T2).

### Criterios de aceptación

- [ ] Abrir el enlace muestra la cédula enmascarada y ningún valor de examen en el HTML.

### Archivos afectados

- `apps/web/app/r/[slug]/page.tsx`

### Dependencias

- Ninguna

### Estimación

1h

---

## F7.3.T2 — Vista de verificación y QR en el PDF de resultados

### Objetivo

Implementar la decisión de la reunión: QR en el PDF que lleva a una página de validación con laboratorio, fecha, hora, cédula enmascarada y botón de WhatsApp. Nunca muestra el resultado.

### Alcance

Sí hace:
- Migración `0016_enlaces_verificacion.sql`: tabla con `slug`, `orden_id`, sin vencimiento, o campo `tipo` en `enlaces_resultado`.
- Ruta pública `/v/[slug]` con los datos mínimos y botón `wa.me` al teléfono de `laboratorio_config`.
- Generar el QR en el servidor como SVG (`qrcode` npm, sin canvas) y embeberlo en `ResultadoPDF` junto a la firma.
- El slug de verificación se crea al pasar la orden a “Entregada” si no existe.
- Aplicar la migración en la instancia hosted.

No hace:
- Token por SMS ni acceso al resultado desde la verificación.

### Criterios de aceptación

- [ ] Escanear el QR del PDF abre `/v/[slug]` con laboratorio, fecha, hora y cédula enmascarada.
- [ ] La vista de verificación no expone ningún valor ni el nombre completo.
- [ ] Un PDF regenerado conserva el mismo slug.

### Archivos afectados

- `packages/db/migrations/0016_enlaces_verificacion.sql`
- `packages/lib/enlace-resultado.ts`
- `apps/web/app/v/[slug]/page.tsx`
- `packages/pdf/ResultadoPDF.tsx`
- `apps/web/app/api/pdf/resultado/[id]/route.ts`
- `packages/db/repos/ordenes.ts`

### Dependencias

- F7.3.T1

### Estimación

6h

---

## F7.3.T3 — Botón de IA para observaciones en el detalle del resultado

### Objetivo

El asistente de observaciones solo existe en el formulario de orden nueva. La licenciada carga valores desde el detalle, así que el botón tiene que estar ahí.

### Alcance

Sí hace:
- Extraer el botón y su llamada a `api/ai/observaciones` a `packages/ui/resultados/RefinarObservacionesButton.tsx`.
- Usarlo en `ResultadoDetalle` y en `ResultadoForm`.
- Verificar en Coolify que `GEMINI_API_KEY` esté cargada en producción.

No hace:
- Cambiar el prompt.

### Criterios de aceptación

- [ ] Desde el detalle de una orden en proceso, el botón reescribe la observación y la deja editable antes de guardar.

### Archivos afectados

- `packages/ui/resultados/RefinarObservacionesButton.tsx`
- `apps/web/app/(app)/resultados/[id]/ResultadoDetalle.tsx`
- `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`

### Dependencias

- Ninguna

### Estimación

2h

---

# F7.4 · Catálogo y pacientes

## F7.4.T1 — Métodos de análisis como tabla administrable

### Objetivo

Reemplazar el texto libre con sugerencias por una tabla de métodos que el admin pueda ampliar, como se acordó en la reunión, sin romper el snapshot de método en las órdenes.

### Alcance

Sí hace:
- Migración `0017_metodos_analisis.sql`: tabla `(id, nombre unique, activo, orden)` poblada con los distintos de `examenes.metodo`.
- Endpoints `GET/POST/PATCH /api/examenes/metodos` con el patrón de `titulos`.
- `ExamenFormDialog`: `select` de métodos activos con opción “Agregar método…” para admin.
- Config: lista de métodos con renombrar y desactivar.
- `examenes.metodo` sigue siendo texto: se guarda el nombre elegido.

No hace:
- Migrar `metodo_snap` de órdenes.

### Criterios de aceptación

- [ ] No se puede escribir un método a mano en el examen.
- [ ] Un método desactivado no aparece en el selector pero se sigue viendo en exámenes que ya lo tenían.

### Archivos afectados

- `packages/db/migrations/0017_metodos_analisis.sql`
- `packages/db/repos/metodos.ts`
- `apps/web/app/api/examenes/metodos/route.ts`
- `apps/web/app/(app)/examenes/ExamenFormDialog.tsx`
- `apps/web/app/(app)/config/ConfigForm.tsx`

### Dependencias

- Ninguna

### Estimación

5h

---

## F7.4.T2 — Dirección obligatoria y enlace de ubicación en pacientes

### Objetivo

El laboratorio toma muestras a domicilio y pide al paciente su ubicación por WhatsApp. Hacer la dirección obligatoria y agregar un campo para el enlace de mapa o las coordenadas.

### Alcance

Sí hace:
- Migración `0018_pacientes_ubicacion.sql`: `ubicacion_url text`.
- `schemas/paciente.ts`: `direccion` requerida con mínimo 5 caracteres; `ubicacion_url` opcional, URL o par `lat,long`.
- Formulario: dirección marcada como requerida; campo “Ubicación (enlace o coordenadas)” con botón “Abrir en mapa”.
- Ficha del paciente muestra el enlace.

No hace:
- Mapa embebido.

### Criterios de aceptación

- [ ] Crear paciente sin dirección muestra error en el campo.
- [ ] Pegar `10.49,-66.88` guarda y abre Google Maps con esas coordenadas.

### Archivos afectados

- `packages/db/migrations/0018_pacientes_ubicacion.sql`
- `packages/lib/schemas/paciente.ts`
- `apps/web/app/(app)/pacientes/PacienteFormDialog.tsx`
- `apps/web/app/(app)/pacientes/[id]/FichaTabs.tsx`

### Dependencias

- Ninguna

### Estimación

2h

---

# F7.5 · Operación

## F7.5.T1 — Tasa BCV: cron en Coolify y rechazos visibles en Config

### Objetivo

La tasa estaba desactualizada durante las pruebas del cliente y los únicos refrescos en auditoría son manuales. Verificar la tarea programada y hacer visibles los rechazos de la guarda anti-outlier.

### Alcance

Sí hace:
- Revisar en Coolify la tarea programada que llama a `refresh-bcv` con `CRON_SECRET`; documentar en `docs/deploy/coolify-staged.md` cómo está configurada.
- Cuando `setManual` o el scraper rechazan por outlier, devolver `TASA_RECHAZADA_OUTLIER` y mostrarlo en Config con el valor anterior.
- Reproducir el “tasa manual no funciona” de la demo con la consola abierta y anotar la causa.

No hace:
- Cambiar el umbral del outlier sin dato.

### Criterios de aceptación

- [ ] La tasa en producción se actualiza sola cada hora durante un día completo.
- [ ] Cargar una tasa manual fuera de rango muestra el motivo en vez de éxito silencioso.

### Archivos afectados

- `docs/deploy/coolify-staged.md`
- `apps/web/app/api/tasa/manual/route.ts`
- `packages/db/repos/tasa.ts`
- `apps/web/app/(app)/config/ConfigForm.tsx`

### Dependencias

- Ninguna

### Estimación

2h

---

# Registro del Sprint 1 (semana 1)

Rama del sprint: `sprint/f7-1`, base `staged`. Cada tarea es un commit. PR #9 `sprint/f7-1 → staged` mergeado por squash el 2026-09-07 01:44 UTC (b9f5bed). Migración 0015 aplicada en hosted a las 01:45 UTC por el endpoint de InsForge. F7.2.T5 quedó fuera del merge y va en PR aparte sobre `staged`.

| Tarea | Sesión | Estado | Commit | Comentario |
|---|---|---|---|---|
| F7.1.T1 | opus | hecha | `78441b1` | Siete modales migrados al Dialog de shadcn con DialogBody desplazable y pie fijo. packages/ui suma @radix-ui/react-dialog y un overlay/Dialog.tsx propio para CargarPaqueteButton. Escape y click fuera no cancelan un guardado en curso. Falta verificar a ojo en 1366x768 y tablet. |
| F7.1.T2 | sonnet | hecha | `9094277` | Cinco códigos traducidos y console.error del 500 en exámenes y presupuestos. Pendiente: buscar en los logs de Coolify el POST a /api/examenes del 2026-09-06 02:35-02:45 UTC; la sesión no tiene acceso. Hallazgo: pnpm test y pnpm typecheck fallan en la raíz por errores preexistentes (tsup de @labo/lib sin inputs, tests de integración de @labo/db); por paquete, lib y web pasan. |
| F7.2.T1 | sonnet | hecha | `f275872` | Botón siempre habilitado; al guardar con faltantes los lista junto al botón y hace scroll a la sección. Bloque de paciente en rojo tras el intento. Nota operativa: tras rebasear sobre commits que agregan dependencias, correr pnpm install de nuevo o el typecheck falla por caché. |
| F7.3.T1 | sonnet | hecha, con seguimiento | `1085ba2` | Cédula enmascarada y tabla de valores quitada de /r/[slug]. Seguimiento: la página quedó sin forma de bajar el PDF porque api/pdf/resultado exige sesión de staff; el paciente no ve su resultado. Se agrega F7.3.T1b: endpoint público de PDF autorizado por slug y botón de descarga. |
| F7.3.T1b | sonnet | hecha | `97b3e10` | GET /api/r/[slug]/pdf sin sesión, 404 si el slug no existe, venció o la orden está anulada. El render se extrajo de la ruta de staff y se comparte. Botón de descarga en la página pública. Build de web pasa; descarga real sin probar en navegador. |
| F7.2.T4 | sonnet | hecha | `dce358f` | Ganancia global, columna por línea y fila del resumen detrás de un toggle Ajustes avanzados plegado. Paquete cerrado: líneas con ganancia 0 explícita, test nuevo (15 repartido en 9+6 con ganancia global 10 da 15). Seguimiento anotado: al editar un presupuesto guardado, las líneas de paquete cerrado se reconstruyen como desglosadas; limitación previa. |
| F7.1.T3 | opus | hecha | `494930d` | Botón Agregar en el catálogo, sensores y SortableContext real para el reorden, PUT único /api/paquetes/[id] con setContenido. Sin transacciones en PostgREST: el rollback es por compensación; atomicidad real requeriría una RPC en Postgres. packages/ui suma dnd-kit. Las rutas viejas /examenes y /titulos siguen. Sin prueba en navegador ni test de setContenido. |
| F7.1.T4 | sonnet | hecha | `a380435` | setExamenes y setTitulos hacen upsert primero (onConflict sobre las PK compuestas, verificadas en 0001 y 0011) y borran el sobrante después: un insert fallido ya no vacía el paquete. Guard y spinner en el diálogo de paquetes de la orden nueva. PaqueteBuilder refetch y refresh tras guardado fallido. Sin prueba contra Postgres real ni navegador. |
| F7.2.T2 | opus | hecha | `2f25ad7` + `bdf8cef` | Migración 0015 (toma_muestra_usd, domicilio_usd en presupuestos; toma_muestra_default_usd en laboratorio_config), probada en Postgres local e idempotente. calcularTotales suma serviciosUsd después de descuento y ganancia; schemas y repo persisten los campos. NO aplicada en hosted: debe aplicarse ANTES del deploy porque PRESUPUESTO_COLS ya pide las columnas. Tests de lib 313/313.  Corrección: sin BEGIN/COMMIT, porque el endpoint de migraciones de InsForge envuelve el SQL en su propia transacción; aplicar por el endpoint, no por psql. |
| F7.2.T3 | opus | hecha | `b173abe` | Bloque Servicios en el formulario con toma de muestra precargada desde Config y check de domicilio; detalle y PDF muestran ambos; hora de emisión en zona Caracas con test (antes la fecha del PDF salía al día siguiente pasadas las 20:00 por formatear en UTC). Config con valor por defecto de toma de muestra. Sin prueba visual del PDF ni del navegador. Hallazgo: los tests de packages/pdf no se typechequean (tsconfig con files: []). |
| F7.2.T5 | opus | hecha | `02dd0b8` | Middleware excluye api/r/ con barra final (sin la barra abría /api/resultados). page.tsx pasa paquete_id, precio_base_snap y ganancia_pct, ahora requeridos en el tipo. cerrado se deriva con esPaqueteCerrado (paquete_id y ganancia 0; ambigüedad documentada si la ganancia global es 0). El submit manda ganancia por línea aunque el toggle esté plegado. enmascararCedula en packages/lib falla cerrado. 22 tests nuevos, lib 335/335. Verificado con next start: el PDF público llega al handler y las rutas protegidas siguen en 307. |
| F7.0.T1 | sonnet | hecha | `1afe7ce` | lib, ui y pdf sin build de tsup (exportan fuentes, web los transpila). Tests de integración de db alineados a la firma con Db inyectado; dashboard corre solo con credenciales de InsForge, dos tests de presupuestos en skip con motivo. web y convex con test no-op explícito; convex es código muerto post-InsForge. turbo lint typecheck test build 20/20 en verde. |

## F7.3.T1b — PDF público por slug para el enlace del paciente (seguimiento de F7.3.T1)

### Objetivo

Al quitar los valores de `/r/[slug]`, el paciente que llega por WhatsApp o email ya no ve su resultado, porque la ruta de PDF existente exige sesión de staff. Dar un endpoint de PDF autorizado por el slug vigente y un botón de descarga en la página pública.

### Alcance

Sí hace:
- `GET /api/r/[slug]/pdf`: valida el slug con `enlaces_resultado` (existe, no vencido), renderiza el mismo `ResultadoPDF` de la orden y responde `application/pdf`. Sin sesión.
- Botón “Descargar resultado (PDF)” en `/r/[slug]`. Enlace vencido: mensaje, sin botón.
- Reutilizar la función de render de `api/pdf/resultado/[id]`, sin duplicar la carga de assets.

No hace:
- QR ni vista de verificación (F7.3.T2).

### Criterios de aceptación

- [ ] Con un slug vigente, el botón descarga el PDF sin iniciar sesión.
- [ ] Con un slug vencido o inexistente, el endpoint responde 404 y la página no muestra el botón.
- [ ] El PDF es idéntico al que descarga el staff para la misma orden.

### Archivos afectados

- `apps/web/app/api/r/[slug]/pdf/route.ts`
- `apps/web/app/api/pdf/resultado/[id]/route.ts`
- `apps/web/app/r/[slug]/page.tsx`

### Dependencias

- F7.3.T1

### Estimación

2h

## F7.1.T4 — Correcciones de la revisión cruzada sobre modales y paquetes

### Objetivo

Cerrar los tres hallazgos de corrección que dejó la revisión de sonnet sobre los commits 78441b1 y 494930d antes de abrir el PR.

### Alcance

Sí hace:
- `packages/db/repos/paquetes.ts`: en `setExamenes` y `setTitulos`, que un fallo del INSERT no deje la asociación en cero. Insertar primero y borrar después lo que sobra, o equivalente, de modo que el estado previo sobreviva a un insert fallido.
- `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`: el diálogo de paquetes bloquea el cierre mientras hay una selección en vuelo y deshabilita los botones de paquete, mismo patrón que `CargarPaqueteButton`.
- `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`: tras un guardado fallido, recargar el estado del servidor (`router.refresh()` o refetch) antes de permitir reintentar.

No hace:
- El guard de `pending` en `PresupuestosList`: hoy no es alcanzable, queda anotado.
- Atomicidad real con RPC en Postgres.

### Criterios de aceptación

- [ ] Si el INSERT de exámenes o grupos falla, el paquete conserva las asociaciones que tenía antes.
- [ ] Escape o click fuera del diálogo de paquetes de la orden nueva no cierra mientras carga un paquete.
- [ ] Un guardado fallido del paquete deja el builder mostrando el estado real del servidor.

### Archivos afectados

- `packages/db/repos/paquetes.ts`
- `apps/web/app/(app)/resultados/nuevo/ResultadoForm.tsx`
- `apps/web/app/(app)/paquetes/PaqueteBuilder.tsx`

### Dependencias

- F7.1.T1
- F7.1.T3

### Estimación

2h

## F7.2.T5 — Correcciones de la revisión cruzada sobre PDF público y edición de presupuestos

### Objetivo

Cerrar los hallazgos confirmados de la revisión de opus sobre los commits de sonnet antes de abrir el PR.

### Alcance

Sí hace:
- `apps/web/middleware.ts`: dejar pasar `/api/r/*` sin sesión, con exclusión en el matcher. Hoy el PDF público redirige al home con 307.
- `apps/web/app/(app)/presupuestos/[id]/page.tsx`: pasar `paquete_id`, `precio_base_snap` y `ganancia_pct` en `initialData.lineas`.
- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`: derivar `cerrado` de las líneas cargadas en vez de fijarlo en `false`, para que editar no reaplique la ganancia global ni pierda el reparto del paquete.
- `apps/web/app/r/[slug]/page.tsx`: `maskCedula` enmascara todo ante formato desconocido.
- Test sobre la reconstrucción de líneas al editar, si el patrón del repo lo permite sin infraestructura nueva.

No hace:
- Quitar observaciones y médico solicitante de la página pública: decisión del cliente.
- Log de duración en la ruta pública de PDF.

### Criterios de aceptación

- [ ] `GET /api/r/<slug>/pdf` sin cookie llega al handler y responde el PDF con un slug vigente.
- [ ] Abrir y guardar sin cambios un presupuesto con paquete cerrado de precio base 15 y ganancia global 10 mantiene el total en 15.
- [ ] Una línea con ganancia propia conserva su porcentaje al editar y guardar.
- [ ] Una cédula con formato inesperado sale completamente enmascarada.

### Archivos afectados

- `apps/web/middleware.ts`
- `apps/web/app/(app)/presupuestos/[id]/page.tsx`
- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`
- `apps/web/app/r/[slug]/page.tsx`

### Dependencias

- F7.3.T1b
- F7.2.T4

### Estimación

2h

## F7.0.T1 — Dejar verde el CI de la raíz

### Objetivo

`main` exige lint, typecheck, test y build en verde y hoy fallan los tres últimos por causas previas al sprint. Sin esto no se puede promover `staged` a producción.

### Alcance

Sí hace:
- `@labo/lib`: build con tsup sin inputs; corregir entry o config.
- `@labo/db`: 11 errores de tipos en `dashboard.integration.test.ts` y `presupuestos.integration.test.ts`; alinear a las firmas actuales o skip con motivo.
- `apps/web`: script `test` llama a vitest sin tenerlo; instalar con config mínima o no-op explícito.
- `@labo/db test`: 3 rojos preexistentes; saltear los de integración cuando no hay `INSFORGE_URL`.

No hace:
- Tocar lógica de negocio.

### Criterios de aceptación

- [ ] `pnpm turbo run lint typecheck test build` en verde desde la raíz.

### Archivos afectados

- `packages/lib/package.json`, `packages/lib/tsup.config.ts`
- `packages/db/repos/*.integration.test.ts`
- `apps/web/package.json`

### Dependencias

- Ninguna

### Estimación

3h

# Registro del Sprint 2 (semana 2)

Rama del sprint: `sprint/f7-2`, base `staged` (post PR #11). Cada tarea es un commit. Siete commits funcionales, revisión cruzada en las dos direcciones y dos tareas de corrección. PR `sprint/f7-2 → staged` abierto al cierre. Migraciones 0016, 0017 y 0018 se escriben y prueban en local; se aplican en hosted por el endpoint de InsForge antes del deploy, con decisión del usuario.

| Tarea | Sesión | Estado | Commit | Comentario |
|---|---|---|---|---|
| F7.5.T1 | sonnet | hecha | `13f3753` | setManual no tenía guarda anti-outlier: se agregó la misma de setFromScraper y POST /api/tasa/manual responde 409 TASA_RECHAZADA_OUTLIER con tasa anterior e intentada; Config lo muestra. Doc de la Scheduled Task horaria en coolify-staged.md. Pendiente del usuario: confirmar en el panel de Coolify que scrape-bcv-hourly exista y esté activa. |
| F7.4.T2 | sonnet | hecha | `c86a03d` | Migración 0018 con pacientes.ubicacion_url nullable, probada en Postgres local, no aplicada en hosted. direccion requerida en Zod con error visible en el formulario; ubicacion_url acepta URL o par lat,long con validación en packages/lib/ubicacion.ts; botón Abrir en mapa y enlace en la ficha. Nota: la dirección requerida también aplica al alta rápida desde presupuesto y orden, que reusa el mismo diálogo. |
| F7.3.T3 | sonnet | hecha | `e5341de` | Botón Sugerir redacción extraído a packages/ui/resultados y usado en el formulario de orden y en el detalle, donde las observaciones ahora se editan in-place y se guardan por PATCH con solo ese campo. packages/ui/resultados agregado a los globs de Tailwind. Pendiente del usuario: confirmar GEMINI_API_KEY en Coolify. Sin prueba en navegador. |
| F7.3.T2 | opus | hecha | `e333136` | Tabla enlaces_verificacion (0016) con slug sin vencimiento; se crea al entregar y también al emitir el PDF, best-effort: sin la migración el PDF sale sin QR y nada rompe. QR como SVG en ResultadoPDF junto a la firma. Ruta pública /v/[slug] con laboratorio, fecha y hora, cédula enmascarada y botón de WhatsApp. Migración probada en Postgres local, no aplicada en hosted. Sin escaneo real del QR ni apertura del PDF. |
| F7.4.T1 | opus | hecha | `517397a` | Tabla metodos_analisis (0017) sembrada con los métodos existentes, repo y endpoints con patrón de títulos, select en el examen con alta inline para admin y panel de métodos en Config fuera del form. Un método desactivado se conserva en los exámenes como (fuera de la lista). Renombrar no reescribe examenes.metodo ni metodo_snap, a propósito. Sin la 0017 el selector muestra un mensaje y nada rompe. Probada en Postgres local, no aplicada en hosted. Sin prueba en navegador. |
| F7.3.T4 | opus | hecha | `1b2d5cb` | update de órdenes solo auto-entrega cuando el body trae fecha_resultado; el detalle manda estado explícito y no ofrece Editar en anuladas. Tasa manual con force y motivo obligatorio auditado, ofrecido en Config solo tras un 409 con el mismo valor; rechazos por outlier auditados. 14 tests nuevos en db (18 a 32), los de regresión fallan sin el fix. Sin prueba en navegador. |
| F7.3.T5 | sonnet | hecha | `7e00aff` | La creación del enlace de verificación solo tolera tabla faltante; cualquier otro error queda en audit_log sin tumbar la entrega ni el PDF, con test. /v/[slug] sin Estado. QR y enlace solo cuando la orden está Entregada. Carrera sin UNIQUE en orden_id anotada. |

## F7.3.T4 — Correcciones de la revisión cruzada sobre observaciones y tasa

### Objetivo

Cerrar el hallazgo confirmado de la revisión de opus sobre los commits de sonnet en el Sprint 2, más dos plausibles operativos de la tasa.

### Alcance

Sí hace:
- `packages/db/repos/ordenes.ts`: el auto-cálculo de estado a `Entregada` en `update` aplica solo cuando el body trae `fecha_resultado`, no cuando se hereda del registro actual. Editar solo `observaciones` no cambia el estado.
- `apps/web/app/(app)/resultados/[id]/ResultadoDetalle.tsx`: el PATCH de observaciones manda `estado` explícito igual al actual, y el botón Editar no se muestra en órdenes anuladas.
- Test unitario en `packages/lib` o `packages/db` que cubra: orden anulada con `fecha_resultado`, PATCH solo con observaciones, el estado sigue anulado.
- `packages/db/repos/tasa.ts` y `apps/web/app/api/tasa/manual/route.ts`: `force: true` con `motivo` obligatorio para saltar la guarda anti-outlier en la carga manual, auditado en `audit_log` con tasa anterior, nueva y motivo. Config ofrece el forzado solo después de un rechazo, con campo de motivo.
- Auditar los rechazos por outlier, manual y scraper, en `audit_log`.

No hace:
- Aflojar `direccion` al editar pacientes viejos: decisión del cliente.

### Criterios de aceptación

- [ ] Una orden anulada con fecha de resultado sigue anulada tras guardar una observación desde el detalle.
- [ ] Una orden en proceso con fecha de resultado sigue en proceso tras guardar una observación.
- [ ] Tras un 409 por outlier, Config permite reintentar con motivo y la tasa queda guardada y auditada.
- [ ] Un rechazo por outlier deja una fila en `audit_log`.

### Archivos afectados

- `packages/db/repos/ordenes.ts`
- `apps/web/app/(app)/resultados/[id]/ResultadoDetalle.tsx`
- `packages/db/repos/tasa.ts`
- `apps/web/app/api/tasa/manual/route.ts`
- `apps/web/app/(app)/config/ConfigForm.tsx`

### Dependencias

- F7.3.T3
- F7.5.T1

### Estimación

3h

## F7.3.T5 — Correcciones de la revisión cruzada sobre QR y verificación

### Objetivo

Cerrar los dos hallazgos confirmados de la revisión de sonnet sobre los commits de opus en el Sprint 2, más acotar el QR a informes entregados.

### Alcance

Sí hace:
- `packages/db/repos/ordenes.ts` (`crearVerificacionBestEffort`) y `apps/web/app/api/pdf/resultado/[id]/route.ts` (`resolverVerificacionUrl`): tragar solo `VERIFICACION_TABLA_FALTANTE`; cualquier otro error se relanza o al menos se audita. Test del caso.
- `apps/web/app/v/[slug]/page.tsx`: quitar el campo Estado. Solo laboratorio, fecha, hora, cédula enmascarada y WhatsApp.
- El enlace de verificación y el QR se generan solo para órdenes en estado Entregada. Un PDF de una orden sin entregar sale sin QR y sin crear enlace.

No hace:
- UNIQUE sobre `orden_id` en `enlaces_verificacion`: la carrera converge al enlace más viejo, queda anotada.

### Criterios de aceptación

- [ ] Un error distinto de tabla faltante al crear la verificación no pasa desapercibido: se relanza o queda en `audit_log`.
- [ ] `/v/[slug]` no muestra el estado de la orden.
- [ ] El PDF de una orden no entregada no lleva QR ni crea enlace de verificación.

### Archivos afectados

- `packages/db/repos/ordenes.ts`
- `apps/web/app/api/pdf/resultado/[id]/route.ts`
- `apps/web/app/v/[slug]/page.tsx`

### Dependencias

- F7.3.T2

### Estimación

2h

# Sprint 3 (correcciones y pedidos del usuario)

Rama `sprint/f7-3`, base `staged` post PR #13. PR #14 abierto. Revisión de sonnet sobre 459f844: nada roto; un plausible de UX menor: con la tabla de tipos vacía, un operador no puede crear exámenes hasta que un admin cargue un tipo. Sin revisión cruzada sobre los commits de sonnet porque la sesión de opus cerró.

| Tarea | Sesión | Estado | Commit | Comentario |
|---|---|---|---|---|
| F7.4.T3 | opus | hecha | `459f844` | Tipos de análisis como tabla, selectores en el examen, página de catálogo. PR #14. |
| F7.6.T1 | sonnet | hecha | `abbad57` | Cinco pestañas: Laboratorio, Presupuestos, Imagen, Tasa de cambio y Tipos y métodos con el CatalogoPanel embebido. Un solo form para las tres primeras, Guardar fijo con indicador, salto a la pestaña con error, ?tab= en la URL con history.replaceState porque router.replace re-ejecutaba el server component y reseteaba el form. Sidebar apunta a /config?tab=catalogo. Sin prueba en navegador. |
| F7.6.T2 | sonnet | hecha | `8fba463` | Bug real: assets/set borraba el archivo viejo antes de confirmar la config nueva; si el upsert fallaba, quedaba sin asset. Orden invertido. Verificado contra el contenedor real de staging: volumen montado y sin errores de storage en 72h; el reporte es probablemente anterior. Producción no tenía compose ni volumen: docker-compose.production.yml nuevo. Test de que el upsert de config no pisa las claves. Pendiente del usuario: confirmar en Coolify si producción apunta al compose nuevo; en este VPS solo corre el contenedor de staging. |
| F7.7.T1 | opus | hecha | `a25aaed` | PipelineBoard genérico con MoveMenu y 12 tests; ambos pipelines reescritos; diálogo solo para Rechazado y Cerrado. Globs de Tailwind completados: destapó que el badge Borrador se purgaba. PR #21. Sin prueba en navegador. |
| F7.2.T6 | sonnet | hecha | `04ef7a5` | Ganancia global solo al paquete cerrado y visible como monto en el resumen; por línea con default de Config en modo abierto; mixto: global solo al paquete. Flag cerrado persistido (0020, aplicada en hosted); el backend fuerza la global en cerradas. Tasa de solo lectura. Sin toggle. PR #22. Pendiente opcional: el detalle de solo lectura sigue mostrando el % del header. |
| F7.4.T4 | sonnet | hecha | `1f68b21` | Tipos y Métodos en pestañas separadas con búsqueda y paginación. PR #19 mergeado. |
| F7.2.T7 | sonnet | en curso | — | Pedido del usuario: enviar el presupuesto por WhatsApp o email, con enlace público /p/[slug] y paso automático a Enviado. |

## F7.4.T3 — Tipos de análisis como tabla administrable

### Objetivo

Hoy el tipo de análisis del examen sale de una lista fija en `packages/lib/schemas/examen.ts` (`TIPO_ANALISIS_VALUES`). El usuario pide que, igual que los métodos, sea una tabla de mantenimiento administrable desde Config, y que al crear un examen tanto tipo como método sean selectores contra esas tablas.

### Alcance

Sí hace:
- Migración `0019_tipos_analisis.sql`: tabla `tipos_analisis (id, nombre unique, activo, orden)`, sembrada con los ocho valores de `TIPO_ANALISIS_VALUES` en ese orden y con cualquier valor distinto que exista en `examenes.tipo_analisis`. Sin BEGIN/COMMIT, idempotente.
- `packages/db/repos/tipos-analisis.ts` y `GET/POST/PATCH /api/examenes/tipos-analisis`, mismo patrón y roles que métodos.
- `packages/lib/schemas/examen.ts`: `tipo_analisis` pasa a ser texto no vacío; el vocabulario lo da la tabla. Conservar `TIPO_ANALISIS_VALUES` solo como semilla de la migración o eliminarla si nada más la usa.
- `ExamenFormDialog`: selector de tipos activos con "Agregar tipo…" para admin, mismo componente o patrón que el de métodos. Un examen con tipo desactivado o renombrado se muestra como "(fuera de la lista)" y no se pierde al guardar.
- Página propia `/catalogo/tipos-y-metodos` en el grupo Catálogo del sidebar (`apps/web/app/(app)/layout.tsx`, entre Exámenes y Paquetes), con dos bloques: Tipos de análisis y Métodos. Alta, renombrar en línea, activar y desactivar. `MetodosPanel` se mueve ahí y desaparece de Config. Solo admin.
- Importación de exámenes (`examenes/import`): si valida el tipo contra la lista fija, pasar a validar contra la tabla.

No hace:
- Reescribir `examenes.tipo_analisis` al renombrar un tipo. Misma regla que métodos.

### Criterios de aceptación

- [ ] Crear un examen ofrece tipo y método como selectores alimentados por las tablas; no hay texto libre en ninguno.
- [ ] El admin agrega un tipo nuevo desde el formulario del examen sin salir de él.
- [ ] Un tipo desactivado desaparece del selector y se conserva en los exámenes que lo tenían.
- [ ] El sidebar muestra “Tipos y métodos” bajo Catálogo y la página administra ambos; Config ya no los muestra.
- [ ] La migración sembró los ocho tipos en orden y `pnpm turbo run lint typecheck test build` sigue en verde.

### Archivos afectados

- `packages/db/migrations/0019_tipos_analisis.sql`
- `packages/db/repos/tipos-analisis.ts`
- `apps/web/app/api/examenes/tipos-analisis/route.ts`
- `packages/lib/schemas/examen.ts`
- `apps/web/app/(app)/examenes/ExamenFormDialog.tsx`
- `apps/web/app/(app)/catalogo/tipos-y-metodos/page.tsx`
- `apps/web/app/(app)/layout.tsx`
- `apps/web/app/(app)/config/ConfigForm.tsx`, `MetodosPanel.tsx`
- `apps/web/app/(app)/examenes/import/*`

### Dependencias

- F7.4.T1

### Estimación

4h

## F7.6.T1 — Configuración en pestañas

### Objetivo

La página de Configuración es una columna larga de tarjetas: identidad, contacto, datos institucionales, presupuestos, activos, tasa y métodos. El usuario la encuentra fea y pide pestañas.

### Alcance

Sí hace:
- Reorganizar `ConfigForm.tsx` con el `Tabs` de shadcn (`apps/web/components/ui/tabs.tsx`) en cuatro pestañas: **Laboratorio** (identidad, contacto, datos institucionales), **Presupuestos** (defaults de presupuesto, toma de muestra), **Imagen** (logo, firma y sello con `AssetUploader`), **Tasa de cambio** (tasa actual, refresco BCV, carga manual con forzado).
- Un solo `<form>` de configuración que abarque las tres primeras pestañas: cambiar de pestaña no pierde lo escrito, y el botón Guardar queda fijo abajo con indicador de cambios sin guardar.
- Errores de validación: si hay un campo inválido en otra pestaña, marcar la pestaña con un punto y saltar a ella al intentar guardar.
- La pestaña activa en la URL (`?tab=tasa`) para poder enlazarla.
- Quinta pestaña **Tipos y métodos** (pedido del usuario): renderiza el `CatalogoPanel` parametrizado que F7.4.T3 dejó en `catalogo/tipos-y-metodos/CatalogoPanel.tsx`, con los dos bloques. La entrada del sidebar “Tipos y métodos” pasa a apuntar a `/config?tab=catalogo` y la página `/catalogo/tipos-y-metodos` redirige ahí. Un solo lugar, dos accesos.
- Encabezado con `PageHeader` del design system, como el resto de las páginas.

No hace:
- Cambiar campos, validaciones ni endpoints.

### Criterios de aceptación

- [ ] Configuración muestra pestañas y ninguna requiere scroll largo en 1366×768.
- [ ] Escribir en Laboratorio, pasar a Presupuestos y guardar persiste ambos cambios.
- [ ] Un error en un campo de otra pestaña lleva a esa pestaña al guardar.
- [ ] `/config?tab=tasa` abre directamente la pestaña de tasa.
- [ ] La pestaña Tipos y métodos administra ambos catálogos y el sidebar lleva a ella.

### Archivos afectados

- `apps/web/app/(app)/config/ConfigForm.tsx`
- `apps/web/app/(app)/config/page.tsx`

### Dependencias

- F7.3.T4

### Estimación

3h

## F7.6.T2 — Las imágenes subidas en Configuración se pierden

### Objetivo

El usuario reporta que el logo, la firma y el sello que sube en Configuración se pierden. Diagnosticar la causa real y corregirla.

### Alcance

Sí hace:
- Reproducir con el flujo real: `GET /api/config/assets/url`, `POST /api/config/assets/upload`, `POST /api/config/assets/set`, y la lectura posterior por `/api/storage/[bucket]/[...path]`.
- Revisar candidatos: `STORAGE_ROOT` sin default o apuntando a un directorio que Next limpia; `STORAGE_SIGNING_SECRET` ausente en dev; `set` no persistiendo el `object_key` en `laboratorio_config`; el formulario de Config pisando las claves de assets al guardar; el compose de producción sin volumen para `/app/.storage` (el de staging sí lo tiene).
- Corregir la causa encontrada y dejar un test o una verificación reproducible.
- Documentar en `docs/deploy/coolify-staged.md` qué necesita cada entorno para que los assets persistan.

No hace:
- Migrar el almacenamiento a InsForge Storage, salvo que sea la única salida; en ese caso, reportar antes de hacerlo.

### Criterios de aceptación

- [ ] Subir un logo en Config, guardar el formulario, recargar y reiniciar el servidor: el logo sigue.
- [ ] El PDF de presupuesto y de resultado muestran el logo subido.
- [ ] Causa raíz documentada en el commit.

### Archivos afectados

- `apps/web/app/api/config/assets/*`
- `apps/web/app/api/storage/[bucket]/[...path]/route.ts`
- `apps/web/lib/server/*storage*`
- `apps/web/app/(app)/config/AssetUploader.tsx`, `ConfigForm.tsx`
- `docs/deploy/coolify-staged.md`

### Dependencias

- Ninguna

### Estimación

3h

## F7.2.T6 — Presupuesto: ganancia según el modo y tasa de solo lectura

### Objetivo

El formulario de presupuesto confunde: la ganancia aparece en tres lugares detrás de un toggle, y el paquete cerrado fuerza ganancia 0. El usuario define el modelo: la ganancia global se aplica al paquete cerrado; en modo abierto la ganancia va por línea y el campo global desaparece; la tasa se muestra pero no se edita.

### Reglas

- **Paquete cerrado**: sus líneas no tienen ganancia editable. El cuadro de descuento y tasa muestra el campo **Ganancia %** global, que se aplica sobre el precio base del paquete, y el resumen en vivo muestra la fila Ganancia con el monto resultante. Se elimina el forzado a 0 de F7.2.T4.
- **Modo abierto** (exámenes sueltos o paquete desglosado): cada línea tiene su ganancia editable en la columna; el campo global no se muestra. Cada línea arranca con la ganancia por defecto de Configuración.
- **Mixto** (paquete cerrado más sueltos): el campo global se muestra y aplica solo a las líneas del paquete cerrado; los sueltos usan su columna.
- **Tasa**: visible con fuente y fecha, no editable. Sale de la última registrada; se cambia desde Configuración. El presupuesto sigue guardando `tasa_bs` como snapshot.
- Desaparece el toggle "Ajustes avanzados".

### Alcance

Sí hace:
- Migración `0020_config_ganancia_default.sql`: `laboratorio_config.ganancia_default_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (>= 0)`. Sin BEGIN/COMMIT, idempotente.
- Config, pestaña Presupuestos: campo "Ganancia por defecto (%)".
- `PresupuestoForm.tsx`: quitar el toggle; derivar el modo de las líneas (hay cerrado, hay abiertas); mostrar u ocultar el campo global y la columna según las reglas; líneas abiertas inicializadas con el default de Config; tasa como texto con badge de estado, sin input.
- `calcularTotales` y `submit`: las líneas del paquete cerrado no mandan `ganancia_pct` propia y heredan la global; las abiertas mandan la suya. Ajustar `reconstruirLineaGuardada` y `esPaqueteCerrado` para que al editar se conserve el modo. Tests en `packages/lib` para los tres modos.
- Edición de presupuesto: si la tasa guardada difiere de la vigente, mostrar ambas y mantener la guardada.
- Actualizar el texto de ayuda del resumen y del PDF si describen el porcentaje.

No hace:
- Cambiar el PDF del presupuesto, que ya imprime precios finales.

### Criterios de aceptación

- [ ] Paquete cerrado de base 15 con ganancia global 10: total 16,50 y la fila Ganancia del resumen muestra 1,50.
- [ ] Solo sueltos: no hay campo global; cada línea arranca con el default de Config y el total suma los precios con su ganancia.
- [ ] Mixto: el global afecta solo al paquete; cambiar la ganancia de un suelto no toca el paquete.
- [ ] La tasa no tiene input en el formulario; se ve valor, fuente y fecha.
- [ ] Abrir y guardar sin cambios un presupuesto de cada modo no altera el total.

### Archivos afectados

- `packages/db/migrations/0020_config_ganancia_default.sql`
- `packages/lib/schemas/config.ts`, `packages/db/repos/config.ts`
- `apps/web/app/(app)/config/ConfigForm.tsx`
- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`, `page.tsx`
- `packages/lib/presupuesto-lineas.ts`, `calcular-totales.ts` y tests

### Dependencias

- F7.2.T5

### Estimación

5h

## F7.7.T1 — Pipelines de presupuestos y órdenes como tablero tipo Trello

### Diagnóstico

Los dos kanban existen y ya arrastran, pero no se leen como un flujo:
- **Presupuestos** (`packages/ui/presupuestos/PresupuestoPipelineKanban.tsx:146`): las seis columnas van en una grilla que se parte en filas (1, 2, 3 o 6 columnas según el ancho). En un portátil son dos filas de tres bloques: Borrador, Enviado, Aprobado arriba; Rechazado, Cancelado, Cerrado abajo. El orden del proceso se pierde y el ojo lee cajas, no etapas.
- **Órdenes** (`packages/ui/ordenes/OrdenPipelineKanban.tsx:205`): sí usa fila con scroll horizontal, pero las columnas no tienen ancho fijo ni el contenedor alto fijo, así que se estiran, y la tarjeta repite la información del encabezado.
- Cada tarjeta lleva un badge del estado que ya dice la columna: ruido.
- Las columnas terminales (Cancelado, Rechazado, Anulada) pesan igual que las activas y ocupan el mismo espacio.
- No hay indicación visual de flujo entre columnas ni de qué destinos admite una tarjeta hasta que se arrastra.
- Arrastrar es la única vía de mover salvo el diálogo al hacer clic; falta un “Mover a…” accesible en la tarjeta (WCAG 2.2, movimientos de arrastre).
- Dos implementaciones distintas para el mismo patrón, con estilos distintos.

### Objetivo

Un solo componente de tablero, `packages/ui/pipeline/PipelineBoard.tsx`, parametrizado por columnas y tarjeta, que reemplace a los dos kanban con la lectura de un tablero tipo Trello: una fila horizontal de columnas del mismo ancho, en el orden del proceso, que se desplaza de lado y ocupa el alto disponible.

### Reglas de diseño

- **Fila horizontal, siempre.** Columnas de 280 px de ancho fijo, `flex-nowrap`, scroll horizontal del tablero con `scroll-snap`, sin partir en filas en ningún ancho. Alto del tablero: el viewport menos el encabezado; cada columna con scroll vertical propio y encabezado pegado arriba.
- **Orden del proceso, de izquierda a derecha.** Presupuestos: Borrador, Enviado, Aprobado, Cerrado. Órdenes: Registrada, Muestra tomada, En proceso, Validando, Entregada. Los estados terminales negativos (Rechazado, Cancelado, Anulada) van al final, colapsados: una columna angosta de 56 px con el nombre en vertical y el conteo, que se expande al hacer clic.
- **Encabezado de columna**: punto de color del estado, nombre, conteo en chip. En presupuestos, el total en USD de la columna en segunda línea. Sin badge del estado dentro de la tarjeta.
- **Tarjeta compacta**: dos líneas, título en negrita (paciente) y una línea de metadatos (número y fecha; en órdenes cédula y cantidad de exámenes), más el monto a la derecha en presupuestos. Borde izquierdo de 3 px con el color del estado. Hover eleva; foco visible.
- **Arrastre**: sensor con distancia de activación 6 px; al levantar, las columnas destino válidas se iluminan y las inválidas se atenúan, como ya hace órdenes. Overlay con la misma tarjeta a 95 % y rotación leve.
- **Alternativa al arrastre**: menú “Mover a…” en cada tarjeta, con solo los destinos válidos, operable con teclado. Reemplaza al diálogo actual al hacer clic; el clic en el cuerpo de la tarjeta abre el detalle.
- **Barra superior del tablero**: filtros rápidos (buscar por paciente o número, rango de fecha) y el resumen de totales, en una sola línea. Sin la caja gris actual.
- **Estados**: cargando con esqueleto de columnas, columna vacía con texto breve, error de transición como toast y la tarjeta vuelve a su lugar.
- Tokens del design system del repo; nada de colores crudos. Mobile: las columnas pasan a 85 vw con scroll-snap.

### Alcance

Sí hace:
- `packages/ui/pipeline/PipelineBoard.tsx` genérico: columnas ordenadas, columnas colapsables, tarjeta por render prop, transiciones válidas por función, `onMove(id, destino)`, menú Mover a, filtros por callback.
- Reescribir `PresupuestoPipelineKanban` y `OrdenPipelineKanban` sobre ese componente, manteniendo sus tarjetas y sus datos.
- Adaptar `PresupuestosList.tsx` y `OrdenesPipelineSection.tsx` para usar el `onMove` y quitar el diálogo de acciones cuando sólo movía de estado (las acciones extra, como convertir a orden, pasan al menú de la tarjeta).
- Agregar `packages/ui/pipeline` a los globs de Tailwind.
- Tests unitarios de la lógica de columnas (orden, colapsadas, destinos válidos).

No hace:
- Cambiar transiciones de estado ni endpoints.

### Criterios de aceptación

- [ ] En 1366×768, presupuestos y órdenes muestran las columnas activas en una fila, en orden del proceso, sin partirse; los estados terminales aparecen colapsados a la derecha.
- [ ] Arrastrar una tarjeta a una columna válida la mueve; a una inválida, vuelve y avisa.
- [ ] Cada tarjeta tiene “Mover a…” con solo los destinos válidos, usable con teclado.
- [ ] La tarjeta no repite el estado de su columna.
- [ ] `pnpm turbo run lint typecheck test build` en verde.

### Archivos afectados

- `packages/ui/pipeline/PipelineBoard.tsx` (nuevo) y test
- `packages/ui/presupuestos/PresupuestoPipelineKanban.tsx`
- `packages/ui/ordenes/OrdenPipelineKanban.tsx`
- `apps/web/app/(app)/presupuestos/PresupuestosList.tsx`
- `apps/web/app/(app)/resultados/OrdenesPipelineSection.tsx`, `OrdenesShell.tsx`
- `apps/web/tailwind.config.ts`

### Dependencias

- Ninguna

### Estimación

6h

## F7.2.T7 — Enviar el presupuesto por WhatsApp o email

### Objetivo

Un presupuesto en Borrador tiene como siguiente paso “Enviado”, pero hoy ese paso es sólo un cambio de estado en el tablero: no hay forma de mandárselo al paciente desde la app. Los resultados sí la tienen (`POST /api/resultados/[id]/enviar`, enlace público `/r/[slug]`, WhatsApp con `wa.me` y email por Resend). Replicar ese flujo para presupuestos.

### Alcance

Sí hace:
- Migración `0021_enlaces_presupuesto.sql`: tabla `enlaces_presupuesto (id, slug unique, presupuesto_id FK ON DELETE CASCADE, expira_en, created_at, created_by)`, RLS igual que `enlaces_resultado`. Vigencia 7 días (el presupuesto vale 24 h, el enlace se puede releer una semana). Sin BEGIN/COMMIT, idempotente.
- `packages/db/repos/enlaces.ts`: `crearOReutilizarPresupuesto`, `getPresupuestoBySlug`, código `ENLACES_PRESUPUESTO_TABLA_FALTANTE`.
- `packages/lib/enlace-presupuesto.ts`: `mensajeWhatsApp`, `asuntoEmail`, `htmlEmail`, `mailtoPresupuesto`, con número, paciente, total USD y Bs, tasa, vigencia de 24 h y el enlace. Reusar los normalizadores de teléfono y email de `enlace-resultado.ts`.
- `POST /api/presupuestos/[id]/enviar` con `{ canal: "whatsapp" | "email" }`, espejo de la ruta de resultados: crea o reutiliza el enlace, WhatsApp devuelve `whatsappUrl`, email envía por Resend o devuelve `mailtoUrl` si no hay proveedor. Si el presupuesto está en Borrador y el envío sale bien, pasa a Enviado por `cambiarEstado` con auditoría. Permitido en Borrador y en Enviado (reenvío). Paciente sin ficha o sin teléfono/email: 400 con código claro.
- Ruta pública `/p/[slug]`: laboratorio, número, paciente, fecha, total USD y Bs, aviso de vigencia y botón “Descargar presupuesto (PDF)”; `GET /api/p/[slug]/pdf` sin sesión, 404 si venció. Middleware: dejar pasar `/p/` y `api/p/` con el mismo cuidado de la barra final que `api/r/`.
- UI: extraer `EnviarResultadoButtons` a un componente compartido `packages/ui/envio/EnviarButtons.tsx` parametrizado por endpoint y textos; usarlo en el detalle del resultado (sin cambio de comportamiento) y en `PresupuestoDetalle` cuando el estado es Borrador o Enviado, junto a Descargar PDF. Botón deshabilitado con explicación si el paciente no tiene teléfono o email.
- Tests de los mensajes en `packages/lib` y del repo de enlaces con Db falsa.

No hace:
- Adjuntar el PDF al email: va el enlace, como en resultados.

### Criterios de aceptación

- [ ] En un presupuesto en Borrador con paciente con teléfono, “Enviar por WhatsApp” abre `wa.me` con el mensaje y el enlace, y el presupuesto pasa a Enviado.
- [ ] “Enviar por email” manda el correo por Resend y el presupuesto pasa a Enviado; sin proveedor, abre `mailto:`.
- [ ] `/p/<slug>` sin sesión muestra el resumen y descarga el PDF; vencido, 404.
- [ ] Reenviar desde Enviado no cambia el estado ni crea otro enlace.
- [ ] `pnpm turbo run lint typecheck test build` en verde.

### Archivos afectados

- `packages/db/migrations/0021_enlaces_presupuesto.sql`
- `packages/db/repos/enlaces.ts`
- `packages/lib/enlace-presupuesto.ts` y test
- `apps/web/app/api/presupuestos/[id]/enviar/route.ts`
- `apps/web/app/p/[slug]/page.tsx`, `apps/web/app/api/p/[slug]/pdf/route.ts`
- `apps/web/middleware.ts`
- `packages/ui/envio/EnviarButtons.tsx`, `apps/web/app/(app)/resultados/[id]/EnviarResultadoButtons.tsx`, `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`
- `apps/web/tailwind.config.ts`

### Dependencias

- F7.2.T6

### Estimación

5h
