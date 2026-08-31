# Labo System — Design System

> **Source of truth para todo el UI del sistema.**
> Estética: monocromática, densa, tipografía cuidada. Referencia mental: **Vercel / Geist**, Linear, Retool.
> No es consumer, no es marketing, no es juguete.

---

## 0. Filosofía

**"Clinical precision, zero decoration."**

Sistema para bioanalistas, recepcionistas y admins de laboratorio clínico. Mueven datos rápido, escanean listas largas, cambian estados sin fricción. No es una app para "descubrir": es una herramienta de trabajo diario.

**Reglas fundamentales**:

1. **Densidad primero.** Row height 32–40px, no 64px. Ver ~15–20 filas sin scroll en 1080p.
2. **Monospace para datos.** Cédula, fecha, precio, código, ID → `font-mono tabular-nums`. Nombres, títulos, texto libre → sans.
3. **Bordes finos, no sombras.** `border border-border` sobre `shadow-*`. Sombras solo para overlays (Dialog, DropdownMenu, Popover).
4. **Un solo acento cromático.** Todo grayscale + azul para acciones primarias. Los estados usan verdes/rojos/ámbar solamente en badges.
5. **Cero decoración.** No gradients, no glassmorphism, no `rounded-2xl`, no iconos de 32px.
6. **Cada click cuenta.** Si el operador hace la misma acción 50 veces por día, no puede tener 3 clicks. Meta: 1 click + 1 confirmación.

---

## 1. Design Tokens

### 1.1 Color (tokens shadcn)

Todo por CSS variables — declaradas en `apps/web/app/globals.css` (shadcn `new-york`). **Nunca uses hex crudo en componentes**, siempre las clases utility.

| Token | Light | Uso |
|---|---|---|
| `background` | `#FAFAFA` | Fondo global |
| `foreground` | `#09090B` | Texto principal |
| `card` | `#FFFFFF` | Fondo de cards y superficies elevadas |
| `card-foreground` | `#09090B` | Texto sobre cards |
| `muted` | `#E8ECF0` | Fondos secundarios (headers de tabla, footer paginación) |
| `muted-foreground` | `#71717A` | Texto secundario, meta |
| `border` | `#E4E4E7` | Bordes de todo |
| `primary` | `#18181B` | Botón primario, acciones neutrales |
| `primary-foreground` | `#FFFFFF` | Texto sobre primary |
| `accent` | `#2563EB` | Enlaces, focus rings, drop targets válidos |
| `destructive` | `#DC2626` | Eliminar, anular, errores |
| `ring` | `#18181B` | Focus outline |

**Estados operativos** (badges de dominio, no tokens globales):

| Estado | Fondo | Texto |
|---|---|---|
| Registrada / Borrador / Neutral | `bg-zinc-100` | `text-zinc-800` |
| Enviado / Muestra tomada / En proceso | `bg-sky-100` | `text-sky-800` |
| Validando / Aprobado | `bg-violet-100` | `text-violet-800` |
| Entregada / Cerrado / Success | `bg-emerald-100` | `text-emerald-800` |
| Rechazado / Anulada / Cancelado / Danger | `bg-red-100` | `text-red-800` |

### 1.2 Spacing

Escala **densa** (density 8/10). Usar Tailwind default pero limitado:

| Uso | Clases |
|---|---|
| Gap entre secciones | `gap-4` (16px) |
| Padding de card | `p-3` a `p-4` (12–16px) |
| Padding de tabla row | `py-1.5` (6px) |
| Gap entre elementos inline | `gap-2` (8px) |
| Container max | `max-w-[100rem]` (dashboards ancho), `max-w-6xl` (formularios) |

**Prohibido**: `p-8`, `p-10`, `gap-8` — son marketing sizes, no operativos.

### 1.3 Radius

`rounded-md` (6px) por defecto. `rounded-lg` (8px) solo para Dialog y containers grandes. **Nunca** `rounded-2xl` o `rounded-full` (excepto avatars y badges pill).

