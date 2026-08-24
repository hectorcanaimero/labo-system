import { Readable, Transform } from 'node:stream';

import { convexServerClient } from '@labo/pdf/convexServerClient';
import { Document, Image, Page, StyleSheet, Text, View, renderToStream } from '@react-pdf/renderer';
import { makeFunctionReference } from 'convex/server';
import type { NextRequest } from 'next/server';
import { createElement } from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASSET_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_ASSET_BYTES = 5 * 1_024 * 1_024;
const DEFAULT_AUTH_COOKIE_NAME = '__convexAuthJWT';
const EMBEDDED_LOGO_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

type PdfLine = Readonly<{
  result: string;
  test: string;
  unit: string;
}>;

type PdfPayload = Readonly<{
  assetUrl?: string;
  laboratory: string;
  lines: readonly PdfLine[];
  patient: string;
  reportId: string;
}>;

type AssetCacheEntry = Readonly<{
  dataUri: string;
  expiresAt: number;
}>;

type AssetResult = Readonly<{
  cacheStatus: 'embedded' | 'hit' | 'miss';
  dataUri: string;
}>;

const assetCache = new Map<string, AssetCacheEntry>();

const styles = StyleSheet.create({
  page: {
    color: '#172033',
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingBottom: 38,
    paddingHorizontal: 40,
    paddingTop: 34,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#2557a7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: 20,
    paddingBottom: 12,
  },
  logo: {
    height: 48,
    marginRight: 14,
    objectFit: 'contain',
    width: 48,
  },
  laboratory: {
    color: '#173f7a',
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
  },
  subtitle: {
    color: '#60708c',
    fontSize: 9,
    marginTop: 3,
  },
  metadata: {
    backgroundColor: '#f2f6fc',
    borderRadius: 3,
    marginBottom: 18,
    padding: 12,
  },
  metadataLine: {
    marginBottom: 4,
  },
  tableHeader: {
    backgroundColor: '#2557a7',
    color: '#ffffff',
    flexDirection: 'row',
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  row: {
    borderBottomColor: '#dce4ef',
    borderBottomWidth: 0.5,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  testColumn: {
    width: '52%',
  },
  resultColumn: {
    width: '28%',
  },
  unitColumn: {
    width: '20%',
  },
  footer: {
    bottom: 18,
    color: '#7b879b',
    fontSize: 8,
    left: 40,
    position: 'absolute',
    right: 40,
    textAlign: 'center',
  },
});

const hardcodedPayload: PdfPayload = {
  laboratory: 'Laboratorio Clínico Demo',
  patient: 'María Pérez',
  reportId: 'SPIKE-S3-001',
  lines: [
    { test: 'Hemoglobina', result: '13.8', unit: 'g/dL' },
    { test: 'Hematocrito', result: '41.2', unit: '%' },
    { test: 'Leucocitos', result: '6.90', unit: '10³/µL' },
    { test: 'Plaquetas', result: '252', unit: '10³/µL' },
    { test: 'Glucosa', result: '92', unit: 'mg/dL' },
    { test: 'Creatinina', result: '0.82', unit: 'mg/dL' },
    { test: 'Urea', result: '28', unit: 'mg/dL' },
    { test: 'Colesterol total', result: '176', unit: 'mg/dL' },
    { test: 'HDL', result: '58', unit: 'mg/dL' },
    { test: 'LDL', result: '101', unit: 'mg/dL' },
    { test: 'Triglicéridos', result: '84', unit: 'mg/dL' },
    { test: 'TGO / AST', result: '22', unit: 'U/L' },
    { test: 'TGP / ALT', result: '19', unit: 'U/L' },
    { test: 'Bilirrubina total', result: '0.7', unit: 'mg/dL' },
    { test: 'Proteínas totales', result: '7.1', unit: 'g/dL' },
    { test: 'Albúmina', result: '4.3', unit: 'g/dL' },
    { test: 'Sodio', result: '139', unit: 'mmol/L' },
    { test: 'Potasio', result: '4.2', unit: 'mmol/L' },
  ],
};

function isPdfLine(value: unknown): value is PdfLine {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const line = value as Record<string, unknown>;
  return (
    typeof line.test === 'string' &&
    typeof line.result === 'string' &&
    typeof line.unit === 'string'
  );
}

function isPdfPayload(value: unknown): value is PdfPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.laboratory === 'string' &&
    typeof payload.patient === 'string' &&
    typeof payload.reportId === 'string' &&
    Array.isArray(payload.lines) &&
    payload.lines.every(isPdfLine) &&
    (payload.assetUrl === undefined || typeof payload.assetUrl === 'string')
  );
}

function readSessionToken(request: NextRequest): string | undefined {
  const configuredCookieName = process.env.CONVEX_AUTH_COOKIE_NAME?.trim();
  const cookieName = configuredCookieName || DEFAULT_AUTH_COOKIE_NAME;
  return request.cookies.get(cookieName)?.value;
}

async function loadPdfPayload(token: string | undefined): Promise<{
  payload: PdfPayload;
  source: 'convex' | 'hardcoded';
}> {
  const queryName = process.env.PDF_SPIKE_CONVEX_QUERY?.trim();

  if (!token || !queryName) {
    return { payload: hardcodedPayload, source: 'hardcoded' };
  }

  const query = makeFunctionReference<'query', Record<string, never>, unknown>(queryName);
  const payload = await convexServerClient(token).query(query, {});

  if (!isPdfPayload(payload)) {
    throw new Error(`Convex query ${queryName} returned an invalid PDF payload`);
  }

  return { payload, source: 'convex' };
}

