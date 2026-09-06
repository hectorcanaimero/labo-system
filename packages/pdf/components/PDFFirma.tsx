import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

import { PDF_COLORS, PDF_FONT, assetOrNull } from "../theme";

export interface PDFFirmaProps {
  /** Data URI de la firma (config.firma_object_key), o null. */
  firma: string | null;
  /** Data URI del sello (config.sello_object_key), o null. */
  sello: string | null;
  /** Nombre del profesional que firma (config.nombre). */
  nombre: string;
  colegioBioanalistas?: string | null;
  mpps?: string | null;
  /** Texto bajo el nombre. Default: "Bioanalista". */
  cargo?: string;
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    marginTop: 22,
    paddingTop: 4,
  },
  sello: {
    width: 92,
    height: 92,
    objectFit: "contain",
    marginRight: -18, // se solapa un poco con la firma, como en papel
    marginBottom: 18,
    opacity: 0.92,
  },
  block: {
    width: 200,
    alignItems: "center",
  },
  firma: {
    width: 150,
    height: 58,
    objectFit: "contain",
    marginBottom: -6, // la firma "pisa" la línea
  },
  firmaVacia: {
    height: 40,
  },
  line: {
    borderTopColor: PDF_COLORS.ink,
    borderTopWidth: 0.8,
    width: 190,
    paddingTop: 5,
    alignItems: "center",
  },
  nombre: {
    color: PDF_COLORS.ink,
    fontFamily: PDF_FONT.bold,
    fontSize: 8.5,
    textAlign: "center",
  },
  cargo: {
    color: PDF_COLORS.muted,
    fontSize: 7.5,
    marginTop: 1,
    textAlign: "center",
  },
  credenciales: {
    color: PDF_COLORS.muted,
    fontSize: 7,
    marginTop: 1,
    textAlign: "center",
  },
});

/**
 * Bloque de firma y sello del laboratorio, al cierre del documento (no es
 * fijo: va después del contenido, en la última página). La firma cargada en
 * la configuración se dibuja sobre la línea; debajo van nombre, cargo y
 * credenciales. El sello va a la izquierda, ligeramente solapado.
 *
 * Si no hay imagen de firma, igual se deja la línea para firmar a mano.
 */
export function PDFFirma({
  firma,
  sello,
  nombre,
  colegioBioanalistas,
  mpps,
  cargo = "Bioanalista",
}: PDFFirmaProps) {
  const firmaSrc = assetOrNull(firma);
  const selloSrc = assetOrNull(sello);
  const credenciales = [
    colegioBioanalistas ? `C.B. ${colegioBioanalistas.replace(/^c\.?b\.?\s*/i, "")}` : null,
    mpps ? `MPPS ${mpps.replace(/^mpps\s*/i, "")}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <View wrap={false} style={styles.wrapper}>
      {selloSrc ? <Image src={selloSrc} style={styles.sello} /> : null}
      <View style={styles.block}>
        {firmaSrc ? (
          <Image src={firmaSrc} style={styles.firma} />
        ) : (
          <View style={styles.firmaVacia} />
        )}
        <View style={styles.line}>
          <Text style={styles.nombre}>{nombre}</Text>
          <Text style={styles.cargo}>{cargo}</Text>
          {credenciales ? <Text style={styles.credenciales}>{credenciales}</Text> : null}
        </View>
      </View>
    </View>
  );
}
