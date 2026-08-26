import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PDFFooterProps {
  firma: string | null;
  sello: string | null;
  pieDePagina: string | null;
}

const styles = StyleSheet.create({
  signatures: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 76,
    paddingBottom: 12,
    paddingTop: 16,
    gap: 40, // space between firma and sello
  },
  signatureBlock: {
    alignItems: "center",
    marginHorizontal: 12, // fallback for gap
    width: 150,
  },
  asset: {
    height: 54,
    objectFit: "contain",
    width: 120,
  },
  signatureLine: {
    borderTopColor: "#0E9090",
    borderTopWidth: 1,
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    marginTop: 4,
    paddingTop: 4,
    textAlign: "center",
    width: 130,
    textTransform: "uppercase",
  },
  footer: {
    bottom: 16,
    left: 36,
    position: "absolute",
    right: 36,
    textAlign: "center",
  },
  footerText: {
    color: "#475569",
    fontSize: 7,
    marginBottom: 4,
  },
  legalClause: {
    color: "#64748b",
    fontSize: 6.5,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.2,
    marginBottom: 6,
  },
  pageNumber: {
    color: "#0E9090",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
});

export function PDFFooter({ firma, sello, pieDePagina }: PDFFooterProps) {
  return (
    <>
      {firma || sello ? (
        <View wrap={false} style={styles.signatures}>
          {firma ? (
            <View style={styles.signatureBlock}>
              <Image src={firma} style={styles.asset} />
              <Text style={styles.signatureLine}>Firma autorizada</Text>
            </View>
          ) : null}
          {sello ? (
            <View style={styles.signatureBlock}>
              <Image src={sello} style={styles.asset} />
              <Text style={styles.signatureLine}>Sello del laboratorio</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View fixed style={styles.footer}>
        <Text style={styles.legalClause}>
          Los resultados emitidos en este informe tienen validez clínica únicamente bajo la interpretación del médico tratante.
          Este documento es de carácter confidencial y su uso está restringido exclusivamente a fines médicos.
        </Text>
        {pieDePagina ? <Text style={styles.footerText}>{pieDePagina}</Text> : null}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </>
  );
}
