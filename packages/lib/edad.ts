export function calcularEdad(
  fechaNacimiento: Date,
  fechaReferencia: Date = new Date(),
): number {
  const nacimiento = new Date(fechaNacimiento);
  const referencia = new Date(fechaReferencia);

  if (
    Number.isNaN(nacimiento.getTime()) ||
    Number.isNaN(referencia.getTime()) ||
    referencia.getTime() < nacimiento.getTime()
  ) {
    return 0;
  }

  let edad = referencia.getUTCFullYear() - nacimiento.getUTCFullYear();
  const referenciaMes = referencia.getUTCMonth();
  const nacimientoMes = nacimiento.getUTCMonth();

  if (
    referenciaMes < nacimientoMes ||
    (referenciaMes === nacimientoMes && referencia.getUTCDate() < nacimiento.getUTCDate())
  ) {
    edad -= 1;
  }

  return Math.max(0, edad);
}

export type EtapaClinica =
  | "Neonato"
  | "Lactante menor"
  | "Lactante mayor"
  | "Preescolar"
  | "Escolar"
  | "Adolescente"
  | "Adulto"
  | "Adulto mayor";

export interface EdadDesglosada {
  anos: number;
  meses: number;
  dias: number;
  etapa: EtapaClinica;
  textoFormateado: string;
}

const MS_POR_DIA = 86_400_000;

function diasEnMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

function aUtc(fecha: Date): Date {
  return new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate(),
    ),
  );
}

function sumarMeses(fecha: Date, meses: number): Date {
  const resultado = new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1),
  );
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  const ultimoDia = diasEnMes(
    resultado.getUTCFullYear(),
    resultado.getUTCMonth(),
  );
  resultado.setUTCDate(Math.min(fecha.getUTCDate(), ultimoDia));
  return resultado;
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

function clasificarEtapa(
  anos: number,
  meses: number,
  dias: number,
): EtapaClinica {
  if (anos >= 60) return "Adulto mayor";
  if (anos >= 18) return "Adulto";
  if (anos >= 12) return "Adolescente";
  if (anos >= 6) return "Escolar";
  if (anos >= 2) return "Preescolar";
  if (anos >= 1) return "Lactante mayor";
  if (meses >= 1) return "Lactante menor";
  if (dias < 28) return "Neonato";
  return "Lactante menor";
}

function formatearEdad(
  anos: number,
  meses: number,
  dias: number,
): string {
  const partes: string[] = [];

  if (anos > 0) {
    partes.push(`${anos} ${anos === 1 ? "año" : "años"}`);
    if (meses > 0) {
      partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
    }
  } else if (meses > 0) {
    partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
    if (dias > 0) {
      partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
    }
  } else {
    partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
  }

  return partes.join(" ");
}

export function calcularEdadDesglosada(
  fechaNacimiento: Date,
  fechaReferencia: Date = new Date(),
): EdadDesglosada | null {
  const nacimiento = aUtc(new Date(fechaNacimiento));
  const referencia = aUtc(new Date(fechaReferencia));

  if (
    Number.isNaN(nacimiento.getTime()) ||
    Number.isNaN(referencia.getTime()) ||
    referencia.getTime() < nacimiento.getTime()
  ) {
    return null;
  }

  let anos = referencia.getUTCFullYear() - nacimiento.getUTCFullYear();
  let meses = referencia.getUTCMonth() - nacimiento.getUTCMonth();

  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }

  let aniversario = sumarMeses(nacimiento, anos * 12 + meses);

  if (aniversario.getTime() > referencia.getTime()) {
    meses -= 1;
    if (meses < 0) {
      anos -= 1;
      meses += 12;
    }
    aniversario = sumarMeses(nacimiento, anos * 12 + meses);
  }

  const dias = diasEntre(aniversario, referencia);
  const etapa = clasificarEtapa(anos, meses, dias);
  const textoFormateado = formatearEdad(anos, meses, dias);

  return { anos, meses, dias, etapa, textoFormateado };
}
