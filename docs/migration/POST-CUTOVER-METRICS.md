# Post-Cutover Metrics — Primer Mes (Día 0 a Día 30)

> Reporte de observabilidad, checkpoints y validación de success criteria post-migración de WordPress → LabSystem.
>
> **Timeline**: Día 0 = fecha de go-live (cutover), Día 15 = primer checkpoint, Día 30 = reporte final.

---

## Contexto

- **PRD §9 Success Criteria**: Uptime ≥ 99.5%, cero P0/P1 abiertos al día 15.
- **Dependencias técnicas**: F4.2.T3 (smoke tests), F4.2.T4 (post-cutover playbook), F4.1.T4 (PDF health).
- **Responsables**:
  - **Admin (Rosa)**: firma checkpoints, revisa operación diaria, reporta incidentes.
  - **Dev**: soporte técnico, analysis root cause, hotfixes P0/P1.

---

## § 1. Criterios de Aceptación (Acceptance Criteria)

### Obligatorios (Día 15)

- [ ] **Uptime ≥ 99.5%**: Verificado en UptimeRobot, exportado CSV.
- [ ] **Cero P0/P1 abiertos**: Confirmado en tracker.
- [ ] **Checkpoint día 15 documentado y firmado**: Admin + Dev revisan en junta.

### Obligatorios (Día 30)

- [ ] **Uptime ≥ 99.5%**: Período completo 30 días.
- [ ] **Reporte mensual**: Tabla de métricas vs targets (PRD §3/§9).
- [ ] **Checkpoint día 30 documentado y firmado**: Junta decisoria.

---

## § 2. Cronograma Ejecutivo

| Evento | Día | Duración | Participantes | Entregable |
|--------|-----|----------|---------------|-----------|
| **Go-live** | 0 | — | Admin + Dev | Post-cutover playbook entra en vigencia |
| **Monitoreo activo** | 1–15 | — | Admin daily | Alertas UptimeRobot activas |
| **Checkpoint día 15** | 15 | 45 min | Admin, Dev (optional) | §5.1 completado y firmado |
| **Decisión post-15** | 15 | — | Admin | ¿WordPress read-only → off? |
| **Monitoreo activo** | 16–30 | — | Admin daily | Alertas continúan |
| **Checkpoint día 30** | 30 | 1 h | Admin, Dev | §5.2 completado, reporte final, decisiones |

---

## § 3. Métricas Clave (KPIs)

### Disponibilidad (UptimeRobot)

| Métrica | Target | Fórmula | Medición |
|---------|--------|---------|----------|
| **Uptime mensual** | ≥ 99.5% | (Time available − Downtime) / Time available × 100 | UptimeRobot CSV |
| **Máx downtime tolerado** | ≤ 3.6 h / mes | En 30 días × 24 h | Acumulado |
| **MTTR (Mean Time to Recover)** | ≤ 15 min | Tiempo desde alerta hasta 200 OK | Logs + UptimeRobot |

Endpoints monitoreados (cada 5 min):
- `GET https://insforge.rvlaboratorio.com/api/health` (InsForge backend).
- `GET https://rvlaboratorio.com/api/pdf/health` (LabSystem).

### Performance (desde logs del VPS)

| Métrica | Target | Origen | Método |
|---------|--------|--------|--------|
| **P95 búsqueda** | ≤ 300 ms | Logs apps/web | grep + awk percentil |
| **P95 PDF render** | ≤ 5 s | Logs `pdf_render_duration` | grep + awk percentil |
| **Error rate** | ≤ 0.1% | Logs nivel `error` | count / total × 100 |
| **Database slow queries** | < 5/día | Postgres logs | `pg_stat_statements` |

### Funcionalidad (Audit log)

| Métrica | Target | Origen | Observación |
|---------|--------|--------|-------------|
| **BCV scrapes exitosos** | 30/30 días | `audit_log` → `action='cron.scrape-bcv'` | Diario 13:00 UTC |
| **PDF renders sin error** | 100% | `audit_log` → `action='pdf_render'` | Monitoreado |
| **Operador actividad** | ≥ 10 sesiones/día | `audit_log` → `action='login'` | Indicador de uso |
| **BCV manual overrides** | ≤ 20% | `audit_log` → `action='bcv_override'` | Reducción vs WP |

### Data integrity (Post-migración)

