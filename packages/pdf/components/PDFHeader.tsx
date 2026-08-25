import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PDFHeaderProps {
  logo: string | null;
  nombre: string;
  rif: string | null;
  direccion: string;
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    borderBottomColor: "#155e75",
    borderBottomWidth: 1.5,
    flexDirection: "row",
    minHeight: 64,
    paddingBottom: 12,
  },
  logo: {
    height: 52,
    marginRight: 14,
    objectFit: "contain",
    width: 72,
  },
  identity: {
    flexGrow: 1,
    flexShrink: 1,
  },
  name: {
    color: "#164e63",
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    lineHeight: 1.2,
  },
  detail: {
    color: "#475569",
    fontSize: 8.5,
    marginTop: 3,
  },
  report: {
    color: "#155e75",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginLeft: 12,
    textAlign: "right",
    textTransform: "uppercase",
    width: 112,
  },
});

export function PDFHeader({ logo, nombre, rif, direccion }: PDFHeaderProps) {
  return (
    <View fixed style={styles.header}>
      {logo ? <Image src={logo} style={styles.logo} /> : null}
      <View style={styles.identity}>
        <Text style={styles.name}>{nombre}</Text>
        {rif ? <Text style={styles.detail}>RIF: {rif}</Text> : null}
        <Text style={styles.detail}>{direccion}</Text>
      </View>
      <Text style={styles.report}>Informe de resultados</Text>
    </View>
  );
}
