# Post-Cutover Playbook — LabSystem RV Laboratorio

> **Versión**: 1.0  
> **Fecha**: 2026-08-24  
> **Scope**: Plan de rollback + procedimientos operativos post-cutover  
> **Ref**: PRD §8 rollback, ADR-11 (backups = pg_dump estándar), F4.2.T4

---

## Tabla de contenidos

1. [WP en modo read-only (backup 30d)](#1-wp-en-modo-read-only-backup-30d)
2. [Procedimiento de emergencia: bug bloqueante en LabSystem](#2-procedimiento-de-emergencia-bug-bloqueante-en-labsystem)
3. [Procedimiento de rollback completo](#3-procedimiento-de-rollback-completo)
4. [Backups periódicos pg_dump + XLSX mensual](#4-backups-periódicos-pg_dump--xlsx-mensual)
5. [Ensayo de rollback en preview](#5-ensayo-de-rollback-en-preview)
6. [Árbol de decisión: ¿cuándo activar qué?](#6-árbol-de-decisión-cuándo-activar-qué)
7. [Contactos y escalación](#7-contactos-y-escalación)

---

## 1. WP en modo read-only (backup 30d)

### Qué es y para qué sirve

Inmediatamente después del cutover exitoso, el plugin WP (WordPress con plugin de gestión del laboratorio) se deja activo pero en **modo lectura**. Los usuarios pueden consultar datos históricos pero NO pueden ingresar datos nuevos. Esto sirve como:

- **Red de seguridad humana**: el personal sabe que los datos históricos siguen consultables.
- **Backup de referencia**: en caso de detectar discrepancias post-migración, se puede comparar contra la fuente original.
- **Período de transición**: 30 días calendario desde la fecha de cutover.

### Cómo se configura el read-only en WP

```bash
# Desde el servidor WP (SSH)
# Activar el modo mantenimiento/read-only del plugin del laboratorio:
# Opción A: banner via wp-config.php (si el plugin lo soporta)
wp config set LAB_READONLY true --path=/var/www/html/wordpress

# Opción B: plugin de mantenimiento (WP Maintenance Mode o similar)
wp plugin activate maintenance-mode --path=/var/www/html/wordpress

# Verificar que el banner esté visible:
curl -s https://wp.rvlaboratorio.com | grep -i "solo consulta"
```

El banner debe mostrar:
> "Sistema en modo solo lectura. Los datos históricos están disponibles para consulta. Para operaciones nuevas, acceder a LabSystem: https://lab.rvlaboratorio.com"

### Cuándo se desactiva

- **Fecha límite**: D+30 (30 días calendario desde el cutover).
- **Quién autoriza**: Admin (Rosa) + Tech Lead.
- **Acción al vencer**: quitar el plugin de mantenimiento y apagar el servidor WP (o suspender el hosting).

### Durante los 30 días

| Semana | Acción |
|--------|--------|
| D+0 | Banner read-only activo, comunicación al equipo |
| D+7 | Verificar que nadie intentó ingresar datos en WP (revisar logs) |
| D+15 | Checkpoint: ¿hubo necesidad de consultar WP? Documentar casos |
| D+28 | Aviso final al equipo: "WP se apaga en 2 días" |
| D+30 | Apagar WP. Backup MySQL final archivado en almacenamiento frío |

---

## 2. Procedimiento de emergencia: bug bloqueante en LabSystem

### Clasificación de severidad

| Nivel | Criterio | Acción |
|-------|----------|--------|
| **P0** | El sistema completo no arranca o se cae constantemente | Activar rollback (ver §3) |
| **P1** | Funcionalidad crítica rota (no se pueden crear resultados, no se puede imprimir PDF, login no funciona) | Hotfix < 2h; si no resuelve → rollback |
| **P2** | Funcionalidad degradada pero operable (bug en exportación, cálculo incorrecto en presupuesto) | Hotfix en < 24h; WP como consulta de respaldo |
| **P3** | Cosmético o mejora menor | Backlog normal |

### Criterio de activación de reactivación WP

Activar WP para operar (no solo consultar) si:
1. Bug es P0 o P1 confirmado.
2. Hotfix no está listo en **2 horas** de trabajo activo.
3. Admin (Rosa) autoriza explícitamente.

### Pasos para reactivar WP operativo

```bash
# Paso 1: Quitar el modo read-only (banner desactivado)
wp plugin deactivate maintenance-mode --path=/var/www/html/wordpress
wp config delete LAB_READONLY --path=/var/www/html/wordpress

# Paso 2: Verificar que WP está operable
curl -s https://wp.rvlaboratorio.com/wp-admin/ | grep -i "Dashboard"

# Paso 3: Comunicar al equipo
# (ver template en §7 — email de reactivación WP)
```

### Qué hacer con los datos ingresados en WP durante la emergencia

Si se ingresaron datos en WP mientras LabSystem estaba caído, esos datos **no están en Postgres**. Al resolverse el bug en LabSystem:

1. Exportar los registros nuevos de WP (ver §3.3).
2. Importarlos manualmente a LabSystem via herramienta de migración o UI.
3. Documentar cada registro importado en el `audit_log`.
4. Volver a poner WP en read-only.

> **Importante**: llevar registro de cuánto tiempo estuvo WP operativo para la auditoría. Máximo aceptable: 48h acumuladas dentro de los 30d.

---

## 3. Procedimiento de rollback completo

> Activar solo si P0 no se resuelve en 2h o si se detecta corrupción de datos post-migración.

### Pre-condiciones necesarias

- [ ] Backup MySQL prod (dump T0) creado antes del cutover — en `/backups/mysql/wp_prod_<fecha_cutover>.sql.gz`
- [ ] Snapshot `pg_dump` pre-migración — en `/backups/postgres/pre_migration_<timestamp>.sql.gz`
- [ ] `.env` del stack InsForge respaldado — en almacenamiento seguro (no en git)

### 3.1 Rollback rápido: restaurar Postgres al estado pre-migración

Usar si la migración terminó pero los datos están corruptos y **no hubo actividad real de usuarios en LabSystem**.

```bash
# En el VPS, SSH como usuario deploy
cd ~/insforge

# Paso 1: Parar la app web (Next.js) para evitar escrituras durante restore
docker compose stop  # o: pm2 stop labsystem

# Paso 2: Restaurar snapshot pre-migración
BACKUP_FILE="/backups/postgres/pre_migration_<timestamp>.sql.gz"
gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U postgres -d insforge

# Paso 3: Verificar restore
docker compose exec postgres psql -U postgres -d insforge -c "SELECT COUNT(*) FROM paciente;"
# → debe dar 0 (estado pre-migración, sin datos migrados)

# Paso 4: Levantar app de nuevo
docker compose start
# o: pm2 start labsystem

# Paso 5: Reactivar WP operativo (ver §2)
```

**Tiempo estimado**: 15-30 minutos.

### 3.2 Rollback tardío: hay actividad en LabSystem que no queremos perder

Si los usuarios ya operaron en LabSystem post-cutover y hay datos nuevos que preservar:

```bash
# Paso 1: Exportar datos post-cutover de Postgres a CSV
# (ejecutar desde la máquina con acceso a DATABASE_URL via túnel SSH)
PGPASSWORD="$DB_PASSWORD" psql "$DATABASE_URL" -c "\COPY paciente TO '/tmp/export_paciente.csv' WITH CSV HEADER"
PGPASSWORD="$DB_PASSWORD" psql "$DATABASE_URL" -c "\COPY resultado TO '/tmp/export_resultado.csv' WITH CSV HEADER"
PGPASSWORD="$DB_PASSWORD" psql "$DATABASE_URL" -c "\COPY presupuesto TO '/tmp/export_presupuesto.csv' WITH CSV HEADER"
PGPASSWORD="$DB_PASSWORD" psql "$DATABASE_URL" -c "\COPY examen_resultado TO '/tmp/export_examen_resultado.csv' WITH CSV HEADER"

# Paso 2: Descargar CSVs al local
scp deploy@vps:/tmp/export_*.csv ./rollback_exports/

# Paso 3: Restaurar Postgres al snapshot pre-migración (ver §3.1)

# Paso 4: Re-importar los datos post-cutover al WP
# → Este proceso es MANUAL y requiere la herramienta migrate-wp en reversa
# → Ver §3.3 para el procedimiento detallado de re-import a WP
```

### 3.3 Re-import de datos post-cutover a WP

> Solo aplica si se decide rollback completo y hay datos nuevos en LabSystem que deben pasarse de vuelta a WP.

Este proceso es manual y tedioso. Evaluar cuidadosamente si vale la pena vs. mantener LabSystem con hotfix.

```bash
# Los CSVs exportados en §3.2 tienen este formato (ejemplo paciente.csv):
# id, cedula, nombre, apellido, fecha_nacimiento, created_at, ...

# Opción A: Import manual via WP Admin
# 1. Instalar WP All Import (plugin)
# 2. Subir el CSV
# 3. Mapear columnas
# 4. Ejecutar import
# 5. Verificar conteo en WP Admin

# Opción B: Script PHP directo (para volúmenes grandes)
# Preparar script en scripts/rollback/import-to-wp.php
# Ejecutar: wp eval-file scripts/rollback/import-to-wp.php --path=/var/www/html/wordpress
```

**Solo los datos CREADOS después del cutover** (verificar `created_at > fecha_cutover`) necesitan re-importarse. Los datos migrados originalmente ya están en el backup MySQL T0.

### 3.4 Checklist de rollback completo

```
[ ] Bug P0 confirmado y tiempo de hotfix > 2h
[ ] Admin (Rosa) autorizó rollback
[ ] Backup T0 localizado y verificado (checksum)
[ ] App web detenida (evitar escrituras durante restore)
[ ] CSVs de datos post-cutover exportados y descargados
[ ] Postgres restaurado al snapshot pre-migración
[ ] Conteos verificados post-restore
[ ] WP reactivado como operativo
[ ] Equipo notificado (template en §7)
[ ] Datos post-cutover re-importados a WP (si aplica)
[ ] Ticket de post-mortem creado en el tracker
[ ] Fecha de nuevo cutover estimada
```

---

## 4. Backups periódicos pg_dump + XLSX mensual

### 4.1 Cron diario de pg_dump (retención 7 días)

Agregar al crontab del VPS (usuario `deploy` o `root` que corre Docker):

```bash
crontab -e
```

Agregar esta línea:

```cron
# Backup diario Postgres — 03:00 VET (07:00 UTC), retención 7 días
0 7 * * * /home/deploy/scripts/backup-postgres.sh >> /var/log/backup-postgres.log 2>&1
```

Script `/home/deploy/scripts/backup-postgres.sh`:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups/postgres/daily"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/insforge_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump y compresión en un pipe (sin archivo intermedio sin comprimir)
cd ~/insforge
docker compose exec -T postgres \
  pg_dump -U postgres insforge \
  | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup creado: $BACKUP_FILE ($(du -sh $BACKUP_FILE | cut -f1))"

# Limpiar backups con más de 7 días
find "$BACKUP_DIR" -name "insforge_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Limpieza completada. Backups actuales:"
ls -lh "$BACKUP_DIR"
```

```bash
chmod +x /home/deploy/scripts/backup-postgres.sh
```

### 4.2 Verificar que el cron está activo

```bash
# Ver el crontab activo
crontab -l | grep backup-postgres

# Forzar ejecución manual para verificar
/home/deploy/scripts/backup-postgres.sh

# Ver el log
tail -20 /var/log/backup-postgres.log
```

### 4.3 Prueba de restore (obligatoria post-configuración)

```bash
# Seleccionar el backup más reciente
LATEST=$(ls -t /backups/postgres/daily/insforge_*.sql.gz | head -1)

# Restore en base de datos de prueba (NO en producción)
docker compose exec -T postgres \
  psql -U postgres -c "CREATE DATABASE insforge_test;"

gunzip -c "$LATEST" | docker compose exec -T postgres \
  psql -U postgres -d insforge_test

# Verificar conteos básicos
docker compose exec postgres psql -U postgres -d insforge_test -c "
  SELECT
    (SELECT COUNT(*) FROM paciente) AS pacientes,
    (SELECT COUNT(*) FROM resultado) AS resultados,
    (SELECT COUNT(*) FROM presupuesto) AS presupuestos;
"

# Limpiar base de prueba
docker compose exec postgres psql -U postgres -c "DROP DATABASE insforge_test;"

echo "Restore de prueba exitoso."
```

### 4.4 Export XLSX mensual

El export XLSX mensual se genera a través de la funcionalidad de exportación de LabSystem y se archiva manualmente.

```bash
# Agregar al crontab (primer día de cada mes a las 08:00 VET = 12:00 UTC)
0 12 1 * * curl -X POST https://lab.rvlaboratorio.com/api/export/monthly \
  -H "x-cron-secret: $CRON_SECRET" \
  -s >> /var/log/monthly-export.log 2>&1
```

El archivo XLSX se guarda en el bucket privado `exports` de InsForge con nombre `monthly_<año>_<mes>.xlsx`. Descargar y archivar localmente:

```bash
# Descargar el export mensual del bucket (via URL firmada)
# La URL firmada se obtiene del API o del dashboard de InsForge
curl -o "/backups/monthly/export_$(date +%Y_%m).xlsx" "<URL_FIRMADA>"
```

### 4.5 Replicación offsite

> Los backups en el VPS no son suficientes. Si el VPS muere, se pierden los backups también.

Agregar al script de backup diario (después de crear el dump):

```bash
# Replicar a almacenamiento externo (ej: rclone a Google Drive o S3)
# Prerequisito: rclone configurado con perfil "gdrive" o "s3"
rclone copy "$BACKUP_FILE" gdrive:backups/labsystem/postgres/
# o:
# rclone copy "$BACKUP_FILE" s3:mi-bucket/labsystem/postgres/
```

Alternativa mínima: copiar manualmente a una máquina local al menos una vez por semana:

```bash
# Desde la máquina local
scp deploy@vps:/backups/postgres/daily/insforge_$(date +%Y%m%d)*.sql.gz ~/backups/labsystem/
```

---

## 5. Ensayo de rollback en preview

### Objetivo

Verificar que el procedimiento de rollback funciona antes del cutover real.

### Ambiente de ensayo

- **Preview**: InsForge en VPS (misma instancia), base de datos `insforge_preview` separada, o staging si existe.
- **Fecha del ensayo**: antes del cutover real (recomendado: D-3).

### Procedimiento del ensayo

**Paso 1: Simular estado post-migración en preview**

```bash
# En staging/preview, correr la migración con datos de prueba
pnpm --filter migrate-wp run migrate -- --confirm --env=preview

# Verificar que los datos están en Postgres preview
docker compose exec postgres psql -U postgres -d insforge_preview -c "SELECT COUNT(*) FROM paciente;"
```

**Paso 2: Tomar snapshot (simula el T0 del cutover real)**

```bash
docker compose exec -T postgres \
  pg_dump -U postgres insforge_preview \
  | gzip > /tmp/preview_snapshot_T0.sql.gz

echo "Snapshot T0 creado: $(ls -lh /tmp/preview_snapshot_T0.sql.gz)"
```

**Paso 3: Simular actividad post-cutover**

```bash
# Insertar algunos registros "post-cutover" via API o SQL directo
docker compose exec postgres psql -U postgres -d insforge_preview -c "
  INSERT INTO paciente (cedula, nombre, apellido) VALUES ('V-99999999', 'Test', 'PostCutover');
"
```

**Paso 4: Ejecutar rollback**

```bash
# Restaurar snapshot T0
gunzip -c /tmp/preview_snapshot_T0.sql.gz | docker compose exec -T postgres \
  psql -U postgres -d insforge_preview

# Verificar que el paciente "post-cutover" desapareció
docker compose exec postgres psql -U postgres -d insforge_preview -c "
  SELECT COUNT(*) FROM paciente WHERE cedula = 'V-99999999';
"
# → debe dar 0
```

**Paso 5: Documentar resultados**

Registrar en este playbook:

```
## Evidencia del ensayo de rollback

- Fecha del ensayo: __________
- Ambiente: preview / staging
- Snapshot T0 creado: ✓ / ✗
- Restore completado sin errores: ✓ / ✗
- Verificación de conteos post-restore: ✓ / ✗
- Tiempo total del procedimiento: ______ minutos
- Ejecutado por: __________
- Observaciones: __________
```

---

### Resultado del ensayo (completar post-ensayo)

```
Fecha del ensayo: _________________________
Ambiente: preview
Snapshot T0 creado: [ ]
Restore completado sin errores: [ ]
Verificación de conteos post-restore: [ ]
Tiempo total: ______ minutos
Ejecutado por: _________________________
Observaciones: _________________________
```

---

## 6. Árbol de decisión: ¿cuándo activar qué?

```
Bug detectado en LabSystem post-cutover
    │
    ▼
¿Severidad P0/P1?
    ├─ NO (P2/P3) → Hotfix normal en < 24h. WP como consulta de respaldo si necesario.
    └─ SÍ
        │
        ▼
    ¿Hotfix listo en < 2h?
        ├─ SÍ → Aplicar hotfix. Monitorear. Documentar.
        └─ NO
            │
            ▼
        ¿Hay datos nuevos en LabSystem que preservar?
            ├─ NO → Rollback rápido (§3.1). Tiempo: ~20min.
            └─ SÍ → Rollback tardío (§3.2) + re-import (§3.3). Tiempo: 2-4h.
                │
                └─ En ambos casos: reactivar WP operativo (§2) mientras se fix
```

---

## 7. Contactos y escalación

| Rol | Nombre | Contacto | Cuándo llamar |
|-----|--------|----------|---------------|
| Admin del laboratorio | Rosa V. | WhatsApp: +58-XXX-XXX | Cualquier P0/P1 |
| Tech Lead | Héctor R. | knaimero@gmail.com | Cualquier P0, rollback |
| Hosting VPS | (proveedor) | Panel de soporte | VPS caído |

### Templates de comunicación

**Email/WhatsApp de rollback activado:**

```
Equipo RV Laboratorio:

LabSystem está experimentando un problema técnico [descripción breve].
Mientras lo solucionamos, el sistema anterior (WP) está disponible para 
ingresar datos en: https://wp.rvlaboratorio.com

No se perderá información. El equipo técnico está trabajando en la solución.
Tiempo estimado de resolución: [X horas]

Disculpen los inconvenientes.
— Equipo Técnico
```

**Email de reactivación LabSystem (post-rollback resuelto):**

```
Equipo RV Laboratorio:

LabSystem está nuevamente operativo en: https://lab.rvlaboratorio.com

Por favor continúen ingresando datos desde LabSystem. Los datos ingresados
en WP durante la emergencia han sido sincronizados.

Gracias por su paciencia.
— Equipo Técnico
```

---

## Historial de cambios

| Versión | Fecha | Cambio | Autor |
|---------|-------|--------|-------|
| 1.0 | 2026-08-24 | Versión inicial | F4.2.T4 |