### 1.4 Typography

**Base**: `text-sm` (14px) body, `text-xs` (12px) meta/tabla, `text-lg` títulos de sección, `text-xl` page titles. **Nunca `text-3xl`** en páginas operativas.

**Familias**:
- **Sans** (default system stack): nombres, texto, botones, headings
- **Mono** (`font-mono tabular-nums`): cédula, fecha, precio, ID, contadores, cualquier dato tabular

**Cuándo usar mono** (regla dura):
- Cédulas (`V-12345678`)
- Fechas cortas (`15/03/2026`)
- Precios (`$8.50`, `Bs 145.75`)
- Contadores (`23`, `Página 3/12`)
- IDs / correlativos (`PR-2026-000127`)

Si dudás, mono. La grilla visual gana.

### 1.5 Iconografía

**Solo Lucide.** Tamaños: `h-3.5 w-3.5` (14px) en botones/controles, `h-4 w-4` (16px) para nav. **Nunca emojis** como icono.

---

## 2. Componentes shadcn — cuándo usar cada uno

### Instalados hoy

| Componente | Uso |
|---|---|
| `Button` | Todos los botones. `size="sm"` por defecto (h-8). |
| `Table` | Cualquier lista con >5 filas. Row `h-9` + `py-1.5`. |
| `Badge` | Estados fijos que no cambian por interacción. |
| `Dialog` | Confirmaciones, forms modales, acciones. **Reemplaza** cualquier `fixed inset-0` custom. |
| `DropdownMenu` | Menú de acciones `⋮` en filas de tabla. |
| `Input` | Formularios. |
| `Tooltip` | Info secundaria en iconos. Requiere `TooltipProvider` en el árbol. |

### Faltan por instalar (según lo que veamos)

| Componente | Uso |
|---|---|
| `select` | Reemplaza `<select>` nativo. Filtros de listas, config forms. |
| `tabs` | Detalle de paciente, secciones grandes en Config. |
| `card` | KPIs del dashboard, secciones de config. |
| `separator` | Divisor entre secciones dentro de un card. |
| `label` | Labels de forms (accesibilidad). |
| `form` | Wrapper para forms con react-hook-form + zod. |
| `sheet` | Panel lateral (filtros avanzados, edit rápido). |
| `skeleton` | Loading states (reemplaza `SkeletonTable` custom). |

**Instalación**: `pnpm dlx shadcn@latest add <componente>`.

---

## 3. Patrones establecidos (con ejemplos)

### 3.1 Data table densa

**Ejemplo canónico**: `apps/web/app/(app)/examenes/TitulosNavigator.tsx`, `.../resultados/ResultadosList.tsx`.

```tsx
<Table>
  <TableHeader>
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableHead className="h-9 py-1.5">Paciente</TableHead>
      <TableHead className="h-9 py-1.5">Cédula</TableHead>
      <TableHead className="h-9 w-24 py-1.5 text-right">Precio</TableHead>
      <TableHead className="h-9 w-9 py-1.5" />
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map((item) => (
      <TableRow key={item.id} className="h-9">
        <TableCell className="py-1.5 font-medium text-foreground">
          {item.nombre}
        </TableCell>
        <TableCell className="py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
          {item.cedula}
        </TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">
          {formatUsd(item.precio)}
        </TableCell>
        <TableCell className="py-1.5 text-right">
          <DropdownMenu>{/* ⋮ acciones */}</DropdownMenu>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Reglas**:
- Header con `bg-muted/40` + `hover:bg-muted/40` para que no cambie al pasar el mouse
- Cédulas/fechas/precios siempre `font-mono tabular-nums`
- Precios alineados `text-right` con `w-24` fija
- Última columna `w-9` para el `⋮` del dropdown
- Row `h-9` (36px) + `py-1.5` en cada cell

### 3.2 Filter bar densa

**Todo en una fila horizontal**, dentro de `rounded-md border border-border bg-muted/20 p-2`. Inputs `h-8` `text-xs`.

```tsx
<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
  <div className="relative min-w-[220px] flex-1">
    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
    <input
      className="flex h-8 w-full rounded-md border border-input bg-background py-1 pl-8 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  </div>
  <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
  <span className="text-xs text-muted-foreground">→</span>
  <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs">
    {/* ... */}
  </select>
  <div className="ml-auto"><ExportButton /></div>
