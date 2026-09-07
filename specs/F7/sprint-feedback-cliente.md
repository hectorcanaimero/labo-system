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

Rama del sprint: `sprint/f7-1`, base `staged`. Cada tarea es un commit; al cerrar la semana se abre el PR `sprint/f7-1 → staged`.

| Tarea | Sesión | Estado | Commit | Comentario |
|---|---|---|---|---|
| F7.1.T1 | opus | hecha | `78441b1` | Siete modales migrados al Dialog de shadcn con DialogBody desplazable y pie fijo. packages/ui suma @radix-ui/react-dialog y un overlay/Dialog.tsx propio para CargarPaqueteButton. Escape y click fuera no cancelan un guardado en curso. Falta verificar a ojo en 1366x768 y tablet. |
| F7.1.T2 | sonnet | hecha | `9094277` | Cinco códigos traducidos y console.error del 500 en exámenes y presupuestos. Pendiente: buscar en los logs de Coolify el POST a /api/examenes del 2026-09-06 02:35-02:45 UTC; la sesión no tiene acceso. Hallazgo: pnpm test y pnpm typecheck fallan en la raíz por errores preexistentes (tsup de @labo/lib sin inputs, tests de integración de @labo/db); por paquete, lib y web pasan. |
| F7.2.T1 | sonnet | hecha | `f275872` | Botón siempre habilitado; al guardar con faltantes los lista junto al botón y hace scroll a la sección. Bloque de paciente en rojo tras el intento. Nota operativa: tras rebasear sobre commits que agregan dependencias, correr pnpm install de nuevo o el typecheck falla por caché. |
| F7.3.T1 | sonnet | hecha, con seguimiento | `1085ba2` | Cédula enmascarada y tabla de valores quitada de /r/[slug]. Seguimiento: la página quedó sin forma de bajar el PDF porque api/pdf/resultado exige sesión de staff; el paciente no ve su resultado. Se agrega F7.3.T1b: endpoint público de PDF autorizado por slug y botón de descarga. |
| F7.3.T1b | sonnet | hecha | `97b3e10` | GET /api/r/[slug]/pdf sin sesión, 404 si el slug no existe, venció o la orden está anulada. El render se extrajo de la ruta de staff y se comparte. Botón de descarga en la página pública. Build de web pasa; descarga real sin probar en navegador. |
| F7.2.T4 | sonnet | hecha | `dce358f` | Ganancia global, columna por línea y fila del resumen detrás de un toggle Ajustes avanzados plegado. Paquete cerrado: líneas con ganancia 0 explícita, test nuevo (15 repartido en 9+6 con ganancia global 10 da 15). Seguimiento anotado: al editar un presupuesto guardado, las líneas de paquete cerrado se reconstruyen como desglosadas; limitación previa. |
| F7.1.T3 | opus | hecha | `494930d` | Botón Agregar en el catálogo, sensores y SortableContext real para el reorden, PUT único /api/paquetes/[id] con setContenido. Sin transacciones en PostgREST: el rollback es por compensación; atomicidad real requeriría una RPC en Postgres. packages/ui suma dnd-kit. Las rutas viejas /examenes y /titulos siguen. Sin prueba en navegador ni test de setContenido. |
| F7.2.T2 | opus | hecha | `2f25ad7` | Migración 0015 (toma_muestra_usd, domicilio_usd en presupuestos; toma_muestra_default_usd en laboratorio_config), probada en Postgres local e idempotente. calcularTotales suma serviciosUsd después de descuento y ganancia; schemas y repo persisten los campos. NO aplicada en hosted: debe aplicarse ANTES del deploy porque PRESUPUESTO_COLS ya pide las columnas. Tests de lib 313/313. |
| F7.2.T3 | opus | en curso | — | — |

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
