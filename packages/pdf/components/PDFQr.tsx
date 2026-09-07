import { Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { generarQrPath } from "../qr";
import { PDF_COLORS, PDF_FONT } from "../theme";

export interface PDFQrProps {
  /** URL absoluta de la vista de verificación (`/v/{slug}`). */
  url: string;
  /** Lado del QR en puntos PDF. */
  lado?: number;
  leyenda?: string;
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    width: 96,
  },
  leyenda: {
    color: PDF_COLORS.muted,
    fontFamily: PDF_FONT.regular,
    fontSize: 6,
    marginTop: 3,
    textAlign: "center",
  },
});

/**
 * QR de verificación del informe. Apunta a `/v/{slug}`, que confirma que el
 * documento salió de este laboratorio sin mostrar ningún resultado.
 *
 * Si el QR no se puede generar no se rompe el PDF: el informe vale igual sin
 * el recuadro de verificación.
 */
export function PDFQr({ url, lado = 72, leyenda = "Verificá este informe" }: PDFQrProps) {
  let qr: { d: string; size: number };
  try {
    qr = generarQrPath(url);
  } catch {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <Svg width={lado} height={lado} viewBox={`0 0 ${qr.size} ${qr.size}`}>
        <Path d={qr.d} fill={PDF_COLORS.ink} />
      </Svg>
      <Text style={styles.leyenda}>{leyenda}</Text>
    </View>
  );
}
