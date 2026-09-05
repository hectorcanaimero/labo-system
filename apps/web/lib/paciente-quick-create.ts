import type { PacienteFormValues, PacienteSerializable } from "@/app/(app)/pacientes/PacienteFormDialog";
import type { PacienteAutocompleteItem } from "@labo/ui/pacientes/PacienteAutocomplete";

/**
 * Alta rápida de paciente desde un buscador: lo que la persona escribió se
 * convierte en valores iniciales del diálogo. Si parece una cédula va a
 * `cedula`; si no, la primera palabra es el nombre y el resto el apellido.
 */
export function valoresInicialesDesdeBusqueda(query: string): Partial<PacienteFormValues> {
  const q = query.trim();
  if (!q) return {};
  if (/^[VEve]?[-\s.]*\d[\d.\s-]*$/.test(q)) return { cedula: q.toUpperCase() };
  const [nombre, ...resto] = q.split(/\s+/);
  return { nombre: nombre ?? "", apellido: resto.join(" ") };
}

/** El paciente recién guardado, con la forma que espera el autocomplete. */
export function aItemAutocomplete(paciente: PacienteSerializable): PacienteAutocompleteItem {
  return {
    id: paciente.id,
    nombre: paciente.nombre,
    apellido: paciente.apellido,
    cedula: paciente.cedula,
    fecha_nacimiento: paciente.fecha_nacimiento,
  };
}