</div>
```

**Cuando instalemos `Select` de shadcn, reemplazar el `<select>` nativo.**

### 3.3 Page header compacto

Título + total + acciones, todo en una fila.

```tsx
<div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-end sm:justify-between">
  <div className="min-w-0">
    <div className="flex items-baseline gap-3">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Órdenes</h1>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">{total}</span>
    </div>
    <p className="mt-0.5 text-xs text-muted-foreground">Subtítulo corto.</p>
  </div>
  <div className="flex items-center gap-2">
    {/* Toggle + CTA */}
  </div>
</div>
```

**Prohibido**: `text-3xl`, `mt-6 mb-6`, párrafos de más de 1 línea.

### 3.4 Badge de estado

Componentes en `packages/ui/{ordenes,presupuestos}/*EstadoBadge.tsx`. **Nunca inline** un span con colores hardcoded — usar el componente.

```tsx
<OrdenEstadoBadge estado={orden.estado} />
```

Cuando armes badges para otra entidad, seguir el patrón: mapa readonly de `estado → clases`, sin lógica adentro.

### 3.5 Modal de acción

Siempre `Dialog` de shadcn, no `fixed inset-0` custom.

```tsx
<Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{title}</span>
        <OrdenEstadoBadge estado={estado} />
      </DialogTitle>
      <DialogDescription className="text-xs">
        Descripción corta de la acción.
      </DialogDescription>
    </DialogHeader>
    {/* Contenido */}
  </DialogContent>
</Dialog>
```

### 3.6 Optimistic updates

Para acciones frecuentes (drag & drop, cambio de estado), **nunca esperar el server** para actualizar el UI.

```tsx
// 1. Aplicar cambio local
setOverrides((prev) => new Map(prev).set(id, nuevoEstado));