function bytesToPngDataUri(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

async function loadRemotePng(url: string): Promise<AssetResult> {
  const now = Date.now();
  const cached = assetCache.get(url);

  if (cached && cached.expiresAt > now) {
    return { cacheStatus: 'hit', dataUri: cached.dataUri };
  }

  if (cached) {
    assetCache.delete(url);
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Remote PNG request failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.split(';', 1)[0];
  if (contentType !== 'image/png') {
    throw new Error(`Remote asset must be image/png, received ${contentType ?? 'unknown'}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_ASSET_BYTES) {
    throw new Error(`Remote PNG exceeds ${MAX_ASSET_BYTES} bytes`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`Remote PNG exceeds ${MAX_ASSET_BYTES} bytes`);
  }

  const dataUri = bytesToPngDataUri(bytes);
  assetCache.set(url, { dataUri, expiresAt: now + ASSET_CACHE_TTL_MS });
  return { cacheStatus: 'miss', dataUri };
}

function resolveAssetUrl(request: NextRequest, payload: PdfPayload): string | undefined {
  const environmentAssetUrl = process.env.PDF_SPIKE_ASSET_URL?.trim();
  const allowDevelopmentOverride = process.env.NODE_ENV !== 'production';
  const requestAssetUrl = allowDevelopmentOverride
    ? request.nextUrl.searchParams.get('assetUrl')?.trim()
    : undefined;

  return requestAssetUrl || payload.assetUrl || environmentAssetUrl || undefined;
}

async function loadLogo(request: NextRequest, payload: PdfPayload): Promise<AssetResult> {
  const assetUrl = resolveAssetUrl(request, payload);
  const shouldInvalidate = request.nextUrl.searchParams.get('invalidateAsset') === '1';

  if (shouldInvalidate) {
    if (assetUrl) {
      assetCache.delete(assetUrl);
    } else {
      assetCache.clear();
    }
  }

  if (!assetUrl) {
    return { cacheStatus: 'embedded', dataUri: EMBEDDED_LOGO_DATA_URI };
  }

  return loadRemotePng(assetUrl);
}

function renderTable(lines: readonly PdfLine[]) {
  return createElement(
    View,
    null,
    createElement(
      View,
      { style: styles.tableHeader },
      createElement(Text, { style: styles.testColumn }, 'Examen'),
      createElement(Text, { style: styles.resultColumn }, 'Resultado'),
      createElement(Text, { style: styles.unitColumn }, 'Unidad')
    ),
    ...lines.map((line) =>
      createElement(
        View,
        { key: line.test, style: styles.row },
        createElement(Text, { style: styles.testColumn }, line.test),
        createElement(Text, { style: styles.resultColumn }, line.result),
        createElement(Text, { style: styles.unitColumn }, line.unit)
      )
    )
  );
}

function renderPage(
  payload: PdfPayload,
  logoDataUri: string,
  pageNumber: number,
  lines: readonly PdfLine[]
) {
  return createElement(
    Page,
    { key: pageNumber, size: 'A4', style: styles.page },
    createElement(
      View,
      { style: styles.header },
      createElement(Image, { src: logoDataUri, style: styles.logo }),
      createElement(
        View,
        null,
        createElement(Text, { style: styles.laboratory }, payload.laboratory),
        createElement(Text, { style: styles.subtitle }, 'Informe de resultados · Spike S3')
      )
    ),
    createElement(
      View,
      { style: styles.metadata },
      createElement(Text, { style: styles.metadataLine }, `Paciente: ${payload.patient}`),
      createElement(Text, { style: styles.metadataLine }, `Informe: ${payload.reportId}`),
      createElement(Text, null, `Página: ${pageNumber} de 2`)
    ),
    renderTable(lines),
    createElement(
      Text,
      { fixed: true, style: styles.footer },
      'Documento generado con @react-pdf/renderer en Next.js Node runtime'
    )
  );
}

function renderPdfDocument(payload: PdfPayload, logoDataUri: string) {
  const midpoint = Math.ceil(payload.lines.length / 2);
  return createElement(
    Document,
    {
      author: 'LabSystem',
      subject: 'Benchmark @react-pdf server-side',
      title: payload.reportId,
    },
    renderPage(payload, logoDataUri, 1, payload.lines.slice(0, midpoint)),
    renderPage(payload, logoDataUri, 2, payload.lines.slice(midpoint))
  );
}

function meterPdfStream(stream: Readable, startedAt: number): Transform {
  let peakRssBytes = process.memoryUsage().rss;
  const meteredStream = new Transform({
    transform(chunk, _encoding, callback) {
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      callback(null, chunk);
    },
  });

  meteredStream.once('end', () => {
    const durationMs = performance.now() - startedAt;
    console.info(
      JSON.stringify({
        metric: 'pdf_render_duration_ms',
        durationMs: Number(durationMs.toFixed(2)),
        peakRssBytes,
      })
    );
  });
  stream.pipe(meteredStream);
  return meteredStream;
}

export async function GET(request: NextRequest): Promise<Response> {
  const startedAt = performance.now();

  try {
    const token = readSessionToken(request);
    const { payload, source } = await loadPdfPayload(token);
    const logo = await loadLogo(request, payload);
    const nodeStream = (await renderToStream(renderPdfDocument(payload, logo.dataUri))) as Readable;
    const meteredStream = meterPdfStream(nodeStream, startedAt);
    const webStream = Readable.toWeb(meteredStream) as ReadableStream<Uint8Array>;
    const setupDurationMs = performance.now() - startedAt;

    return new Response(webStream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline; filename="react-pdf-spike.pdf"',
        'Content-Type': 'application/pdf',
        'Server-Timing': `pdf-setup;dur=${setupDurationMs.toFixed(2)}`,
        'X-PDF-Asset-Cache': logo.cacheStatus,
        'X-PDF-Convex-Source': source,
      },
    });
  } catch (error) {
    console.error('PDF spike failed', error);
    return Response.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
