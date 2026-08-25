/**
 * Sistema de toasts unificado de LabSystem.
 *
 * La spec (F4.hardening.T02) sugiere reusar `sonner` o shadcn toast, pero
 * ninguno está instalado en el monorepo (verificación hecha al momento de
 * implementar). Para no introducir dependencias ni tocar el layout raíz,
 * este helper es autónomo: un singleton que inyecta los toasts en
 * `document.body` con estilos inline sobre las CSS variables del tema.
 *
 * API pública: `notifySuccess`, `notifyError`, `notifyInfo` (+ `clearToasts`).
 *
 * `notifyError` acepta CUALQUIER error (string, Error, ConvexError, PG) y lo
 * pasa por `@labo/lib/error-messages` → mensaje humano. Además, si el error
 * es de sesión (401), redirige a `/login` automáticamente.
 */

import { handleRequestError } from "@labo/lib/error-messages";

export type ToastKind = "success" | "error" | "info";

export interface ToastOptions {
  /** Duración visible en ms. Por defecto: success/info 4000, error 8000. */
  duration?: number;
  /** Callback al descartar el toast (auto o manual). */
  onDismiss?: () => void;
}

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 8000;
const EXIT_ANIMATION_MS = 200;

const ACCENT_BY_KIND: Readonly<Record<ToastKind, string>> = {
  success: "#16a34a",
  error: "#dc2626",
  info: "#2563eb",
};

const ROLE_BY_KIND: Readonly<Record<ToastKind, "status" | "alert">> = {
  success: "status",
  error: "alert",
  info: "status",
};

let container: HTMLDivElement | null = null;
let toastCounter = 0;

function getContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;

  container = document.createElement("div");
  const style = container.style;
  style.position = "fixed";
  style.bottom = "1rem";
  style.right = "1rem";
  style.zIndex = "9999";
  style.display = "flex";
  style.flexDirection = "column";
  style.alignItems = "flex-end";
  style.gap = "0.5rem";
  style.maxWidth = "360px";
  style.pointerEvents = "none";
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

function iconSvg(kind: ToastKind, color: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (kind === "success") {
    path.setAttribute("d", "M22 11.08V12a10 10 0 1 1-5.93-9.14");
    svg.appendChild(path);
    const poly = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline",
    );
    poly.setAttribute("points", "22 4 12 14.01 9 11.01");
    svg.appendChild(poly);
  } else if (kind === "error") {
    path.setAttribute("d", "M12 9v4");
    svg.appendChild(path);
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    svg.appendChild(circle);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "line");
    dot.setAttribute("x1", "12");
    dot.setAttribute("y1", "16");
    dot.setAttribute("x2", "12.01");
    dot.setAttribute("y2", "16");
    svg.appendChild(dot);
  } else {
    path.setAttribute("d", "M12 16v-4");
    svg.appendChild(path);
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    svg.appendChild(circle);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "line");
    dot.setAttribute("x1", "12");
    dot.setAttribute("y1", "8");
    dot.setAttribute("x2", "12.01");
    dot.setAttribute("y2", "8");
    svg.appendChild(dot);
  }
  return svg;
}

function buildToast(
  kind: ToastKind,
  message: string,
  options?: ToastOptions,
): HTMLDivElement {
  const accent = ACCENT_BY_KIND[kind];
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.alignItems = "flex-start";
  el.style.gap = "0.75rem";
  el.style.padding = "0.75rem 1rem";
  el.style.background = "hsl(var(--card, 0 0% 100%))";
  el.style.color = "hsl(var(--foreground, 222.2 84% 4.9%))";
  el.style.border = "1px solid hsl(var(--border, 214.3 31.8% 91.4%))";
  el.style.borderLeft = `3px solid ${accent}`;
  el.style.borderRadius = "var(--radius, 0.5rem)";
  el.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.12)";
  el.style.pointerEvents = "auto";
  el.style.opacity = "0";
  el.style.transform = "translateY(8px)";
  el.style.transition = `opacity 150ms ease-out, transform 150ms ease-out`;
  el.setAttribute("role", ROLE_BY_KIND[kind]);
  el.id = `labo-toast-${++toastCounter}`;

  const icon = iconSvg(kind, accent);
  icon.style.flexShrink = "0";
  icon.style.marginTop = "2px";
  el.appendChild(icon);

  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.fontSize = "14px";
  body.style.lineHeight = "1.45";
  body.style.wordBreak = "break-word";
  body.textContent = message;
  el.appendChild(body);

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar notificación");
  close.style.background = "transparent";
  close.style.border = "none";
  close.style.cursor = "pointer";
  close.style.color = "hsl(var(--muted-foreground, 215.4 16.3% 46.9%))";
  close.style.fontSize = "18px";
  close.style.lineHeight = "1";
  close.style.padding = "0.1rem 0 0 0.25rem";
  close.textContent = "×";
  close.addEventListener("click", () => dismiss(el, options));
  el.appendChild(close);

  return el;
}

function dismiss(el: HTMLDivElement, options?: ToastOptions): void {
  if (!document.body.contains(el)) return;
  el.style.opacity = "0";
  el.style.transform = "translateY(8px)";
  window.setTimeout(() => {
    el.remove();
    options?.onDismiss?.();
  }, EXIT_ANIMATION_MS);
}

function showToast(
  kind: ToastKind,
  message: string,
  options?: ToastOptions,
): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const el = buildToast(kind, message, options);
  getContainer().appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  const duration =
    options?.duration ??
    (kind === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
  if (duration > 0) {
    window.setTimeout(() => dismiss(el, options), duration);
  }
}

/**
 * Notificación de error. Acepta un `unknown` (string, Error, ConvexError,
 * error PG, respuesta HTTP) y lo humaniza con `@labo/lib/error-messages`.
 * Errores de sesión (401) redirigen a `/login`.
 */
export function notifyError(error: unknown, options?: ToastOptions): void {
  const message = handleRequestError(error);
  showToast("error", message, options);
}

/** Notificación de éxito con mensaje legible. */
export function notifySuccess(message: string, options?: ToastOptions): void {
  showToast("success", message, options);
}

/** Notificación informativa con mensaje legible. */
export function notifyInfo(message: string, options?: ToastOptions): void {
  showToast("info", message, options);
}

/** Descarta todos los toasts visibles (útil en tests / logout). */
export function clearToasts(): void {
  if (typeof document === "undefined") return;
  const root = container ?? getContainer();
  for (const child of Array.from(root.children)) {
    child.remove();
  }
}
