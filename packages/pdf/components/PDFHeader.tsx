import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PDFHeaderProps {
  logo: string | null;
  nombre: string;
  rif: string | null;
  colegioBioanalistas?: string | null;
  mpps?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion: string;
  titulo?: string;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#0E9090",
    borderBottomWidth: 3,
    paddingBottom: 10,
    marginBottom: 10,
    minHeight: 64,
  },
  logoContainer: {
    marginRight: 16,
    width: 80,
  },
  logo: {
    height: 60,
    objectFit: "contain",
    width: 80,
  },
  identity: {
    flex: 1,
  },
  name: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    lineHeight: 1.2,
    marginBottom: 4,
  },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },
  detail: {
    color: "#475569",
    fontSize: 8,
  },
  report: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginLeft: 12,
    textAlign: "right",
    textTransform: "uppercase",
    width: 120,
  },
});

export function PDFHeader({
  logo,
  nombre,
  rif,
  colegioBioanalistas,
  mpps,
  telefono,
  email,
  direccion,
  titulo = "Informe de resultados",
}: PDFHeaderProps) {
  return (
    <View fixed style={styles.header}>
      {logo ? (
        <View style={styles.logoContainer}>
          <Image src={logo} style={styles.logo} />
        </View>
      ) : null}
      <View style={styles.identity}>
        <Text style={styles.name}>{nombre}</Text>
        <View style={styles.detailsRow}>
          {rif ? <Text style={styles.detail}>RIF: {rif}</Text> : null}
          {colegioBioanalistas ? (
            <Text style={styles.detail}>Colegio de Bioanalistas: {colegioBioanalistas}</Text>
          ) : null}
          {mpps ? <Text style={styles.detail}>MPPS: {mpps}</Text> : null}
        </View>
        <View style={styles.detailsRow}>
          {telefono ? <Text style={styles.detail}>Tlf: {telefono}</Text> : null}
          {email ? <Text style={styles.detail}>Email: {email}</Text> : null}
        </View>
        <Text style={styles.detail}>{direccion}</Text>
      </View>
      <Text style={styles.report}>{titulo}</Text>
    </View>
  );
}
