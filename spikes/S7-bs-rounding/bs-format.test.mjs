// Suite de tests S7 · Formato / redondeo Bs (≥ 20 casos edge)
// Ejecutar: node spikes/S7-bs-rounding/bs-format.test.mjs
import assert from "node:assert/strict";
import {
  roundHalfUp,
  roundBs,
  formatBs,
  formatUsd,
  computeTotales,
} from "./bs-format.mjs";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `esperado ~${b}, recibido ${a}`);

console.log("\nroundHalfUp / roundBs (redondeo half-up a 2 dec)");
test("0.005 half-up → 0.01", () => assert.equal(roundBs(0.005), 0.01));
test("0.015 half-up → 0.02", () => assert.equal(roundBs(0.015), 0.02));
test("1.005 → 1.01 (FP: 1.005*100 = 100.4999...)", () => assert.equal(roundBs(1.005), 1.01));
test("2.675 → 2.68 (clásico IEEE 754)", () => assert.equal(roundBs(2.675), 2.68));
test("10.075 → 10.08", () => assert.equal(roundBs(10.075), 10.08));
test("-0.005 → -0.01 (half away from zero)", () => assert.equal(roundBs(-0.005), -0.01));
test("-1.005 → -1.01", () => assert.equal(roundBs(-1.005), -1.01));
test("-2.675 → -2.68", () => assert.equal(roundBs(-2.675), -2.68));
test("1.4999 → 1.50 (debajo del medio NO sube)", () => assert.equal(roundBs(1.4999), 1.5));
test("1.494 → 1.49", () => assert.equal(roundBs(1.494), 1.49));
test("2.6751 → 2.68 (apenas por encima del medio)", () => assert.equal(roundBs(2.6751), 2.68));
test("0.1 + 0.2 → 0.30 (suma FP)", () => assert.equal(roundBs(0.1 + 0.2), 0.3));
test("0 → 0", () => assert.equal(roundBs(0), 0));
test("1000 → 1000 (entero)", () => assert.equal(roundBs(1000), 1000));
test("123.456 → 123.46", () => assert.equal(roundBs(123.456), 123.46));
test("19.999 → 20.00", () => assert.equal(roundBs(19.999), 20));

console.log("\nformatBs (es-VE: miles '.', decimal ',')");
test("1234567.89 → '1.234.567,89'", () => assert.equal(formatBs(1234567.89), "1.234.567,89"));
test("1000 → '1.000,00'", () => assert.equal(formatBs(1000), "1.000,00"));
test("-1234.5 → '-1.234,50'", () => assert.equal(formatBs(-1234.5), "-1.234,50"));
test("1.005 → '1,01'", () => assert.equal(formatBs(1.005), "1,01"));

console.log("\nformatUsd (en-US: miles ',', decimal '.')");
test("1234567.89 → '1,234,567.89'", () => assert.equal(formatUsd(1234567.89), "1,234,567.89"));
test("123.4 → '123.40'", () => assert.equal(formatUsd(123.4), "123.40"));
test("-0.005 → '-0.01'", () => assert.equal(formatUsd(-0.005), "-0.01"));

console.log("\ncomputeTotales (cálculo PRD §10 / F6)");
test("250.00, -10%, +20%, tasa 60.5 → USD 270.00, Bs 16.335,00", () => {
  const r = computeTotales({ subtotalUsd: 250, descuentoPct: 10, gananciaPct: 20, tasaBs: 60.5 });
  assert.equal(r.totalUsd, 270);
  assert.equal(r.totalBs, 16335);
});
test("cadena completa redondea SOLO al final (123.45, -5%, +15%, tasa 62.37)", () => {
  const r = computeTotales({ subtotalUsd: 123.45, descuentoPct: 5, gananciaPct: 15, tasaBs: 62.37 });
  const raw = 123.45 * 0.95 * 1.15; // 134.869125 (sin redondear intermedio)
  approx(r.totalUsdRaw, raw);
  assert.equal(r.totalUsd, 134.87);
  const expectedBs = roundHalfUp(raw * 62.37, 2);
  assert.equal(r.totalBs, expectedBs);
});
test("descuento 0% y ganancia 0% → total Bs = subtotal × tasa", () => {
  const r = computeTotales({ subtotalUsd: 100, descuentoPct: 0, gananciaPct: 0, tasaBs: 50 });
  assert.equal(r.totalUsd, 100);
  assert.equal(r.totalBs, 5000);
});
test("ganancia interna NO aparece en ningún formateo del PDF", () => {
  // La ganancia está en computeTotales pero formatBs/formatUsd no reciben ganancia.
  const r = computeTotales({ subtotalUsd: 100, descuentoPct: 0, gananciaPct: 30, tasaBs: 50 });
  assert.equal(r.totalUsd, 130);
  assert.equal(formatUsd(r.totalUsd), "130.00");
});

console.log("\nComparación Intl.NumberFormat('es-VE') vs regla custom (equivalencia)");
test("roundBs(x) === Number(Intl redondeado a 2 dec) para casos sensibles", () => {
  const ref = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  for (const x of [0.005, 0.015, 1.005, 2.675, 10.075, -0.005, -1.005, -2.675, 0.1 + 0.2, 123.456]) {
    assert.equal(roundBs(x), Number(ref.format(x).replace(/\./g, "").replace(",", ".")), `x=${x}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.error("FALLARON:", failures.map((f) => f.name).join("; "));
  process.exit(1);
}
