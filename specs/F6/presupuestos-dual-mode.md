---
type: spec
phase: F6
package: presupuestos
project_id: labo-system
version: 0.1
depends_on:
  - F6.paquetes
  - F6.pipeline
blocks: []
generated_by: orch-spec
generated_at: 2026-08-25
title: "F6.presupuestos — Presupuestos: Dual Mode, Ganancia por Línea y ExamenAutocomplete"
---

# F6.5 · Presupuestos: Dual Mode, Ganancia por Línea y ExamenAutocomplete

Evolución integral del generador de presupuestos médicos:
1. Componente accesible `ExamenAutocomplete.tsx`: Búsqueda instantánea con debounce de 250ms, navegación fluida por teclado, auto-focus continuo y marcado de ítems ya agregados.
2. Motor de cálculo y persistencia por línea: Migración `0007_presupuestos_lineas_pricing.sql` (`paquete_id`, `precio_base_snap`, `ganancia_pct`, `precio_final_snap` en `presupuestos_examenes`), schemas Zod y motor matemático `@labo/lib/calcular-totales.ts` asegurando exactitud aritmética al centavo.
3. UI PresupuestoForm Dual Mode & Live Cart: Selector dual de paquetes (Modo A Cerrado / Modo B Desglosado), eliminación de ítems con Trash, control de ganancia global y por línea, y Live Cart interactivo.
4. PresupuestoPDF & Conversión Clínica Transparente: Reporte impreso y PDF transparente sin recargos fantasma y conversión precisa que solo instancia los exámenes preservados.

---

## F6.5.T1 — Componente Accesible ExamenAutocomplete

### Objetivo

