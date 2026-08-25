# Monitoreo Uptime y Alertas Post-Cutover

> Configuración de monitoreo externo, alertas y dashboard operativo para LabSystem post-migración de Convex → InsForge.
>
> **Target de éxito**: Uptime 99.5% mensual, cero P0/P1 abiertos al día 15 post-cutover (PRD §9).

---

## ⚠️ CHECKLIST DE ACTIVACIÓN (Antes del Go-Live)

**Responsable**: Admin + Dev Lead  
**Plazo**: Día anterior a go-live  
**Duración estimada**: 1 hora

### Setup Pre-Cutover

- [ ] **UptimeRobot Account**: Crear cuenta (o usar existente) en https://uptimerobot.com/
- [ ] **Endpoints en UptimeRobot**:
  - [ ] `GET https://insforge.rvlaboratorio.com/api/health` (InsForge backend)
  - [ ] `GET https://rvlaboratorio.com/api/pdf/health` (LabSystem PDF health)
  - [ ] Frecuencia: 5 minutos, alertas email a `plataformas.condor@gmail.com`
- [ ] **VPS Crontab configurado** (ejecutar en el VPS):
  ```bash
  ssh user@vps-ip
  crontab -e
  # Agregar (ver §2 y §3 para líneas exactas):
  # - Cleanup exportaciones (domingo 03:00 UTC)
  # - Scrape BCV (diario 13:00 UTC)
  # - Check BCV stale (diario 18:00 UTC)
  crontab -l | grep -E "cleanup|scrape|stale"  # Verificar después
  ```
- [ ] **Credentials**: Guardar en password manager (1Password, Bitwarden):
  - UptimeRobot API key
  - InsForge ROOT_ADMIN_USERNAME / ROOT_ADMIN_PASSWORD
  - VPS SSH key
  - CRON_SECRET
- [ ] **Backups diarios**: Cron del VPS con `pg_dump` a almacenamiento externo
- [ ] **Página Admin `/audit` accesible**: Verificar login en `https://rvlaboratorio.com/audit`
- [ ] **Dashboard InsForge accesible**: Admin accede a `https://insforge.rvlaboratorio.com/dashboard`

**Verificación final** (desde máquina local):
```bash
curl -I https://rvlaboratorio.com/api/pdf/health           # 200 OK esperado
curl -I https://insforge.rvlaboratorio.com/api/health      # 200 OK esperado
```

✅ Si todo pasa → Go-live autorizado.

---

## 1. Monitoreo Externo de Uptime

### UptimeRobot o equivalente

Se utiliza un servicio externo de monitoreo para verificar disponibilidad de los endpoints críticos.

#### Endpoints monitoreados

| Endpoint | Servicio | Método | Frecuencia | SLA |
|----------|----------|--------|-----------|-----|
| `GET https://insforge.rvlaboratorio.com/api/health` | InsForge backend | GET | 5 min | ≥ 200 ms |
| `GET https://rvlaboratorio.com/api/pdf/health` | LabSystem / PDF Route Handler | GET | 5 min | ≥ 200 ms |

**Nota**: El endpoint `/api/pdf/health` es público (no requiere autenticación). InsForge tiene su propio health check en `/api/health`.

#### Configuración de alertas

- **Thresholds**:
  - Downtime consecutivo ≥ 5 minutos → alerta inmediata.
  - Uptime mensual < 99.5% → reportar en checkpoint.
  - Latencia p95 > 3 s → warning (no crítica, pero loguear para análisis).

- **Canales de alerta**:
  - Email: `plataformas.condor@gmail.com` (Admin).
  - (Opcional) Webhook a Slack o Discord para alerts en tiempo real.

### Cálculo de uptime mensual

**Fórmula**: `Uptime% = (Time Available - Downtime) / Time Available * 100`

- **Meta 99.5%** = máximo **3.6 horas** de downtime en 30 días.
- Dashboard de UptimeRobot genera reporte automático; exportar CSV mensual para documentación.

---

## 2. Alertas de Estado de Datos (BCV Stale)

Cubierto por **F3.3.T4**: El endpoint `GET /api/config` retorna `bcv_stale_alert: boolean`. 

Condición: Si la tasa BCV en `tasa_cambio_bcv` tiene `fecha < hoy − 2 días`, se marca como stale y la API responde con flag de alerta.

- **Alerta**: Cron diario de verificación que:
  - Consulta `GET https://insforge.rvlaboratorio.com/api/config`
  - Si `bcv_stale_alert: true` → envía email a Admin.
  - Fila de auditoría: `action: 'alert.bcv_stale'`.