| Métrica | Target | Verificación |
|---------|--------|--------------|
| **Pacientes migrados** | 204 | SELECT COUNT(*) FROM pacientes |
| **Resultados migrados** | 652 | SELECT COUNT(*) FROM resultados |
| **Presupuestos migrados** | 545 | SELECT COUNT(*) FROM presupuestos |
| **Exámenes migrados** | 250+ | SELECT COUNT(*) FROM examenes |

---

## § 4. Monitoreo Diario (Responsable: Admin)

### Daily standup (5 min)

Cada día hábil de 09:00–17:00 VET:

1. **UptimeRobot dashboard**: ¿hay downtime overnight?
   - Si sí → investigar logs (ver §6.3 troubleshooting).
   - Si no → verificar latencia p95 (¿< 500 ms?).

2. **Página Admin `/audit`**: 
   - Últimas 50 eventos del día.
   - ¿Hay errores recurrentes (e.g., `export_failed`, `login_error`)?

3. **BCV alerta**: ¿llegó email de BCV stale?
   - Si sí → revisar `tasa_cambio_bcv` en Postgres.
   - Si no → OK.

4. **Incidentes reportados**: ¿algún usuario reportó bug?
   - Si sí → crear issue en tracker, asignar prioridad.

### Notas

- No requiere acceso técnico avanzado (solo dashboard + email).
- Dev responde a issues P0/P1 con SLA ≤ 2h (durante horario laboral).

---

## § 5. Checkpoints

### § 5.1 Checkpoint Día 15 (Template)

**Fecha**: [completar]  
**Participantes**: [Admin + Dev names]  
**Duración**: 45 min  
**Hora de inicio**: [completar]

#### 5.1.1 Uptime (UptimeRobot)

- **Período**: Día 0 (cutover) a Día 15.
- **CSV exportado**: `uptime_d0_d15_<yyyymmdd>.csv` en `/tmp/` o documentación.
- **Uptime %**: [completar] %
  - Target: ≥ 99.5%
  - **Pasó?** [ ] Sí [ ] No
- **Downtime acumulado**: [completar] minutos.
- **Incidentes**: (listar cada > 5 min de downtime)
  - [timestamp] — [causa detectada] — [MTTR] min.
  - …
- **Acción si no pasó**: [completar]

#### 5.1.2 Datos Críticos: P0/P1 Abiertos

