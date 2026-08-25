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
    paddingTop: 8,
  },
  signatureBlock: {
    alignItems: "center",
    marginHorizontal: 12,
    width: 150,
  },
  asset: {
    height: 54,
    objectFit: "contain",
    width: 120,
  },
  signatureLine: {
    borderTopColor: "#64748b",
    borderTopWidth: 0.5,
    color: "#475569",
    fontSize: 7.5,
    marginTop: 3,
    paddingTop: 3,
    textAlign: "center",
    width: 130,
  },
  footer: {
    bottom: 14,
    color: "#64748b",
    fontSize: 7.5,
    left: 36,
    position: "absolute",
    right: 36,
    textAlign: "center",
  },
  pageNumber: {
    marginTop: 2,
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
        {pieDePagina ? <Text>{pieDePagina}</Text> : null}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </>
  );
}
