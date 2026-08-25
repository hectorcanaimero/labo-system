# Smoke Tests Post-Cutover — LabSystem

> **Versión**: 1.0
> **Task**: F4.2.T3
> **Ref spec**: specs/F4/cutover.md §F4.cutover.T03
> **Contexto en runbook**: [`CUTOVER-RUNBOOK.md §9`](./CUTOVER-RUNBOOK.md#9-paso-5--smoke-tests-t090min--t0120min) — se ejecuta a T0+90min, ventana de 30 min.
> **Ejecutores**: Admin (Rosa) + Observador (2do dev) en paralelo.

---

## 0. Antes de empezar

### Pre-condiciones

- [ ] `--verify` retornó `overall_ok: true` (Paso 4 del runbook completado).
- [ ] LabSystem accesible en `https://lab.rvlaboratorio.com` — responde 200.
- [ ] Se conocen 3 cédulas/nombres de pacientes reales migrados (tomar de `docs/migration/dry-run-<fecha>.md`).
- [ ] User de prueba prod disponible: `admin@labsystem.dev` y `operador@labsystem.dev` (ver [§Credenciales prod](#credenciales-prod)).
- [ ] Timer iniciado — window máxima: 30 min. Si a T0+120 no se completó 10/10, evaluar abort.

### Credenciales prod

Los usuarios de prueba deben existir en Postgres prod (sembrados por `migrate-wp` o creados manualmente pre-cutover). **No usar las credenciales de admin real durante smoke tests** — usar usuarios de test dedicados.

| Rol | Email | Contraseña (prod) |
|-----|-------|-------------------|
| Admin test | `admin@labsystem.dev` | Generada pre-cutover, en el password manager |
| Operador test | `operador@labsystem.dev` | Generada pre-cutover, en el password manager |

> ⚠️ Si los users de test no existen en prod, crearlos vía `INSERT INTO usuarios` **antes** de abrir la ventana de cutover.

### Pacientes de referencia (rellenar antes del cutover)

Tomar 3 pacientes reales del reporte `dry-run-<fecha>.md`. Estas cédulas/nombres se usan en el ítem 3 y 4 del checklist.

| # | Nombre completo | Cédula | Cantidad de resultados migrados |
|---|-----------------|--------|---------------------------------|
| P1 | _(rellenar)_ | _(rellenar)_ | _(rellenar)_ |
| P2 | _(rellenar)_ | _(rellenar)_ | _(rellenar)_ |
| P3 | _(rellenar)_ | _(rellenar)_ | _(rellenar)_ |

---

## 1. Checklist Manual (10 ítems)

Marcar cada ítem con ✅ (pasa), ❌ (falla) o ⚠️ (pasa con observación).

**Regla**: cualquier ❌ en ítems 1-6 es criterio de abort inmediato (ver `CUTOVER-RUNBOOK.md §11 A8`).

---

### Ítem 1 — Login Admin y Operador

**Ejecutor**: Admin (Rosa)
**Tiempo esperado**: 2 min

Pasos:

1. Abrir `https://lab.rvlaboratorio.com/login` en navegador limpio (modo incógnito).
2. Ingresar con `admin@labsystem.dev` + contraseña prod.
3. Verificar que redirige a `/dashboard` y el nombre "Admin LabSystem" aparece en el header.
4. Cerrar sesión.
5. Ingresar con `operador@labsystem.dev` + contraseña prod.
6. Verificar que redirige a `/dashboard` sin acceso a `/audit` (debe retornar 403 o redirigir).

**Criterio OK**:
- [ ] Admin loguea y llega a `/dashboard`.
- [ ] Operador loguea y llega a `/dashboard`.
- [ ] Operador no puede acceder a `/audit` (redirige o 403).

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 2 — Dashboard carga con KPIs reales

**Ejecutor**: Admin (Rosa)
**Tiempo esperado**: 2 min

Pasos (logueado como Admin):

1. Navegar a `/dashboard`.
2. Esperar que carguen las cards de KPI (no spinners perpetuos).
3. Verificar que los valores son > 0 (los datos migrados deben tener registros reales).
4. Verificar que el gráfico de resultados muestra datos históricos.
5. Verificar que los "Quick Links" navegan a las secciones correctas.

**Criterio OK**:
- [ ] Cards KPI visibles con valores > 0.
- [ ] Sin spinners perpetuos (carga < 10s en conexión normal).
- [ ] Gráfico de resultados muestra al menos 1 punto de datos.

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 3 — Buscar 3 pacientes conocidos (por cédula y nombre)

**Ejecutor**: Observador (2do dev)
**Tiempo esperado**: 5 min

Pasos (logueado como Operador):

Para cada uno de los 3 pacientes de la tabla del §0:

1. Navegar a `/pacientes`.
2. Buscar por **cédula** (ej: `V-12345678`).
3. Verificar que el paciente aparece en la tabla con su nombre correcto.
4. Limpiar búsqueda.
5. Buscar por **nombre** (primeros caracteres del nombre).
6. Verificar que aparece entre los resultados.

**Criterio OK**:
- [ ] P1 encontrado por cédula y por nombre.
- [ ] P2 encontrado por cédula y por nombre.
- [ ] P3 encontrado por cédula y por nombre.

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 4 — Abrir ficha de paciente con historial migrado

**Ejecutor**: Admin (Rosa) o Observador
**Tiempo esperado**: 3 min

Pasos (usar P1 del §0 que tenga más resultados migrados):

1. Navegar a `/pacientes`.
2. Buscar al paciente P1.
3. Hacer clic en su nombre para abrir la ficha `/pacientes/:id`.
4. Verificar que el historial de resultados muestra registros migrados (al menos 1).
5. Verificar que los datos básicos del paciente (nombre, cédula, fecha nacimiento, sexo) coinciden con lo esperado.

**Criterio OK**:
- [ ] Ficha abre sin error.
- [ ] Historial muestra resultados migrados (count ≥ 1).
- [ ] Datos del paciente son correctos (no hay truncamiento ni caracteres extraños).

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 5 — Crear resultado nuevo (paciente + exámenes)

**Ejecutor**: Observador (2do dev)
**Tiempo esperado**: 4 min

Pasos (logueado como Operador):

1. Navegar a `/resultados/nuevo`.
2. Seleccionar al paciente P1 usando el buscador.
3. Ingresar fecha de muestra (ej: fecha de ayer).
4. Agregar un examen del catálogo (buscar "Hemograma" u otro disponible).
5. Ingresar un valor de resultado para el examen.
6. Hacer clic en "Guardar resultado".
7. Verificar que redirige a la ficha del resultado `/resultados/:id`.
8. Verificar que los datos guardados son correctos.

**Criterio OK**:
- [ ] Formulario guarda sin error.
- [ ] Redirige a `/resultados/:id`.
- [ ] Datos del resultado son los ingresados (paciente, examen, valor).
- [ ] El resultado aparece en la ficha del paciente P1.

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 6 — Descargar PDF de resultado migrado (verificar snapshot)

**Ejecutor**: Admin (Rosa)
**Tiempo esperado**: 4 min

Pasos:

1. Navegar a un resultado migrado con fecha histórica (de P1, tomado del historial).
2. Hacer clic en "Descargar PDF".
3. Verificar que el PDF descarga sin error (no 500, no pantalla en blanco).
4. Abrir el PDF y verificar visualmente:
   - Nombre del paciente correcto.
   - Nombre del laboratorio correcto.
   - Exámenes con valores.
   - Fecha del resultado correcta.
5. Comparar visualmente con un snapshot de referencia (si existe en `docs/migration/pdf-snapshot-referencia.pdf`).

**Criterio OK**:
- [ ] PDF descarga (HTTP 200, Content-Type: application/pdf).
- [ ] PDF abre correctamente (no corrupto).
- [ ] Datos del paciente visibles y correctos.
- [ ] Nombre del laboratorio correcto en el encabezado.

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 7 — Crear presupuesto (nombre libre + paciente real)

**Ejecutor**: Observador (2do dev)
**Tiempo esperado**: 4 min

Pasos (logueado como Operador):

**Variante A — Paciente registrado**:

1. Navegar a `/presupuestos/nuevo`.
2. Seleccionar paciente P2 del buscador.
3. Agregar un examen (ej: "Glicemia").
4. Verificar que la tasa BCV se autocarga (o ingresar manualmente si no).
5. Guardar.
6. Verificar que redirige a `/presupuestos/:id` con estado "Borrador".

**Variante B — Nombre libre (paciente no registrado)**:

1. Navegar a `/presupuestos/nuevo`.
2. Seleccionar "Nombre libre" e ingresar "Paciente Externo Test".
3. Agregar un examen.
4. Guardar.
5. Verificar que el presupuesto se crea con el nombre libre visible.

**Criterio OK**:
- [ ] Variante A guarda con paciente real.
- [ ] Variante B guarda con nombre libre.
- [ ] Tasa BCV visible en ambos casos (automática o manual).

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 8 — Convertir presupuesto a resultado

**Ejecutor**: Admin (Rosa)
**Tiempo esperado**: 3 min

Pasos (usar el presupuesto de Variante A del ítem 7):

1. Abrir el presupuesto en `/presupuestos/:id`.
2. Hacer clic en "Aprobar".
3. Verificar que el estado cambia a "Aprobado".
4. Hacer clic en "Convertir a Resultado".
5. Confirmar en el modal de confirmación.
6. Verificar que redirige a `/resultados/:id` con los mismos exámenes.

**Criterio OK**:
- [ ] Flujo aprobación → conversión completa sin error.
- [ ] Resultado creado con los exámenes del presupuesto.
- [ ] El presupuesto queda en estado "Convertido".

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 9 — Exportar CSV de presupuestos

**Ejecutor**: Observador (2do dev)
**Tiempo esperado**: 2 min

Pasos (logueado como Operador):

1. Navegar a `/presupuestos`.
2. Hacer clic en "Exportar" (botón `ExportButton`).
3. Verificar que el sistema procesa la exportación (spinner → link de descarga o descarga directa).
4. Descargar el CSV.
5. Abrir el CSV en un editor de texto o planilla y verificar:
   - Tiene encabezados (ej: `fecha`, `paciente`, `total_usd`, etc.).
   - Tiene al menos una fila de datos (los presupuestos migrados).

**Criterio OK**:
- [ ] Botón "Exportar" responde (no 500).
- [ ] CSV descarga correctamente.
- [ ] CSV tiene encabezados y al menos 1 fila de datos.

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

### Ítem 10 — Verificar tasa BCV automática (o manual override)

**Ejecutor**: Admin (Rosa)
**Tiempo esperado**: 3 min

Pasos:

**Verificación automática** (si el cron está activo):

1. Navegar a `/config` (Admin only).
2. Verificar que la sección "Tasa BCV" muestra una tasa con fecha de hoy o ayer.
3. Verificar que la tasa es un valor razonable (> 0, en el rango esperado para VES).

**Override manual** (si el cron falla o la tasa está stale):

1. En `/config`, hacer clic en "Actualizar tasa manualmente".
2. Ingresar la tasa actual del BCV (consultar https://www.bcv.org.ve).
3. Guardar.
4. Verificar que la tasa queda actualizada con la fecha de hoy.

**Verificación en presupuesto**:

5. Crear un nuevo presupuesto (o editar uno existente).
6. Verificar que la tasa autocargada coincide con la guardada en `/config`.

**Criterio OK**:
- [ ] Tasa BCV visible en `/config` con fecha ≤ 24h de antigüedad (automática) O actualizada manualmente.
- [ ] Tasa > 0 y en rango razonable.
- [ ] Tasa se propaga a formulario de presupuesto.

**Resultado**: [ ] ✅ [ ] ❌ [ ] ⚠️ — Notas: _______________

---

## 2. Ejecución Playwright E2E contra Prod

La suite E2E de `F4.1.T5` (`apps/web/e2e/`) se corre contra prod con los users de test para validar los mismos flujos de forma automatizada.

### 2.1 Pre-condiciones Playwright

- [ ] Node.js ≥ 20, `pnpm` disponibles en el host de smoke tests.
- [ ] `DATABASE_URL` apuntando al Postgres prod (vía SSH tunnel desde laptop del ejecutor o desde el VPS).
- [ ] Users de test existentes en Postgres prod (ver §0 Credenciales prod).

### 2.2 Comando de ejecución

```bash
# Desde el root del repo (checkout del mismo commit usado en deploy)
cd /path/to/labo-system

# Instalar dependencias de Playwright (primera vez)
pnpm --filter web exec playwright install chromium

# Correr la suite contra prod
BASE_URL="https://lab.rvlaboratorio.com" \
DATABASE_URL="postgres://..." \  # prod DB — para el global-setup seed de test
  pnpm --filter web exec playwright test \
    --config apps/web/playwright.config.ts \
    --reporter=html \
    2>&1 | tee /tmp/playwright-smoke-$(date +%Y%m%dT%H%M%S).log
```

> **Nota sobre `DATABASE_URL` en smoke tests**: el `global-setup` hace un `TRUNCATE` + seed en la base. En prod, los users de test deben existir **sin** hacer truncate a los datos reales. Revisar si `global-setup.ts` puede correr en modo "skip truncate si existen users" antes de la ventana. Si no, crear los users de test manualmente y **no** apuntar `DATABASE_URL` al global setup en prod.

**Alternativa segura** — correr solo los tests sin global-setup (requiere users + fixtures existentes en prod):

```bash
BASE_URL="https://lab.rvlaboratorio.com" \
  pnpm --filter web exec playwright test \
    --config apps/web/playwright.config.ts \
    --reporter=html \
    --global-setup="" \
    2>&1 | tee /tmp/playwright-smoke-$(date +%Y%m%dT%H%M%S).log
```

### 2.3 Tests incluidos

| Spec | Qué valida |
|------|-----------|
| `auth.spec.ts` | Login OK + login fallido |
| `paciente.spec.ts` | Crear paciente + buscar por cédula |
| `resultado.spec.ts` | Crear resultado + descargar PDF |
| `presupuesto.spec.ts` | Crear presupuesto + aprobar + convertir a resultado |
| `export.spec.ts` | Exportar presupuestos CSV |

### 2.4 Criterio OK

- [ ] **5/5 specs pasan** (exit code 0).
- [ ] Sin screenshots de falla en `apps/web/test-results/`.
- [ ] Tiempo total de suite < 5 min.

**Resultado Playwright**: [ ] ✅ PASA [ ] ❌ FALLA

Adjuntar log: `/tmp/playwright-smoke-<timestamp>.log`

---

## 3. Resumen de Resultados

| Ítem | Descripción | Resultado |
|------|-------------|-----------|
| 1 | Login Admin y Operador | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 2 | Dashboard KPIs reales | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 3 | Buscar 3 pacientes conocidos | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 4 | Ficha paciente con historial migrado | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 5 | Crear resultado nuevo | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 6 | Descargar PDF resultado migrado | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 7 | Crear presupuesto (libre + real) | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 8 | Convertir presupuesto a resultado | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 9 | Exportar CSV presupuestos | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| 10 | Tasa BCV automática / override | [ ] ✅ [ ] ❌ [ ] ⚠️ |
| E2E | Playwright suite prod | [ ] ✅ [ ] ❌ |

**Total**: ___/10 items manuales + Playwright [ ] OK [ ] FAIL

---

## 4. Decisión Go / No-Go

### Go (todos los criterios cumplidos)

- [ ] **10/10 ítems manuales**: todos ✅ (los ⚠️ fueron documentados y aceptados por Admin).
- [ ] **Playwright E2E**: pasa contra prod (5/5 specs).

→ Continuar a [`CUTOVER-RUNBOOK.md §10`](./CUTOVER-RUNBOOK.md#10-paso-6--go-live--wp-a-read-only-t0120min--t0150min) (Go-live + WP a read-only).

### No-Go (abort)

- [ ] Cualquier ítem 1–6 con ❌ **sin workaround inmediato** (< 5 min).
- [ ] Playwright E2E con ≥ 1 spec fallida en flujo bloqueante (auth, resultado, PDF).

→ Ejecutar [`CUTOVER-RUNBOOK.md §12`](./CUTOVER-RUNBOOK.md#12-rollback-rápido) (Rollback rápido).

---

## 5. Sign-Off Admin

Completar luego de 10/10 items OK y Playwright verde.

```
Yo, _________________ (Admin del sistema / Rosa), confirmo que:

- Los 10/10 ítems del checklist manual fueron ejecutados y pasaron.
- La suite Playwright E2E pasó contra el entorno de producción.
- Los datos migrados son correctos y el sistema opera como se espera.
- Autorizo el go-live de LabSystem.

Firma: _____________________________

Fecha y hora: _________________________ VET

Nombre: _____________________________

Observaciones:
______________________________________________________________
______________________________________________________________
```

**Artefactos a archivar en `/backups/cutover-<T0>/`**:

- [ ] Este archivo completado (exportado como PDF o screenshot).
- [ ] Log de Playwright: `playwright-smoke-<timestamp>.log`.
- [ ] Reporte HTML Playwright: `apps/web/playwright-report/index.html` (comprimido).

---

## Anexo — Observaciones y Issues Encontrados

Documentar aquí cualquier comportamiento anómalo que no cause abort pero requiere seguimiento:

| # | Ítem | Descripción | Severidad | Acción |
|---|------|-------------|-----------|--------|
| 1 | | | P0/P1/P2/P3 | |
| 2 | | | | |
| 3 | | | | |

> P0 = bloqueante → abort. P1 = crítico → arreglar en < 24h. P2 = importante → ticket. P3 = cosmético → backlog.
