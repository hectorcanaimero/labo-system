# Spike S7: Formato / redondeo Bs Venezuela (tributario)

## Resumen Ejecutivo

Reglas de formato y redondeo para montos en Bs y USD cerradas y validadas
empíricamente. El hallazgo clave: **`Intl.NumberFormat('es-VE')` resuelve
formato Y redondeo correctamente** (half-up "comercial", es decir half away
from zero), mientras que el atajo `Math.round(x * 100) / 100` sugerido en las
notas técnicas del spike es **BUGGY** (falla en `1.005`, `2.675`, `10.075` y
en todos los negativos con `.5`). Prototipo listo para portar a
`packages/lib/bs-format.ts` en F2.presupuestos.

## Reglas firmadas

| # | Ítem | Regla | Convención |
|---|------|-------|-----------|
| 1 | Decimales Bs | **2** (céntimos del Bolívar Digital) | VE |
| 2 | Separador miles Bs | `.` (punto) | VE |
| 3 | Separador decimal Bs | `,` (coma) | VE |
| 4 | Redondeo | **half-up "comercial"** (half away from zero) | estándar tributario VE |
| 5 | Decimales USD | 2 | internacional |
| 6 | Separador miles USD | `,` (coma) | en-US |
| 7 | Separador decimal USD | `.` (punto) | en-US |
| 8 | PDF vs UI | **coinciden** (misma función `formatBs`/`formatUsd`) | — |
| 9 | Punto de redondeo | **solo al final** de la cadena de cálculo | — |

> **Estado de firma con el cliente (Rubén):** PENDIENTE de confirmación
> explícita en reunión, igual que S4. Se aplica el **fallback documentado**
> (reglas estándar VE de arriba) y se comunica al cliente antes del go-live
> de F2. El fallback es de bajo riesgo porque coincide con la práctica
> tributaria venezolana: 2 decimales, `.` miles, `,` decimal, half-up.

## Cálculo del PRD (verificado)

Fórmula exacta del PRD §10 / F6.presupuestos:

```
Total USD = subtotal × (1 − descuento%) × (1 + ganancia%)
Total Bs  = round( Total USD × tasa )
```

Reglas de implementación:

- La **ganancia% es interna**: entra al cálculo pero NUNCA se muestra en el
  PDF ni en la UI de aprobación.
- El redondeo se aplica **una sola vez, al final** (`Total Bs`), sobre el
  `Total USD` a precisión completa (no redondear `Total USD` intermedio).
- `Total USD` se redondea solo para **mostrarlo** (2 dec), pero el cálculo de
  `Total Bs` usa el valor sin redondear.

Verificación con datos reales (ver `bs-format.test.mjs`, bloque
`computeTotales`):

| Caso | Resultado |
|------|-----------|
| 250.00 USD, −10%, +20%, tasa 60.5 | USD **270.00** · Bs **16.335,00** |
| 123.45 USD, −5%, +15%, tasa 62.37 | USD **134,87** · Bs **round(134.869125 × 62.37)** |
| 100 USD, 0%, 0%, tasa 50 | USD **100.00** · Bs **5.000,00** |

## Comparación `Intl.NumberFormat('es-VE')` vs regla custom

**Conclusión: usar `Intl.NumberFormat('es-VE')` para formatear.** No es
necesario un formateador custom de separadores: `es-VE` produce exactamente
`.` para miles y `,` para decimal, y su redondeo interno es half away from
zero (idéntico a la regla del cliente).

Evidencia empírica (V8 / Node 22):

| input | `Math.round(x*100)/100` | `Intl('es-VE')` | `roundHalfUp` custom |
|-------|-------------------------|-----------------|----------------------|
| `1.005` | **1.00 ❌** | `1,01` ✅ | `1.01` ✅ |
| `2.675` | **2.67 ❌** | `2,68` ✅ | `2.68` ✅ |
| `10.075` | **10.07 ❌** | `10,08` ✅ | `10.08` ✅ |
| `-0.005` | **-0.00 ❌** | `-0,01` ✅ | `-0.01` ✅ |
| `-1.005` | **-1.00 ❌** | `-1,01` ✅ | `-1.01` ✅ |
| `0.1 + 0.2` | `0.30` ✅ | `0,30` ✅ | `0.30` ✅ |

