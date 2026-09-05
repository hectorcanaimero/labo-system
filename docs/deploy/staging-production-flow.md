# Flujo Staging → Production

## Arquitectura de Deployment

El proyecto usa un flujo de dos ambientes con separación clara entre staging y producción:

```
feature branch → staged → staging env → validación → main → production env
```

## Branch Strategy

### `staged` (default branch)
- Branch por defecto del repositorio
- Todos los PRs nuevos apuntan aquí automáticamente
- Deploy automático a **ambiente de staging**
- Ambiente de pruebas y validación

### `main` (production branch)
- Branch protegido con restricciones estrictas
- Solo acepta PRs desde `staged`
- Requiere que pasen todos los CI checks:
  - `lint (20)`
  - `typecheck (20)`
  - `test (20)`
  - `build (20)`
- Deploy automático a **ambiente de producción**

## Workflow Detallado

### 1. Desarrollo de Features

```bash
# Asegurarse de estar en staged actualizado
git checkout staged
git pull origin staged

# Crear feature branch
git checkout -b feature/mi-feature
# o
git checkout -b fix/bug-description

# Desarrollo...
git add .
git commit -m "feat: descripción del cambio"
git push origin feature/mi-feature
```

### 2. Pull Request a Staging

```bash
# Crear PR hacia staged (default)
gh pr create --title "feat: mi feature" --body "Descripción detallada"

# O desde la UI de GitHub (automáticamente apunta a 'staged')
```

**Qué pasa:**
- GitHub Actions corre CI/E2E automáticamente
- Revisión de código (opcional)
- Merge cuando esté listo

### 3. Deploy a Staging

**Al hacer merge a `staged`:**

1. Coolify detecta el cambio en branch `staged`
2. Deploy automático al ambiente de staging
3. Logs disponibles en Coolify UI

**Testing en staging:**
- Validar la funcionalidad end-to-end
- Verificar integraciones
- Pruebas de aceptación
- QA manual si aplica

### 4. Promoción a Producción

**Solo cuando staging está validado:**

```bash
# Opción A: Desde CLI
gh pr create \
  --base main \
  --head staged \
  --title "Release: $(date +%Y-%m-%d) - Descripción" \
  --body "Cambios incluidos:
- Feature X
- Fix Y
- Update Z
"

# Opción B: Desde GitHub UI
# Base: main
# Compare: staged
```

**Verificaciones automáticas antes de merge:**
- ✅ CI checks deben pasar (lint, typecheck, test, build)
- ✅ El PR debe venir desde `staged` (no otros branches)
- ⚠️ Branch protection evita push directo a `main`

**Al hacer merge a `main`:**
1. Coolify detecta el cambio en branch `main`
2. Deploy automático al ambiente de producción
3. Monitoreo post-deploy

## Configuración de Coolify

### Ambiente de Staging

**Archivo:** `.coolify.staging`

```
context: contabo
project: rpz408e1gtmy0car8ahvj3pt
server: dfurbhvmzdtjto4qhzu7vswo
app: goxpgu9q2yeqlcun5vp2j4ou
environment: staging
```

**Configuración en Coolify UI:**
- Branch a deployear: `staged`
- Auto-deployment: activado
- Environment variables: `.env.staging`
- URL: [configurar staging URL]

### Ambiente de Producción

**Archivo:** `.coolify` (default)

```
context: contabo
project: rpz408e1gtmy0car8ahvj3pt
server: dfurbhvmzdtjto4qhzu7vswo
app: goxpgu9q2yeqlcun5vp2j4ou
environment: production
```

**Configuración en Coolify UI:**
- Branch a deployear: `main`
- Auto-deployment: activado
- Environment variables: `.env.production`
- URL: [configurar production URL]

## Variables de Entorno

Cada ambiente debe tener su propio set de variables:

### Staging
- Database: staging database
- APIs: staging/sandbox API keys
- Feature flags: experimentos activos
- Debug: niveles más verbosos

### Production
- Database: production database
- APIs: production API keys
- Feature flags: features estables únicamente
- Debug: solo errores críticos
- Secrets: valores reales de producción

## Rollback

### Si staging tiene problemas:
```bash
# Revertir el merge en staged
git checkout staged
git revert <commit-sha>
git push origin staged
# Deploy automático del revert
```

### Si production tiene problemas:
```bash
# Opción A: Revert rápido
git checkout main
git revert <commit-sha>
git push origin main

# Opción B: Rollback a versión anterior
git checkout main
git reset --hard <commit-anterior-conocido-bueno>
git push --force origin main  # ⚠️ Usar con cuidado
```

## Hotfixes en Producción

Para bugs críticos que necesitan fix inmediato:

```bash
# Crear hotfix branch desde main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# Fix...
git commit -m "fix: critical bug description"
git push origin hotfix/critical-bug

# PR directo a main (cumple con branch protection)
gh pr create --base main --head hotfix/critical-bug

# DESPUÉS del merge a main, sincronizar a staged:
git checkout staged
git merge main
git push origin staged
```

## GitHub Actions

### CI Workflow (`.github/workflows/ci.yml`)

Corre en:
- Push a `main` o `staged`
- PRs hacia `main` o `staged`

Jobs:
- `lint`: ESLint en todo el monorepo
- `typecheck`: TypeScript checks
- `test`: Test suite completa
- `build`: Build de producción

### E2E Workflow (`.github/workflows/e2e.yml`)

Corre en:
- Push a `main` o `staged`
- PRs hacia `main` o `staged`
- Manual (`workflow_dispatch`)

Setup:
- PostgreSQL 16 en CI
- Playwright con Chromium headless
- Test suite completa end-to-end

## Checklist de Release

Antes de hacer merge `staged → main`:

- [ ] Todas las features en staging están validadas
- [ ] Tests E2E pasan en staging
- [ ] Performance es aceptable
- [ ] No hay errores críticos en logs de staging
- [ ] Base de datos de producción tiene las migraciones necesarias
- [ ] Variables de entorno de producción están actualizadas
- [ ] Equipo está notificado del deploy
- [ ] Plan de rollback está claro
- [ ] Monitoreo post-deploy está configurado

## Troubleshooting

### "Cannot push to main"
→ Branch protection activo. Usar PR, no push directo.

### "Required status checks must pass"
→ Esperar a que CI termine. Arreglar fallos si los hay.

### "Deployment failed in Coolify"
→ Revisar logs en Coolify UI. Verificar variables de entorno y configuración.

### "Staging y main están desincronizados"
→ Hacer merge de main a staged regularmente para mantener sincronía:
```bash
git checkout staged
git merge main
git push origin staged
```

## Recursos

- [Coolify Docs](https://coolify.io/docs)
- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Turborepo Deployment](https://turbo.build/repo/docs/handbook/deploying-with-docker)