// 2. Fire request
try {
  await fetch(...);
  router.refresh();
} catch (err) {
  // 3. Revertir + toast
  setOverrides((prev) => { /* undo */ });
  notifyError(err);
}
```

Referencia: `apps/web/app/(app)/resultados/OrdenesPipelineSection.tsx`.

### 3.7 Feedback

- **Éxito**: `notifySuccess` breve.
- **Error**: siempre `notifyError` con mensaje humano (`toHumanError(err)`).
- **Loading**: `<Loader2 className="animate-spin" />` inline, o `Skeleton` para bloques.

---

## 4. Layout global

### 4.1 Container widths

| Página tipo | Max width |
|---|---|
| Dashboard, listas anchas (Órdenes con kanban 6-col) | `max-w-[100rem]` |
| Listas normales (Pacientes, Examenes) | `max-w-7xl` |
| Formularios | `max-w-3xl` |
| Detalles | `max-w-6xl` |

### 4.2 Responsive breakpoints

Mobile-first. Breakpoints Tailwind: `sm` (640), `md` (768), `lg` (1024), `xl` (1280), `2xl` (1536).

**Prohibido**: horizontal scroll fuera de tablas / kanban. Todo layout debe adaptarse.

### 4.3 Navegación

Sidebar fija a la izquierda (`packages/ui/nav/Sidebar.tsx`) — colapsable con localStorage. Header top con perfil de usuario + logout. **No agregar breadcrumbs** — el sidebar + page header alcanzan.

---

## 5. Motion (subtle, motion 2/10)

- **Transiciones**: `transition-colors` (150ms) en hovers, nada más.
- **Dialog/Sheet**: usar el default de shadcn (250ms fade + slide).
- **Skeleton**: shimmer sutil.
- **Prohibido**: animaciones scroll-triggered, entradas escalonadas, spring physics. No es una landing.

---

## 6. Accesibilidad (mínimo obligatorio)

- **Contrast 4.5:1** en todo texto. Los tokens shadcn ya cumplen.
- **Focus visible** en todos los interactivos. **Nunca** `outline: none` sin reemplazo. Usar `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`.
- **Iconos-solo** con `aria-label`.
- **Estado no depende solo del color**: los badges tienen texto además del color.
- **Teclado**: todo lo cliqueable debe ser accesible con Tab + Enter/Space.

---

## 7. Reglas server/client (Next.js App Router)

- **Nunca importar** desde `@labo/db/repos/*` en archivos con `"use client"` — arrastra el SDK admin al bundle del cliente. Si necesitás una constante del backend en el UI, **inline la string** como const local.
- Tipos que se comparten client/server viven en `packages/lib/schemas/*`.
- Handlers de fetch: `credentials: "include"` + `cache: "no-store"` para APIs internas.

---

## 8. Anti-patterns explícitos (nunca hacer)

- ❌ `<div className="fixed inset-0 z-50 bg-black/50">` — usar `Dialog` de shadcn.
- ❌ `<select>` nativo — usar `Select` de shadcn (cuando esté).
- ❌ `rounded-2xl` en cards operativas. Es marketing.
- ❌ `text-3xl` como page title en dashboards.
- ❌ `shadow-lg`, `shadow-xl` en cards de contenido. Solo overlays.
- ❌ Emoji como icono (`✅`, `❌`, `🚀`). Solo Lucide SVG.
- ❌ `<p>Mostrando página 1 de 5, 20 resultados</p>` — usar mono compacto: `1/5 · 20 total`.
- ❌ Botones con `h-11`. Usar `h-8` (sm) o `h-9`.
- ❌ Colores hex crudos en componentes. Usar tokens.
- ❌ Múltiples niveles de card anidados (`Card > Card > Card`). Máximo 1.
- ❌ Refetch de página completa después de una acción trivial (usar optimistic).
- ❌ Iconos de Heroicons u otras librerías. Solo Lucide.

---

## 9. Checklist pre-merge (por PR de UI)

- [ ] `pnpm --filter web exec tsc --noEmit` pasa
- [ ] Cero `console.log`
- [ ] Cero `any` sin justificar
- [ ] Componentes shadcn usados donde aplica (no re-implementados)
- [ ] Mono en cédulas/fechas/precios
- [ ] Row height compacto (h-9 en tablas)
- [ ] `text-xs` para meta, `text-sm` para body
- [ ] `focus-visible:ring-*` en todos los interactivos
- [ ] Sin `text-3xl` ni `p-8`
- [ ] Loading state visible (Skeleton o Loader2)
- [ ] Error state visible (toast o inline border-destructive)

---

## 10. Referencia por página (overrides)

Cuando trabajes en una página específica, chequeá si existe `pages/<nombre>.md` en este directorio. Si existe, sus reglas **override** este MASTER. Si no, aplicá MASTER tal cual.

Páginas con override actual: **ninguna todavía** (se crean cuando alguna requiere excepciones).

Ejemplo de cuándo crear un override: la página `/dashboard` puede necesitar `max-w-[120rem]` porque tiene KPIs + chart + activity en 3 columnas — no cabe en `max-w-[100rem]`. Ahí creamos `pages/dashboard.md` documentando la excepción.

---

## 11. Roadmap de aplicación

Aplicación por fases (según prioridad de user journey):

- **Fase A**: instalar shadcn `select`, `tabs`, `card`, `separator`, `label`. Rediseñar **Dashboard** + **Config**.
- **Fase B**: **Pacientes lista + detalle** — la vista más usada. Table densa + Tabs shadcn.
- **Fase C**: **Presupuestos** — replicar patrones ya aplicados en Resultados.
- **Fase D**: Auth (Login, Reset), Usuarios, Audit.

Cada fase corta y verificable end-to-end antes de la próxima.
