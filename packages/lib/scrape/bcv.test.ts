import { describe, expect, it } from "vitest";

import { parseBcvHtml } from "./bcv";

describe("parseBcvHtml", () => {
  it("lee la tasa USD y la fecha valor", () => {
    const html = `
      <div id="euro"><strong class="strong-tb">990,12</strong></div>
      <div id="dolar" class="col-sm-12"><span> USD</span>
        <div class="centrado textp"> <strong class="strong-tb">857,00580000</strong>  </div></div>
      Fecha Valor: <span class="date-display-single" content="2026-09-28T00:00:00-04:00">Lunes</span>`;
    const { tasa, fecha } = parseBcvHtml(html);
    expect(tasa).toBeCloseTo(857.0058, 4);
    expect(fecha?.toISOString()).toBe("2026-09-28T04:00:00.000Z");
  });

  it("falla si cambia el HTML", () => {
    expect(() => parseBcvHtml("<html></html>")).toThrow("bcv.parse_error");
  });
});