Extraer y crear el componente accesible `@labo/ui/examenes/ExamenAutocomplete.tsx` con debounce de 250ms, navegación por teclado (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`), auto-focus continuo para agilizar carga masiva y badge/indicador visual para exámenes ya agregados.

### Alcance

Sí hace:
- Implementar `ExamenAutocomplete.tsx` siguiendo el patrón WAI-ARIA Combobox accesible.
- Debounce de búsqueda a 250ms contra el listado/búsqueda de catálogo.
- Navegación fluida por teclado con `ArrowDown`, `ArrowUp`, selección con `Enter` y cierre con `Escape`.
- Prop `selectedIds?: string[]` para marcar con badge "Ya agregado" y deshabilitar re-selección accidental.
- Modo `autoFocusOnSelect?: boolean` para devolver el foco automáticamente al input de búsqueda tras agregar un ítem, acelerando el tipeo de presupuestos/resultados.
- Crear tests de testing-library / unitarios para interacción de teclado y debounce.

No hace:
- Integración específica en el formulario de presupuestos (asignado a F6.5.T3).

### Criterios de aceptación

- [ ] Búsqueda responde con debounce de 250ms.
- [ ] Navegación completa por teclado funcional sin requerir mouse.
- [ ] Exámenes ya seleccionados muestran badge "Ya agregado" y no permiten duplicación.
- [ ] Foco se retiene automáticamente en el input tras seleccionar un examen si `autoFocusOnSelect` está activo.
- [ ] Tests de componente pasan en verde.

### Archivos afectados

- `packages/ui/examenes/ExamenAutocomplete.tsx`
- `packages/ui/examenes/ExamenAutocomplete.test.tsx`

### Dependencias

- Ninguna

### Estimación

2.0h

---

## F6.5.T2 — DB & Engine de Totales: Migración presupuestos_lineas_pricing y cálculo por línea

### Objetivo

Crear la migración `0007_presupuestos_lineas_pricing.sql` agregando columnas de pricing por línea (`paquete_id uuid REFERENCES paquetes(id)`, `precio_base_snap numeric(12,2)`, `ganancia_pct numeric(5,2) DEFAULT 0`, `precio_final_snap numeric(12,2)`) en `presupuestos_examenes`, actualizar schemas Zod y adaptar el motor de cálculo `@labo/lib/calcular-totales.ts` para calcular precios finales y totales sin inconsistencias aritméticas.

### Alcance

Sí hace:
- Crear migración `0007_presupuestos_lineas_pricing.sql` con las nuevas columnas en `presupuestos_examenes`.
- Actualizar `packages/db/schema.sql`.
- Actualizar `packages/lib/schemas/presupuesto.ts` tipando las líneas con `paquete_id`, `precio_base_snap`, `ganancia_pct`, `precio_final_snap`.
- Actualizar `calcularTotales` en `packages/lib/calcular-totales.ts` para soportar pricing por línea: `precio_final = precio_base * (1 + ganancia_pct / 100)`, sumando exactamente las líneas finales para que el total coincida al centavo con la suma de las líneas visualizadas en pantalla y en PDF.
- Crear tests unitarios exhaustivos para casos borde de redondeo, porcentajes mixtos por línea y descuentos/paquetes.

No hace:
- UI Formulario (F6.5.T3) o renderizado PDF (F6.5.T4).

### Criterios de aceptación

- [ ] Migración `0007_presupuestos_lineas_pricing.sql` aplica limpia en PostgreSQL.
- [ ] `calcularTotales` calcula `precio_final` por línea y total general cumpliendo que `suma(lineas.precio_final) === total_usd` sin desajustes por redondeo.
- [ ] Esquemas Zod validan líneas con ganancia porcentual individual.
- [ ] Tests unitarios en `@labo/lib` pasan al 100% en verde.

### Archivos afectados

- `packages/db/migrations/0007_presupuestos_lineas_pricing.sql`
- `packages/db/schema.sql`
- `packages/lib/schemas/presupuesto.ts`
- `packages/lib/calcular-totales.ts`
- `packages/lib/calcular-totales.test.ts`

### Dependencias

- F6.4.T1

### Estimación

2.0h

---

## F6.5.T3 — UI PresupuestoForm Dual Mode & Live Cart (Modo A Cerrado / Modo B Desglosado)

### Objetivo

Actualizar `PresupuestoForm.tsx` para permitir la selección por examen individual o por paquete con soporte Dual-Mode (Modo A: Paquete Cerrado como ítem único con su precio base / Modo B: Paquete Desglosado con sus exámenes individuales), permitir eliminar exámenes no deseados de un paquete con botón Trash, editar el porcentaje de ganancia a nivel global o por línea, e integrar `ExamenAutocomplete`.

### Alcance

Sí hace:
- Integrar `ExamenAutocomplete` en el selector de exámenes individuales.
- Al seleccionar un Paquete, ofrecer selector modal/dialog o switch de modo:
  - Modo A (Cerrado): Añade el paquete como bloque indivisible usando su `precio_base`.
  - Modo B (Desglosado): Desglosa todos los exámenes del paquete en el carrito como líneas individuales.
- Permitir eliminar exámenes individuales del carrito (incluso si provienen de un paquete desglosado) mediante botón Trash.
- Control de ganancia: input global de ganancia (% aplicado a todas las líneas) y toggle para personalizar ganancia por línea individualmente.
- Carrito en vivo que recalcula subtotales, recargo de ganancia, total USD y total Bs (con tasa BCV) en tiempo real.
- Actualizar `PresupuestoDetalle.tsx` para reflejar el desglose de líneas y paquetes correspondiente.

No hace:
- Template PDF (F6.5.T4).

### Criterios de aceptación

- [ ] Inserción rápida de exámenes individuales vía `ExamenAutocomplete` con auto-foco.
- [ ] Selección de paquete en Modo A inserta ítem cerrado con `precio_base`.
- [ ] Selección de paquete en Modo B desglosa exámenes permitiendo eliminar ítems específicos con Trash.
- [ ] Ajuste de ganancia global y por línea recalcula totales en vivo sin desfase.
- [ ] Guardar presupuesto envía el payload tipado correcto a la API.

### Archivos afectados

- `apps/web/app/(app)/presupuestos/nuevo/PresupuestoForm.tsx`
- `apps/web/app/(app)/presupuestos/[id]/PresupuestoDetalle.tsx`

### Dependencias

- F6.4.T2
- F6.5.T1
- F6.5.T2

### Estimación

3.0h

---

## F6.5.T4 — PresupuestoPDF & Conversión Clínica Transparente

### Objetivo

Actualizar la plantilla `@labo/pdf/PresupuestoPDF.tsx` para mostrar los precios finales por línea de forma transparente (asegurando que la suma de líneas cuadre exactamente al centavo con el total general sin recargos fantasma) y garantizar que la función de conversión a resultado clínico (`convertirPresupuestoAResultado`) procese únicamente los exámenes efectivamente conservados en el presupuesto.

### Alcance

Sí hace:
- Modificar `PresupuestoPDF.tsx` para renderizar cada línea con su `precio_final_snap` transparente (o desglose según Modo Cerrado/Desglosado), garantizando que `suma(precios_lineas) === total_usd` tanto en USD como en Bs.
- Evitar discrepancias visuales o "recargos fantasma" no explicados en la tabla del PDF.
- Actualizar la lógica de backend en `packages/db/repos/presupuestos.ts` y Route Handler `/api/presupuestos/[id]/convertir` para que al convertir un presupuesto a resultado clínico, se instancien únicamente los exámenes activos presentes en `presupuestos_examenes` vinculados a ese presupuesto.
- Validar snapshots inmutables en la conversión.

No hace:
- Interfaz de creación de presupuestos (F6.5.T3).

### Criterios de aceptación

- [ ] El PDF del presupuesto totaliza exactamente la suma de los montos visibles por línea al centavo en USD y Bs.
- [ ] No existen renglones de recargo ambiguos o inconsistencias aritméticas en el documento impreso/PDF.
- [ ] La conversión de presupuesto a resultado genera la orden clínica conteniendo únicamente los exámenes conservados en el presupuesto.
- [ ] Tests de conversión y snapshots pasan en verde.

### Archivos afectados

- `packages/pdf/PresupuestoPDF.tsx`
- `packages/db/repos/presupuestos.ts`
- `apps/web/app/api/presupuestos/[id]/convertir/route.ts`

### Dependencias

- F6.5.T3
- F6.6.T2

### Estimación

2.0h