**Implementación en el VPS**:
```bash
# Verificar BCV stale cada 24h a las 14:00 VET (18:00 UTC)
0 18 * * * curl -s https://insforge.rvlaboratorio.com/api/config \
  | grep -q '"bcv_stale_alert":true' && \
  curl -X POST https://localhost:8025/send \
  -d '{"to":"admin@rv.lab","subject":"⚠️ Tasa BCV desactualizada"}' \
  2>/dev/null || true
```

---

## 3. Métricas y Dashboard Operativo

### Origen de datos

#### 3.1 Logs del contenedor (`docker logs` / pm2)

**Lugar**: VPS, logs del servicio `apps/web` (Node.js / PM2 o Docker).

**Métricas extraídas**:
- Logs de nivel `info` / `error` con timestamps.
- Request/response time en cada operación.
- PDF render duration (`@react-pdf` logs).

**Script de análisis** (ejecutar manualmente o vía cron):
```bash
# Última 1h de logs
docker logs --since 1h --timestamps <web-container> 2>&1 | \
  grep "pdf_health_ok\|render\|error" | \
  awk '{print $1, $NF}' > /tmp/metrics_$(date +%Y%m%d_%H%M%S).txt

# P95 de render time: extraer duración y calcular percentil
grep "pdf_render_duration" /tmp/metrics_*.txt | \
  awk '{print $NF}' | sort -n | \
  awk '{a[NR]=$1} END {print a[int(NR*0.95)]}'
```

#### 3.2 InsForge Dashboard

URL: `https://insforge.rvlaboratorio.com/dashboard`

Acceder como Admin para revisar:
- **Conexión Postgres**: Health y vacío de conexiones.
- **Storage**: Uso de buckets `assets` y `exports`.
- **Auth**: Últimas sesiones y fallidos de login.
- **Logs**: Tab de diagnostics con eventos del backend.

#### 3.3 Página Admin `/audit`

Implementada en **F4.1.T6**: Dashboard interno en `apps/web/app/(app)/audit/page.tsx`.

Funcionalidades:
- Tabla de últimos 100 eventos del `audit_log`.
- Filtros por usuario, acción (`create_patient`, `pdf_render`, etc.), entity, fecha.
- Paginación de 25 / 50 / 100 registros.

**Acceso**: Admin only (verificado en middleware).

---

## 4. KPIs del Primer Mes

### Metricás de éxito (PRD §3 + §9)

| KPI | Target | Dónde medir | Responsable |
|-----|--------|-----------|-------------|
| **Uptime** | ≥ 99.5% | UptimeRobot | Infra |
| **P95 búsqueda** | ≤ 300 ms | Logs + herramientas de perf | Dev |
| **P95 PDF render** | ≤ 3–5 s (reducción de ARCH §9) | Logs apps/web | Dev |
| **Tasa BCV automática** | ≤ 20% manual override | Audit log (`action: 'bcv_override'`) | Operador |
| **Cero P0/P1** | Cero | Tracker / Notion | Admin |
| **Cero PDF sin nombre** | Cero | Auditoría manual + logs | Operador |

### Fuentes de datos

1. **UptimeRobot**: export CSV mensual.
2. **Logs VPS**: docker logs + grep / awk.
3. **Audit log** (Postgres): queries SQL o página Admin `/audit`.
4. **Tracker**: issues abiertos/cerrados en Notion/Linear/Plane.

---

## 5. Procedimiento de Checkpoint

### Día 15 post-cutover

**Participantes**: Admin (Rosa), Dev (respaldo).

**Duración**: 30–45 min.

**Checklist**:
- [ ] UptimeRobot: uptime % entre hoy−15 y hoy (¿≥ 99.5%?).
- [ ] Logs: revisar últimas 15d en InsForge dashboard → 0 errores críticos.
- [ ] `/audit` page: revisar actividad operador (búsquedas, creaciones) → patrones normales.
- [ ] BCV: últimas 15 scrapes exitosos? Cero alertas de stale.
- [ ] P0/P1: ¿cero issues bloqueantes abiertos? → criterio de éxito.
- [ ] PDF: verificar 3–5 PDFs aleatoriamente → encabezado correcto, render OK.

**Resultado**: 
- Documento `POST-CUTOVER-METRICS.md` §5.1 (checkpoint día 15) firmado por Admin.
- Si hay desviaciones: crear issues y replantear plan si es necesario.

### Día 30 post-cutover

