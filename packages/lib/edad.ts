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