Fuzz test: `roundHalfUp` custom **0 divergencias** vs `Intl.NumberFormat`
en 300.000 valores aleatorios monetarios (0/2/4 decimales).

### Por qué falla `Math.round(x * 100) / 100`

1. **Precisión IEEE 754**: `1.005 * 100 === 100.49999999999999`, así que
   `Math.round` da `100` → `1.00` (el usuario escribió `1.005` y espera `1.01`).
2. **Negativos**: `Math.round` redondea el `.5` hacia `+∞`, entonces
   `-0.005 → -0.00` en vez de `-0.01` (half-up comercial exige half *away*).
3. `Number.prototype.toFixed` hereda el mismo problema (ej. `(1.005).toFixed(2)`
   → `"1.00"`), por eso la nota técnica prohíbe usarlo en operaciones críticas.

## Snippet de código (prototipo)

Ver `spikes/S7-bs-rounding/bs-format.mjs`. Núcleo:

```ts
// half-up "comercial" (half away from zero), exacto para dinero
export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const shifted = Number(`${abs}e${decimals}`); // string → evita 1.005*100
  const rounded = Math.round(shifted);
  return (sign * rounded) / 10 ** decimals;
}

const bsFormatter  = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const roundBs  = (amount: number) => roundHalfUp(amount, 2);
export const formatBs = (amount: number) => bsFormatter.format(roundHalfUp(amount, 2));
export const formatUsd = (amount: number) => usdFormatter.format(roundHalfUp(amount, 2));
```

El truco `` Number(`${abs}e${decimals}`) `` desplaza el punto decimal sobre la
representación decimal **más corta** del número (la que el usuario escribió),
evitando el error de punto flotante de la multiplicación. Es la razón por la
que `1.005 → 1.01` correctamente.

## Suite de tests

`spikes/S7-bs-rounding/bs-format.test.mjs` — **28 casos edge**, todos pasando:

- Redondeo: `0.005`, `0.015`, `1.005`, `2.675`, `10.075`, `-0.005`, `-1.005`,
  `-2.675`, `1.4999`, `1.494`, `2.6751`, `0.1+0.2`, `0`, `1000`, `123.456`, `19.999`.
- Formato Bs: `1.234.567,89`, `1.000,00`, `-1.234,50`, `1,01`.
- Formato USD: `1,234,567.89`, `123.40`, `-0.01`.
- Cadena PRD: 4 casos (incluido "redondea solo al final" y "ganancia interna oculta").
- Equivalencia `Intl('es-VE')` vs `roundBs`.

Ejecutar: `node spikes/S7-bs-rounding/bs-format.test.mjs`.

## Learning outputs

- Reglas de formato/redondeo documentadas (fallback VE estándar, firma pendiente).
- `Math.round(x*100)/100` queda **descartado** (buggy); reemplazado por
  `roundHalfUp` decimal-aware + `Intl.NumberFormat`.
- Prototipo `bs-format.mjs` listo para portar 1:1 a `packages/lib/bs-format.ts`.

## Notas para F2.presupuestos

- Portar `bs-format.mjs` → `packages/lib/bs-format.ts` (funciones puras, sin deps).
- Cachear `bsFormatter`/`usdFormatter` (ya lo están: constantes a nivel módulo).
- NO reintroducir `toFixed` ni `Math.round(x*100)/100` en el cálculo de dinero.
- La ganancia% se calcula pero no se renderiza en `PresupuestoPDF.tsx`.
- Mover los 28 casos de `bs-format.test.mjs` a `bs-format.test.ts` (Vitest)
  tal como indica la nota técnica de S7.

## Pendientes

- [ ] Firma explícita del cliente (Rubén) sobre decimales/separadores/redondeo
      (fallback VE estándar comunicado mientras tanto).
- [ ] Confirmar si el cliente quiere **0 decimales** para Bs en montos grandes
      (el fallback asume 2; `formatBs` admite variante cambiando
      `minimumFractionDigits`/`maximumFractionDigits` a `0` si se decide).
