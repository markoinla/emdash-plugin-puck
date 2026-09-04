/**
 * The full-screen editor overlay. High enough to clear the EmDash admin's own
 * chrome and any Kumo overlay; the ai-chat plugin's drawer sits just below.
 */
export const OVERLAY_Z_INDEX = 2147483000;

/** The media picker modal. Clears the editor overlay so it sits over Puck. */
export const MODAL_Z_INDEX = 2147483200;

/**
 * Link a stylesheet into the admin document once.
 *
 * Idempotent, and a no-op outside a browser: the admin entry is imported by
 * EmDash's generated registry, which is client-only, but a stray server import
 * must not touch `document`.
 */
export function ensureStylesheet(href: string): void {
	if (typeof document === "undefined") return;
	if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	document.head.appendChild(link);
}
