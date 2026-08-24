# S7 · Formato / redondeo Bs Venezuela

Prototipo del spike S7. Artefactos:

- `REPORT.md` — reglas firmadas (fallback VE), comparación `Intl.NumberFormat`,
  conclusión y verificación del cálculo del PRD.
- `bs-format.mjs` — prototipo de `formatBs`, `formatUsd`, `roundBs`, `roundHalfUp`
  y `computeTotales`. Portar a `packages/lib/bs-format.ts` en F2.presupuestos.
- `bs-format.test.mjs` — suite de 28 casos edge.

## Ejecutar tests

```sh
node spikes/S7-bs-rounding/bs-format.test.mjs
```

No requiere dependencias (usa `node:assert/strict`).
