# Guía Operativa: Checkpoints Día 15 y Día 30

> Instrucciones paso-a-paso para Admin (Rosa) sobre cómo ejecutar los checkpoints post-cutover.

---

## 📋 Antes de Comenzar

### Preparar tu entorno

```bash
# 1. Asegurar acceso al VPS
ssh user@vps-ip

# 2. Verificar que Docker está corriendo
docker compose ps  # Debe ver los 4 servicios healthy

# 3. Tener a mano:
# - Credenciales UptimeRobot
# - Acceso al dashboard InsForge
# - Acceso a la página /audit en LabSystem
```

### Materiales necesarios

- **Documento**: `docs/migration/POST-CUTOVER-METRICS.md` (este archivo tiene los templates)
- **Acceso a**: UptimeRobot dashboard, página `/audit`, dashboard InsForge
- **Tiempo**: ~45 min (día 15) o ~1 hora (día 30)

---

## 🚀 Checkpoint Día 15

**Fecha objetivo**: Exactamente 15 días después de cutover  
**Participantes**: Admin (Rosa), Dev (respaldo, opcional)

### Paso 1: Exportar uptime desde UptimeRobot (10 min)

1. Acceder a https://uptimerobot.com/dashboard
2. Seleccionar los dos monitors:
   - `GET https://insforge.rvlaboratorio.com/api/health`
   - `GET https://rvlaboratorio.com/api/pdf/health`
3. Ir a **Reports** → seleccionar período Día 0 a Día 15
4. Hacer click **Export to CSV**
5. Guardar como `uptime_d0_d15_<yyyymmdd>.csv`
6. Abrir el CSV y copiar el **Uptime %** a la sección 5.1.1 del documento

### Paso 2: Revisar P0/P1 abiertos (5 min)

Ir a tu tracker de issues (Notion/Linear/Plane):
- Filtrar issues con prioridad **P0** o **P1**
- ¿Hay alguno abierto? → documentar en sección 5.1.2
- Éxito esperado: **Cero abiertos**

### Paso 3: Revisar actividad en Audit Log (10 min)

Acceder a `https://rvlaboratorio.com/audit` como Admin:

1. **Conteo de eventos**: 
   - Filtro: últimos 15 días
   - Nota el número total de eventos
   - Copiar a sección 5.1.3

2. **Errores**: Usar el filtro de acción para ver si hay `error_*` eventos
   - Si hay muchos, revisar cuáles son
   - Calcular: `error_count / total_events * 100` = error rate (%)

3. **Usuarios activos**: ¿Cuántos usuarios diferentes hicieron login?
   - Nota el número

### Paso 4: PDF Render Performance (5 min)

En el VPS:
```bash
ssh user@vps-ip

# Extraer P95 de PDF render (últimas 15d)
docker logs --since 15d labsystem-web 2>&1 | \
  grep "pdf_render_duration" | \
  awk '{print $NF}' | sort -n | \
  awk '{a[NR]=$1} END {print "P95:", a[int(NR*0.95)], "ms"}'

# Copiar el valor a sección 5.1.4
```

### Paso 5: BCV Automática (5 min)

Acceder al dashboard InsForge → **Postgres** tab:
```sql
SELECT 
  DATE(fecha) as day,
  COUNT(*) as scrapes,
  COUNT(CASE WHEN fuente = 'bcv' THEN 1 END) as bcv_ok
FROM tasa_cambio_bcv
WHERE fecha >= NOW() - INTERVAL '15 days'
GROUP BY DATE(fecha)
ORDER BY day;
```

- Copiar resultado a sección 5.1.5
- ¿15 días = 15 scrapes exitosos? → Éxito

### Paso 6: Smoke Tests (5 min)

Ejecutar subset rápido de Playwright:
```bash
cd apps/web
pnpm exec playwright test auth.spec.ts resultado.spec.ts
```

- Documentar si pasaron todos
- Si falló algo, notar qué

### Paso 7: Firma de Aprobación

En el documento `POST-CUTOVER-METRICS.md`, sección 5.1.7:
- Escribir tu nombre, fecha, hora
- Firma digital o física
- Enviar a Dev para archivos

**Email a Dev**:
```
Asunto: ✅ Checkpoint Día 15 — LabSystem Post-Cutover

Adjunto: POST-CUTOVER-METRICS.md (sección 5.1 completada)

Resumen:
- Uptime: [%]
- P0/P1 abiertos: [count]
- P95 PDF render: [ms]
- Estado general: [OK / Ojo en X]
```

---

## 🎯 Checkpoint Día 30

**Fecha objetivo**: Exactamente 30 días después de cutover  
**Participantes**: Admin (Rosa), Dev

### Resumen de pasos (más exhaustivo)

