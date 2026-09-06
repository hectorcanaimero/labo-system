import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

import { PDF_COLORS, PDF_FONT, assetOrNull } from "../theme";

export interface PDFHeaderProps {
  logo: string | null;
  nombre: string;
  rif: string | null;
  colegioBioanalistas?: string | null;
  mpps?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion: string;
  /** Título del documento (columna derecha). */
  titulo: string;
  /** Líneas cortas bajo el título: número, fecha, etc. */
  meta?: ReadonlyArray<{ label: string; value: string }>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: PDF_COLORS.brand,
    borderBottomWidth: 2,
    paddingBottom: 10,
    marginBottom: 12,
    minHeight: 68,
  },
  logoBox: {
    width: 74,
    height: 62,
    marginRight: 14,
    justifyContent: "center",
  },
  logo: {
    width: 74,
    height: 62,
    objectFit: "contain",
  },
  identity: {
    flex: 1,
    justifyContent: "center",
  },
  name: {
    color: PDF_COLORS.brand,
    fontFamily: PDF_FONT.bold,
    fontSize: 15,
    lineHeight: 1.2,
  },
  credentials: {
    color: PDF_COLORS.text,
    fontFamily: PDF_FONT.bold,
    fontSize: 7.5,
    marginTop: 3,
  },
  detail: {
    color: PDF_COLORS.muted,
    fontSize: 7.5,
    marginTop: 2,
  },
  titleBox: {
    marginLeft: 12,
    minWidth: 150,
    alignItems: "flex-end",
  },
  title: {
    color: PDF_COLORS.brand,
    fontFamily: PDF_FONT.bold,
    fontSize: 13,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 3,
  },
  metaLabel: {
    color: PDF_COLORS.muted,
    fontSize: 7.5,
    marginRight: 4,
  },
  metaValue: {
    color: PDF_COLORS.ink,
    fontFamily: PDF_FONT.bold,
    fontSize: 7.5,
  },
});

function joinPresent(parts: ReadonlyArray<string | null | undefined>, sep = "  ·  "): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep);
}

/**
 * Cabecera fija (se repite en cada página): logo de la configuración a la
 * izquierda, identidad y credenciales del laboratorio al centro, y el título
 * del documento con sus datos clave a la derecha.
 */
export function PDFHeader({
  logo,
  nombre,
  rif,
  colegioBioanalistas,
  mpps,
  telefono,
  email,
  direccion,
  titulo,
  meta = [],
}: PDFHeaderProps) {
  const logoSrc = assetOrNull(logo);
  const credenciales = joinPresent([
    colegioBioanalistas ? `C.B. ${colegioBioanalistas.replace(/^c\.?b\.?\s*/i, "")}` : null,
    mpps ? `MPPS ${mpps.replace(/^mpps\s*/i, "")}` : null,
    rif ? `RIF ${rif}` : null,
  ]);
  const contacto = joinPresent([telefono ? `Tlf. ${telefono}` : null, email]);

  return (
    <View fixed style={styles.header}>
      {logoSrc ? (
        <View style={styles.logoBox}>
          <Image src={logoSrc} style={styles.logo} />
        </View>
      ) : null}
      <View style={styles.identity}>
        <Text style={styles.name}>{nombre}</Text>
        {credenciales ? <Text style={styles.credentials}>{credenciales}</Text> : null}
        {direccion.trim() ? <Text style={styles.detail}>{direccion}</Text> : null}
        {contacto ? <Text style={styles.detail}>{contacto}</Text> : null}
      </View>
      <View style={styles.titleBox}>
        <Text style={styles.title}>{titulo}</Text>
        {meta.map((item) => (
          <View key={item.label} style={styles.metaRow}>
            <Text style={styles.metaLabel}>{item.label}</Text>
            <Text style={styles.metaValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