**Participantes**: Admin (Rosa), Dev (respaldo).

**Duración**: 1 hora.

**Checklist** (igual al día 15, pero período de 30d):
- [ ] UptimeRobot: uptime % entre T0 (cutover) y hoy (¿≥ 99.5%?).
- [ ] Logs: revisar 30d completos → resumen de errores / warnings.
- [ ] `/audit` page: actividad operador mensual → patrones, usuarios activos.
- [ ] BCV: 30 scrapes diarios, todos exitosos.
- [ ] PDF: P95 render time ≤ 5s.
- [ ] Métricas vs targets (PRD §3): tabla comparativa.
- [ ] Decisión post-30d: ¿supr WordPress en read-only? ¿Plan de escalabilidad?

**Resultado**:
- Documento `POST-CUTOVER-METRICS.md` §5.2 (checkpoint día 30) con reporte completo.
- Archivo de métricas CSV exportado a storage.
- Junta con Admin para decisiones operacionales.

---

## 6. Rollout de Cambios Post-Cutover

Si durante los checkpoints se encuentran bugs o mejoras menores:

1. **P0/P1** (bloquea operación): Fix inmediato en rama hotfix, cherry-pick a prod.
   - Ejemplo: "PDFs sin nombre" → fix en `apps/web/app/api/pdf/route.ts`, deploy en 2h.

2. **P2** (incómodo pero operativo): Stack en backlog, incluir en siguiente release (semanal/quincenal).
   - Ejemplo: "Búsqueda lenta por municipio" → optimizar índice Postgres, backlog.

3. **P3** (cosmético): Backlog de mejoras continuas.

---

## 7. Handoff y Operación Sostenida

Al cierre del primer mes:

1. **Admin Rosa** toma ownership de:
   - Verificación semanal de uptime (dashboard UptimeRobot).
   - Revisión visual mensual de `/audit` page.
   - Reporte de BCV stale si ocurre.

2. **Dev** se retira a modo on-call para:
   - Fixes P0/P1 (< 2h response time).
   - Investigación de anomalías (si Admin reporta).

3. **Documentación viva**:
   - Este documento (`monitoreo.md`) es la fuente de verdad.
   - Actualizar semanal si hay cambios de alertas / thresholds.
   - Revisar anualmente o cuando se cambien servicios (UptimeRobot → alternativa, etc.).

---

## Apéndice A: Credenciales y Accesos

| Servicio | Credencial | Almacenamiento |
|----------|------------|-----------------|
| UptimeRobot | Email + API key | Password manager (1Password / Bitwarden) |
| InsForge Admin | `ROOT_ADMIN_USERNAME` / `ROOT_ADMIN_PASSWORD` | Password manager |
| VPS SSH | Key + username | Password manager / GitHub secrets |
| CRON_SECRET | Token para `/api/cron/*` | `.env` VPS (no versionado) |

---

## Apéndice B: Troubleshooting

### P: Uptime baja de repente (≤ 98%)

1. Revisar UptimeRobot para hora exacta de downtime.
2. SSH al VPS → `docker ps` (¿contenedor caído?).
3. `docker logs <web-container>` → errores de conexión Postgres?
4. `curl https://insforge.rvlaboratorio.com/api/health` → ¿InsForge vivo?
5. Si el issue persiste > 5 min → escalada a infra / VPS provider.

### P: BCV stale por > 2 días

1. Revisar `docker logs` del contenedor web → ¿POST /api/cron/scrape-bcv?
2. `curl -X POST https://insforge.rvlaboratorio.com/api/cron/scrape-bcv -H "x-cron-secret: ..."` → test manual.
3. Revisar crontab del VPS: `crontab -l | grep scrape-bcv`.
4. Si bcv.org.ve está down → usar fallback DolarAPI (ya está wired).
5. Alerta a Admin: "Tasa manual por 2d máximo, luego se reactiva automático".

### P: PDF render time > 5s

1. Revisar `docker logs | grep "pdf_render_duration"`.
2. ¿Es el primer render del día (cold start)? → normal, próximos más rápidos.
3. ¿PDF tiene muchas páginas / imágenes? → optimizar snapshot o lazy-load.
4. ¿Postgres lento? → revisar conexiones: `docker compose exec postgres psql -U postgres -d insforge -c "SELECT count(*) FROM pg_stat_activity;"`
5. Si persiste → considerar cacheo de PDF o separar el render a task async (backlog).

---

**Última actualización**: 2026-08-25
**Próxima revisión**: 2026-09-25 (post-30d checkpoint)