- **Tracker review**: ¿cero P0/P1 abiertos?
  - [ ] Sí → criterio de éxito logrado.
  - [ ] No → listar:
    - Issue [#123] — [descripción] — [asignado a] — [ETA fix].
    - …
- **Acción**: Si P0 abierto → escalada, plan de hotfix inmediato.

#### 5.1.3 Operación Diaria (Audit log)

**Consulta** (Admin solo):
```sql
SELECT 
  DATE(created_at) as day,
  COUNT(*) as events,
  COUNT(CASE WHEN action LIKE 'error%' THEN 1 END) as errors
FROM audit_log
WHERE created_at >= NOW() - INTERVAL '15 days'
GROUP BY DATE(created_at)
ORDER BY day DESC
LIMIT 15;
```

**Resultado**:
```
      day    | events | errors
-------------+--------+-------
 2026-09-04  |  245   |   3
 2026-09-03  |  198   |   1
 ...
```

- **Eventos totales (15d)**: [completar]
- **Error rate**: [completar] % (errors / events × 100)
  - Target: ≤ 0.1%
  - **Pasó?** [ ] Sí [ ] No
- **Usuarios activos**: [completar]
- **Observaciones**: [completar]

#### 5.1.4 PDF + Búsqueda

**PDF render (desde logs)**:
```bash
docker logs --since 15d <web-container> 2>&1 | \
  grep "pdf_render_duration" | \
  awk '{print $NF}' | sort -n | \
  awk '{a[NR]=$1} END {print "P95:", a[int(NR*0.95)]}'
```

- **P95 render time**: [completar] ms
  - Target: ≤ 5000 ms
  - **Pasó?** [ ] Sí [ ] No
- **Errores de render**: [completar]
- **PDFs generados (15d)**: [completar]

**Búsqueda (desde logs)**:
- **P95 search latency**: [completar] ms
  - Target: ≤ 300 ms
  - **Pasó?** [ ] Sí [ ] No

#### 5.1.5 BCV Automática

**Consulta**:
```sql
SELECT 
  DATE(fecha) as day,
  COUNT(*) as scrapes,
  COUNT(CASE WHEN fuente = 'bcv' THEN 1 END) as bcv_ok,
  COUNT(CASE WHEN fuente = 'dolartoday' THEN 1 END) as fallback
FROM tasa_cambio_bcv
WHERE fecha >= NOW() - INTERVAL '15 days'
GROUP BY DATE(fecha)
ORDER BY day DESC
LIMIT 15;
```

- **Scrapes exitosos**: [completar] / 15 días.
  - Target: 15/15 (100%)
  - **Pasó?** [ ] Sí [ ] No
- **Fallbacks a DolarAPI**: [completar]
- **BCV stale alerts**: [completar]
  - Si > 0 → revisar causa (bcv.org.ve down? cron no corrió?).

#### 5.1.6 Smoke Tests

**Ejecutar subset de Playwright** (del repo `apps/web/e2e/`):
```bash
cd apps/web
pnpm exec playwright test auth.spec.ts resultado.spec.ts
```

- **Tests pasados**: [completar] / [total]
  - [ ] Todos pasan.
  - [ ] Alguno falló → lista y remedia.

#### 5.1.7 Firma de Aprobación

**Admin (Rosa)**:  
Nombre: _________________ Firma: _________________ Fecha: _________

Declaro haber revisado los criterios anteriores y aprobar el estado operacional de LabSystem al Día 15 post-cutover.

**Dev (opcional)**:  
Nombre: _________________ Firma: _________________ Fecha: _________

---

### § 5.2 Checkpoint Día 30 (Template)

**Fecha**: [completar]  
**Participantes**: [Admin + Dev names]  
**Duración**: 1 h  
**Hora de inicio**: [completar]

#### 5.2.1 Uptime Mensual Completo (UptimeRobot)

- **Período**: Día 0 (cutover) a Día 30 (30 días completos).
- **CSV exportado**: `uptime_d0_d30_<yyyymmdd>.csv`.
- **Uptime %**: [completar] %
  - Target: ≥ 99.5%
  - **Pasó?** [ ] Sí [ ] No
- **Downtime acumulado**: [completar] minutos (máx permitido: 216 min ≈ 3.6 h).
- **Incidentes de downtime** (> 5 min):
  - [date time] — [duration] min — [cause] — [MTTR] — [fix applied].
  - …
- **Latencia p95 promedio (30d)**: [completar] ms.

#### 5.2.2 Reporte de Incidentes y Fixes

**Resumen (P0/P1/P2 cerrados)**:

| Issue | Severity | Reportado (día) | Resuelto (día) | MTTR | Causa | Fix |
|-------|----------|-----------------|---|------|-------|-----|
| #1 | P0 | Día 2 | Día 2 | 45 min | [causa] | [fix description] |
| … | … | … | … | … | … | … |

**Total P0/P1**: [completar] (target: 0, pero si > 0 → documentar todas).

#### 5.2.3 Operación Mensual (Audit log)

**Resumen agregado**:
```sql
SELECT 
  COUNT(*) as total_events,
  COUNT(CASE WHEN action LIKE 'error%' THEN 1 END) as errors,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(CASE WHEN action = 'cron.scrape-bcv' THEN 1 END) as bcv_scrapes,
  COUNT(CASE WHEN action = 'pdf_render' THEN 1 END) as pdfs_rendered
FROM audit_log
WHERE created_at >= NOW() - INTERVAL '30 days';
```

| Métrica | Valor |
|---------|-------|
| Total eventos | [completar] |
| Errores | [completar] |
| Error rate | [completar] % |
| Usuarios activos | [completar] |
| BCV scrapes (30) | [completar] |
| PDFs renderizados | [completar] |

#### 5.2.4 Performance (Logs 30 días)

**PDF Render**:
- P95 render time: [completar] ms (target: ≤ 5000 ms).
- Renders > 10s: [completar] (cause investigation si > 5).

**Búsqueda**:
- P95 latency: [completar] ms (target: ≤ 300 ms).
- Queries > 1000ms: [completar].

**Database**:
- Slow query count (> 1s): [completar] (target: < 50).
- Top 3 queries slow:
  - [query] — [avg time] ms — [recommendation].

#### 5.2.5 Data Integrity Post-Migración

Verificar que no hay pérdida de datos:

```sql
SELECT 
  (SELECT COUNT(*) FROM pacientes) as pacientes_actual,
  (SELECT COUNT(*) FROM resultados) as resultados_actual,
  (SELECT COUNT(*) FROM presupuestos) as presupuestos_actual,
  (SELECT COUNT(*) FROM examenes) as examenes_actual;
```

| Entidad | Target | Actual | ✓ |
|---------|--------|--------|---|
| Pacientes | 204 | [completar] | [ ] |
| Resultados | 652 | [completar] | [ ] |
| Presupuestos | 545 | [completar] | [ ] |
| Exámenes | 250+ | [completar] | [ ] |

#### 5.2.6 Comparativa vs PRD §3 (Success Metrics)

| Métrica | Target (PRD) | Actual (30d) | Status |
|---------|--------------|-------------|--------|
| Uptime mensual | 99.5% | [%] | [ ] Pass [ ] Fail |
| P95 búsqueda | ≤ 300 ms | [completar] ms | [ ] Pass [ ] Fail |
| P95 PDF render | ≤ 3 s (↓ a ≤ 5s post-cutover) | [completar] ms | [ ] Pass [ ] Fail |
| BCV manual override | ≤ 20% | [%] | [ ] Pass [ ] Fail |
| Exportaciones / mes | ≥ 4 | [completar] | [ ] Pass [ ] Fail |
| PDFs sin nombre | 0 | [completar] | [ ] Pass [ ] Fail |
| P0/P1 abiertos (día 15) | 0 | [completar] | [ ] Pass [ ] Fail |

#### 5.2.7 Decisiones Post-30d

**1. ¿Apagar WordPress en read-only?**
- [ ] Sí, LabSystem es 100% estable → apagar WP.
- [ ] No, mantener 30d más de backup en read-only (razón: [completar]).

**2. Escalabilidad y plan próximos 90 días**:
- Performance: ¿hay bottlenecks? → backlog.
  - [completar]
- Features: ¿qué pide el usuario?
  - [completar]
- Infraestructura: ¿crecer de VPS?
  - [completar]

**3. Operación sostenida**:
- [ ] Pasar a equipo de operación.
- [ ] Cambiar SLA de respuesta Dev (de ≤ 2h a otro).
- [ ] Revisión mensual automática (cron report a Admin).

#### 5.2.8 Firma de Cierre

**Admin (Rosa)**:  
Nombre: _________________ Firma: _________________ Fecha: _________

Declaro haber revisado el reporte de 30 días post-cutover y aprobar las métricas, decisiones e indicaciones de próximos pasos.

**Dev**:  
Nombre: _________________ Firma: _________________ Fecha: _________

---

## § 6. Procedures y Troubleshooting

### § 6.1 Exportar Métricas de UptimeRobot

1. Acceder a dashboard de UptimeRobot con credenciales.
2. Filtro: últimos 30 días.
3. Opción "Export" → CSV.
4. Guardar como `uptime_d0_d30_<yyyymmdd>.csv`.
5. Adjuntar a documentación final.

### § 6.2 Extraer Métricas de Logs (Script automatizado)

**Crear script** `scripts/extract-metrics.sh`:

```bash
#!/bin/bash
# Uso: extract-metrics.sh <days_back> <web_container>
DAYS=${1:-15}
CONTAINER=${2:-labsystem-web}
OUT_DIR="/tmp/metrics_$(date +%Y%m%d)"

mkdir -p "$OUT_DIR"

# P95 PDF render time
echo "=== PDF Render P95 (últimas ${DAYS}d) ===" | tee "$OUT_DIR/pdf_render.txt"
docker logs --since ${DAYS}d "$CONTAINER" 2>&1 | \
  grep "pdf_render_duration_ms" | \
  awk '{print $NF}' | sort -n | \
  awk "{a[NR]=\$1} END {print \"P95:\", a[int(NR*0.95)], \"ms\"}" | tee -a "$OUT_DIR/pdf_render.txt"

# Error rate
echo "=== Error Rate (últimas ${DAYS}d) ===" | tee "$OUT_DIR/errors.txt"
TOTAL=$(docker logs --since ${DAYS}d "$CONTAINER" 2>&1 | wc -l)
ERRORS=$(docker logs --since ${DAYS}d "$CONTAINER" 2>&1 | grep -i error | wc -l)
RATE=$(echo "scale=2; $ERRORS / $TOTAL * 100" | bc)
echo "Errors: $ERRORS / $TOTAL = $RATE %" | tee -a "$OUT_DIR/errors.txt"

echo "Métricas exportadas a: $OUT_DIR"
```

**Ejecutar**:
```bash
chmod +x scripts/extract-metrics.sh
./scripts/extract-metrics.sh 30 labsystem-web
```

### § 6.3 Investigar Downtime

Si UptimeRobot reporta downtime:

1. **Identificar hora exacta** del downtime (ej. 2026-09-05 14:32 UTC).

2. **SSH al VPS** y revisar logs:
   ```bash
   docker ps  # ¿contenedor web running?
   docker logs --since 10m labsystem-web 2>&1 | tail -100
   ```

3. **Revisar estado de Postgres**:
   ```bash
   docker compose exec postgres psql -U postgres -d insforge \
     -c "SELECT count(*) FROM pg_stat_activity;"
   docker logs --since 10m insforge-postgres 2>&1 | grep -i error
   ```

4. **Revisar Cloudflare status**:
   - ¿Origin es reachable desde afuera?
   - `curl -I https://insforge.rvlaboratorio.com` desde máquina local.

5. **Registrar causa** en reporte:
   - [ ] Aplicación crash → revisar logs de error.
   - [ ] Database timeout → revisar conexiones / queries slow.
   - [ ] Red/Cloudflare issue → revisar status page.
   - [ ] Desconocida → escalada a SRE.

---

## § 7. Comunicación con Stakeholders

### Comunicación Diaria (Si hay P0/P1)

**Template**: Email a Admin + Dev.

```
Asunto: ⚠️ Incidente LabSystem [Day X] — [Severity] [Description]

Descripción:
- Qué sucedió: [descripción].
- Impacto: [usuarios afectados / funciones caídas].
- Hora de detección: [timestamp UTC / VET].
- Estado actual: [investigando / en fix / resuelto].
- ETA resolución: [si aplica].

Acción requerida:
- [Dev]: Hotfix en rama, deploy < 30 min.
- [Admin]: Comunicar a usuarios si > 15 min downtime.

Próxima actualización: [timestamp].
```

### Reporte Semanal (Opcional durante Mes 1)

Si hay incidentes > 5 min o error rate > 0.5%, enviar reporte corto:

```
Semana del [dates]:
- Uptime: [%]
- Incidentes P0/P1: [count]
- Métricas vs target: [resumen].
- Acción: [completar].
```

### Reporte Final (Día 30)

Compartir §5.2 completado con todas las partes interesadas.

---

## § 8. Anexos

### Anexo A: SQL Queries útiles

**Audit log con filtros**:
```sql
SELECT 
  created_at,
  user_id,
  action,
  entity_type,
  entity_id,
  change_data
FROM audit_log
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND (action LIKE 'error%' OR action LIKE '%fail%')
ORDER BY created_at DESC
LIMIT 100;
```

**BCV scrape history**:
```sql
SELECT 
  fecha,
  fuente,
  tasa,
  created_at
FROM tasa_cambio_bcv
WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY fecha DESC;
```

**Actividad de operador (login + creación)**:
```sql
SELECT 
  DATE(created_at) as day,
  user_id,
  COUNT(*) as actions,
  COUNT(CASE WHEN action LIKE 'create_%' THEN 1 END) as creations
FROM audit_log
WHERE user_id IN (SELECT id FROM auth.users WHERE role = 'operador')
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), user_id
ORDER BY day DESC, user_id;
```

### Anexo B: Contactos de Escalada

| Rol | Nombre | Email | Teléfono |
|-----|--------|-------|----------|
| Admin | Rosa | rosa@rvlaboratorio.com | +58 XXX-XXXX |
| Dev Lead | [Dev name] | [email] | [phone] |
| VPS Provider | Contratista | [email] | [phone] |

---

**Documento creado**: 2026-08-25  
**Última revisión**: [por completar]  
**Próxima revisión mandatoria**: Día 15 post-cutover  
**Vigencia**: Mes 1 post-cutover (extensible a Mes 2 si es necesario)