| Sección | Tiempo | Qué hacer |
|---------|--------|-----------|
| 5.2.1 | 15 min | Exportar UptimeRobot (período completo 30d), calcular uptime % |
| 5.2.2 | 15 min | Revisar tracker: listar TODOS los P0/P1 encontrados en el mes |
| 5.2.3 | 10 min | Query SQL agregada del audit_log (30 días) |
| 5.2.4 | 10 min | Extraer P95 PDF render y P95 búsqueda desde logs (30d) |
| 5.2.5 | 5 min | Verificar counts de datos (pacientes, resultados, etc.) |
| 5.2.6 | 10 min | Tabla comparativa: métricas vs targets del PRD |
| 5.2.7 | 10 min | Decisiones: ¿apagar WordPress? ¿plan próximos 90d? |
| 5.2.8 | 5 min | Firma final |

### Paso detallado: Reporte de Incidentes (5.2.2)

Buscar todos los issues P0/P1 abiertos en el tracker durante los 30 días:

Para cada uno, documentar:
- Fecha reportada
- Fecha resuelto
- Duración (MTTR = Mean Time To Recover)
- Causa raíz detectada
- Fix aplicado

**Ejemplo**:
```
| Issue | Severity | Reportado | Resuelto | MTTR  | Causa | Fix |
|-------|----------|-----------|---------|-------|-------|-----|
| #42   | P1       | Día 3     | Día 3   | 2h    | DB timeout | Aumentar conexiones postgres |
```

### Paso detallado: Decisiones Post-30d (5.2.7)

Tres decisiones importantes:

**1. ¿Apagar WordPress en read-only?**
- Si uptime ≥ 99.5% y cero P0 → ✅ apagar WP
- Si hay dudas → mantener 30d más como backup
- Documentar razón

**2. Escalabilidad en próximos 90d**
- ¿Hay bottlenecks detectados?
- ¿Performance degrada en horarios pico?
- ¿Necesita más VPS? ¿Más CPU? ¿Más RAM?

**3. Transición a operación sostenida**
- ¿Pasar ownership a equipo de operación?
- ¿Cambiar SLA de respuesta Dev (de ≤ 2h a 4h)?
- ¿Revisar mensualmente o semanalmente?

### Paso final: Comunicación

Email a stakeholders (Admin, Dev, posiblemente CEO/Board):

```
Asunto: 📊 Reporte Post-Cutover 30 días — LabSystem

Queridos,

Se adjunta el reporte completo del primer mes de operación de LabSystem
post-migración de WordPress → self-hosted.

**Highlights**:
- Uptime: [%] (target: 99.5%)
- P0/P1 encontrados: [count] (éxito: 0)
- PDFs generados: [count]
- Usuarios activos: [count]

**Decisiones**:
- WordPress en read-only: ✅ apagar / ⚠️ mantener
- Próximos hitos: [describir]

Gracias,
[Admin name]
```

---

## 🔧 Troubleshooting Rápido

### P: "No puedo acceder a la página /audit"
**R**: 
1. Verificar que iniciaste sesión como Admin
2. Verificar que tu usuario tiene rol `admin` en la BD
3. SSH al VPS y revisar logs: `docker logs labsystem-web 2>&1 | grep audit`

### P: "Docker logs | grep no me muestra nada"
**R**:
1. Verificar container name correcto: `docker compose ps`
2. Probar: `docker logs --since 30d <container-name> 2>&1 | head -50`
3. Si aún no hay logs, revisar que el código está loguando (buscar `pdf_render_duration` en `apps/web`)

### P: "UptimeRobot no tiene datos"
**R**:
1. ¿Los monitors están agregados? Revisar página de "Monitors"
2. ¿Están habilitados? Esperar 5 minutos para primer check
3. ¿DNS resolving? Probar: `curl -I https://insforge.rvlaboratorio.com`

### P: "No hay eventos en audit log"
**R**:
1. Verificar que hay usuarios activos (¿alguien ingresó al sistema?)
2. Revisar que el Postgres está vivo: `docker compose ps postgres` (must show "healthy")
3. Revisar logs Postgres: `docker logs postgres 2>&1 | tail -20`

---

## 📞 Escaladas

Si encuentras algo raro o bloqueante:

| Problema | Quién contactar | Urgencia |
|----------|-----------------|----------|
| Uptime < 99% por prolongado | Dev Lead | P0 |
| PDF render > 10s consistentemente | Dev Lead | P1 |
| Base de datos lenta (queries > 1s) | VPS Provider + Dev | P1 |
| BCV no está scrapeando | Dev (cron issues) | P2 |
| Admin `/audit` page caída | Dev (web app issue) | P0 |

---

**Última actualización**: 2026-08-25  
**Próxima revisión**: Post-checkpoint día 15 (feedback loop)  
**Vigencia**: Mes 1 post-cutover (válido para checkpoints)
