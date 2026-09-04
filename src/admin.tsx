/**
 * emdash-plugin-puck: the admin half.
 *
 * `createPuckAdmin()` builds the field widget map the EmDash admin looks up as
 * `pluginAdmins["puck"].fields["canvas"]` when a schema field declares
 * `widget: "puck:canvas"`. Your admin entry is one line:
 *
 *     export const { fields } = createPuckAdmin({ config });
 *
 * The widget is deliberately small in the content form: a label, a one-line
 * summary of the stored layout, and an "Edit layout" button. The actual
 * editing happens in a full-screen overlay portalled into `document.body`, so
 * Puck escapes the content form's grid, sticky headers and `overflow: hidden`
 * ancestors.
 */

/*
 * STYLESHEETS ARE LINKED BY URL AT RUNTIME, NOT IMPORTED.
 *
 * A static `import "@puckeditor/core/puck.css"` puts the sheet in this
 * module's graph, and Astro emits a route's <link> tags from the whole client
 * chunk graph reachable from that route. The admin entry that imports this
 * module also imports your Puck config, which your public island imports too,
 * so the editor's 88KB of admin chrome ended up linked into every public page.
 * The `?url` form emits the same asset but keeps it out of every route's style
 * graph, so only the admin fetches it. It stays a real document stylesheet,
 * which is what Puck's `syncHostStyles` copies into the canvas iframe; an
 * inlined <style> or a `?raw` string would not be.
 *
 * `no-external.css` rather than `puck.css`: the default sheet's first line is
 * `@import "https://rsms.me/inter/inter.css"`, the worst case for the critical
 * path (the browser cannot discover that URL until the parent sheet is parsed,
 * then opens a fresh DNS + TLS connection to a third-party host). Measured at
 * 850-970ms of render blocking. `no-external.css` is the same bundle without
 * that line, and theme.css points `--puck-font-family` at the admin's own face,
 * so Inter was never rendering anything anyway.
 */
import puckCssHref from "@puckeditor/core/no-external.css?url";
import themeCssHref from "./theme.css?url";

import { createUsePuck, Puck } from "@puckeditor/core";
import type { Config, Data, Overrides, Plugin } from "@puckeditor/core";
import * as React from "react";
import { createPortal } from "react-dom";

import { createBlockPanel, type BlockPanelOptions, type PreviewStyles } from "./block-panel";
import { EMPTY_DATA, isPuckData, sectionNames } from "./shared/data";
import { ensureStylesheet, OVERLAY_Z_INDEX } from "./shared/dom";

export type { BlockPanelOptions, PreviewStyles };
export { createBlockPanel };

export type AnyConfig = Config<any, any, any>;

/**
 * Props the EmDash admin passes to every trusted plugin field widget.
 * Mirrors the contract in ContentEditor's FieldRenderer.
 */
export interface FieldWidgetProps {
	/** Current field value (raw JSON from the content record). */
	value: unknown;
	/** Commit a new value for the field. */
	onChange: (value: unknown) => void;
	/** Field label from the schema. */
	label: string;
	/** HTML id the admin allocated for this field. */
	id: string;
	/** Whether the schema marks this field required. */
	required?: boolean;
	/** Widget options from the seed field definition. */
	options?: Array<{ value: string; label: string }> | Record<string, unknown>;
	/** Distraction-free mode: hide the label, keep the control. */
	minimal?: boolean;
}

export interface CanvasStyles {
	/**
	 * Stylesheet URLs `<link>`ed into the editor canvas iframe.
	 *
	 * Puck's `syncHostStyles` copies only the ADMIN document's stylesheets into
	 * the canvas, so your site's CSS is never there on its own. If your blocks
	 * are Tailwind, this must include the site's COMPILED Tailwind entry: the
	 * admin is itself a Tailwind app, so utilities the two builds share resolve
	 * while every site-specific one silently does not.
	 */
	stylesheets?: string[];
	/** Raw CSS injected into the canvas after the links (design tokens, base styles). */
	css?: string;
	/**
	 * Pin the canvas document's `color-scheme`. Needed when the site is
	 * light-only but its tokens use `light-dark()`, or the canvas follows the
	 * admin's dark mode onto a surface the sections were never designed for.
	 */
	colorScheme?: "light" | "dark";
	/**
	 * Undo Puck's pinning of the canvas body. Puck sets `overflow: hidden` plus
	 * a fixed pixel height INLINE on the iframe's <body>, and the frame is
	 * `height: 100%`, so a document taller than the viewport cannot be scrolled
	 * and the Outline panel becomes the only way to move around it. Default true.
	 */
	unlockScroll?: boolean;
}

export interface CanvasLabels {
	edit: string;
	save: string;
	cancel: string;
	unsaved: string;
	/** The `window.confirm` text shown when closing an editor with unsaved changes. */
	discard: string;
	empty: string;
	/** "1 section" / "3 sections" */
	count: (n: number) => string;
}

export interface PuckCanvasOptions {
	/** Your Puck config. The same object your public route renders with. */
	config: AnyConfig;
	/** Document to open when the field is empty or not recognisably Puck data. */
	emptyData?: Data;
	/**
	 * Puck plugins to mount in the editor. Build them at MODULE scope: a plugin
	 * object created inside a component gets a new identity every render, and
	 * Puck remounts it (for the AI chat, that throws away the conversation).
	 * See `puckAi()` in `emdash-plugin-puck/ai`.
	 */
	plugins?: Plugin[];
	/**
	 * Transform the config at open time, given the document being opened. Used
	 * by `puckAi()` to merge in component types that design mode stored inside
	 * the document.
	 */
	resolveConfig?: (config: AnyConfig, data: Data) => AnyConfig;
	/** Styles for the editor canvas iframe. */
	canvas?: CanvasStyles;
	/**
	 * The searchable block panel with hover previews. Defaults to the canvas
	 * styles. Pass `false` to keep Puck's stock component drawer.
	 */
	blockPanel?: false | (PreviewStyles & Pick<BlockPanelOptions, "previewWidth" | "previewScale">);
	/**
	 * Stylesheets linked into the ADMIN document when the widget module loads.
	 * Defaults to Puck's `no-external.css` and this package's `theme.css`, which
	 * aliases Puck's tokens onto the EmDash admin's so the editor follows the
	 * admin's palette and light/dark mode.
	 */
	adminStylesheets?: string[];
	/** Puck overrides merged over this widget's own (yours win). */
	overrides?: Partial<Overrides>;
	labels?: Partial<CanvasLabels>;
}

const DEFAULT_LABELS: CanvasLabels = {
	edit: "Edit layout",
	save: "Save layout",
	cancel: "Cancel",
	unsaved: "Unsaved changes",
	discard: "Discard your unsaved layout changes?",
	empty: "No sections yet",
	count: (n) => `${n} section${n === 1 ? "" : "s"}`,
};

/**
 * Inline styles for the widget chrome.
 *
 * THE COLOURS ARE KUMO TOKENS. This overlay portals into `document.body`,
 * which sits inside the admin's `<html data-mode>`, and the admin's stylesheet
 * declares the whole `--*-kumo-*` set on `:root,:host`, so the tokens resolve
 * here with no plumbing. Every one is a `light-dark()` pair keyed off
 * `color-scheme`, which the admin flips with its mode, so ONE declaration
 * covers light and dark. The `var(--token, #fallback)` forms carry a fallback
 * only where losing the token would make text unreadable.
 */
const styles = {
	resting: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "1rem",
		padding: "0.75rem",
		border: "1px solid var(--color-kumo-line)",
		borderRadius: "0.5rem",
		background: "transparent",
	} satisfies React.CSSProperties,
	summary: {
		display: "flex",
		flexDirection: "column",
		gap: "0.125rem",
		minWidth: 0,
	} satisfies React.CSSProperties,
	summaryPrimary: {
		fontSize: "0.875rem",
		fontWeight: 500,
	} satisfies React.CSSProperties,
	summarySecondary: {
		fontSize: "0.75rem",
		color: "var(--text-color-kumo-subtle, #6b7280)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies React.CSSProperties,
	editButton: {
		flexShrink: 0,
		padding: "0.375rem 0.75rem",
		fontSize: "0.8125rem",
		fontWeight: 500,
		fontFamily: "inherit",
		color: "inherit",
		background: "transparent",
		border: "1px solid var(--color-kumo-interact)",
		borderRadius: "0.375rem",
		cursor: "pointer",
	} satisfies React.CSSProperties,
	overlay: {
		position: "fixed",
		inset: 0,
		zIndex: OVERLAY_Z_INDEX,
		display: "flex",
		flexDirection: "column",
		background: "var(--color-kumo-canvas, #ffffff)",
		color: "var(--text-color-kumo-default, #111827)",
	} satisfies React.CSSProperties,
	editor: {
		flex: 1,
		minHeight: 0,
	} satisfies React.CSSProperties,
	headerActions: {
		display: "flex",
		alignItems: "center",
		gap: "0.5rem",
	} satisfies React.CSSProperties,
	dirtyIndicator: {
		marginRight: "0.25rem",
		fontSize: "0.8125rem",
		color: "var(--text-color-kumo-subtle, #6b7280)",
		whiteSpace: "nowrap",
	} satisfies React.CSSProperties,
	cancelButton: {
		padding: "0.375rem 0.75rem",
		fontSize: "0.8125rem",
		fontWeight: 500,
		fontFamily: "inherit",
		color: "var(--text-color-kumo-default, #111827)",
		background: "transparent",
		border: "1px solid var(--color-kumo-interact)",
		borderRadius: "0.375rem",
		cursor: "pointer",
	} satisfies React.CSSProperties,
	// The one primary action on the screen. Kumo tokens DIRECTLY, not via
	// --puck-button-primary-*: Puck documents those but never declares them, so
	// reading them resolves through a fallback chain one stray pin away from
	// white-on-white. --color-kumo-contrast is near-black in light and
	// near-white in dark; --text-color-kumo-inverse is its exact opposite.
	saveButton: {
		padding: "0.375rem 0.75rem",
		fontSize: "0.8125rem",
		fontWeight: 600,
		fontFamily: "inherit",
		color: "var(--text-color-kumo-inverse, light-dark(#ffffff, #1a1a1a))",
		background: "var(--color-kumo-contrast, light-dark(#111111, #fafafa))",
		border: "1px solid var(--color-kumo-contrast, light-dark(#111111, #fafafa))",
		borderRadius: "0.375rem",
		cursor: "pointer",
	} satisfies React.CSSProperties,
	label: {
		display: "block",
		marginBottom: "0.375rem",
		fontSize: "0.875rem",
		fontWeight: 500,
	} satisfies React.CSSProperties,
	requiredMark: {
		marginLeft: "0.125rem",
		color: "var(--text-color-kumo-danger, #dc2626)",
	} satisfies React.CSSProperties,
};

/**
 * Typed `usePuck` for this module.
 *
 * Module scope is required, not stylistic: `createUsePuck()` MAKES a hook, and
 * a hook whose identity changes between renders cannot be called from one.
 */
const usePuck = createUsePuck();

/**
 * Unsaved-changes probe, rendered inside <Puck> as part of the header actions.
 *
 * The live document lives in a ref where nothing can watch it, so Puck's own
 * undo stack is the source of truth: `history.hasPast` is true exactly when
 * the editor has recorded at least one change since it opened. `usePuck` only
 * resolves inside Puck's tree, and `overrides.headerActions` is already ours
 * and already in that tree.
 *
 * A ref out rather than state up: Escape and Cancel need the flag at CALL
 * time, and lifting it with `setState` would re-render the overlay wrapping
 * the editor on the first keystroke of every session.
 */
function UnsavedIndicator({
	dirtyRef,
	label,
}: {
	dirtyRef: { current: boolean };
	label: string;
}) {
	const hasPast = usePuck((state) => state.history.hasPast);

	React.useEffect(() => {
		dirtyRef.current = hasPast;
	}, [dirtyRef, hasPast]);

	if (!hasPast) return null;
	return <span style={styles.dirtyIndicator}>{label}</span>;
}

function buildCanvasOverrideCss(canvas: CanvasStyles): string {
	const parts: string[] = [];
	if (canvas.colorScheme) parts.push(`:root { color-scheme: ${canvas.colorScheme}; }`);
	if (canvas.unlockScroll !== false) {
		// `!important` because the declarations it beats are inline.
		parts.push(
			`html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }`,
		);
	}
	return parts.join("\n");
}

/**
 * Build the `puck:canvas` field widget: edits a `json` field as a Puck
 * document. Call it once, at module scope, in your admin entry.
 */
export function createPuckCanvasField(
	options: PuckCanvasOptions,
): React.ComponentType<FieldWidgetProps> {
	const {
		config,
		emptyData = EMPTY_DATA,
		plugins = [],
		resolveConfig,
		canvas = {},
		overrides: userOverrides,
	} = options;
	const labels: CanvasLabels = { ...DEFAULT_LABELS, ...options.labels };

	for (const href of options.adminStylesheets ?? [puckCssHref, themeCssHref]) {
		ensureStylesheet(href);
	}

	const canvasOverrideCss = buildCanvasOverrideCss(canvas);

	const BlockPanel =
		options.blockPanel === false
			? null
			: createBlockPanel({
					config,
					preview: {
						stylesheets: canvas.stylesheets,
						css: canvas.css,
						colorScheme: canvas.colorScheme,
						...options.blockPanel,
					},
					previewWidth: options.blockPanel?.previewWidth,
					previewScale: options.blockPanel?.previewScale,
				});

	function toPuckData(value: unknown): Data {
		return isPuckData(value) ? value : emptyData;
	}

	function PuckCanvasField({ value, onChange, label, id, required, minimal }: FieldWidgetProps) {
		const data = React.useMemo(() => toPuckData(value), [value]);
		const names = React.useMemo(() => sectionNames(data), [data]);

		const [open, setOpen] = React.useState(false);
		// The admin shell is client-only, but a stray server import must not
		// touch `document`: portal only after the first client render.
		const [mounted, setMounted] = React.useState(false);

		// Live Puck state lives in a ref: re-rendering the overlay on every
		// keystroke would remount the editor and throw away its history.
		const draftRef = React.useRef<Data>(data);

		// Whether the open editor has changes worth losing. Written from inside
		// Puck's tree by <UnsavedIndicator />.
		const dirtyRef = React.useRef(false);

		/**
		 * The config Puck actually opens with, frozen at open time next to the
		 * data it belongs to. A ref, not a memo: it must be computed from the
		 * same snapshot as `draftRef.current` and must not change identity
		 * while the editor is mounted, or Puck remounts every section.
		 */
		const configRef = React.useRef<AnyConfig>(config);

		React.useEffect(() => {
			setMounted(true);
		}, []);

		const openEditor = React.useCallback(() => {
			draftRef.current = data;
			dirtyRef.current = false;
			configRef.current = resolveConfig ? resolveConfig(config, data) : config;
			setOpen(true);
		}, [data]);

		/**
		 * Guard on the two paths that throw `draftRef` away. Escape is a single
		 * keypress and Cancel a single click; only a dirty editor asks.
		 * `window.confirm` on purpose: a native confirm on an explicit user
		 * gesture is the honest primitive, and a clean close never meets it.
		 */
		const confirmDiscard = React.useCallback(() => {
			if (!dirtyRef.current) return true;
			if (typeof window === "undefined") return true;
			return window.confirm(labels.discard);
		}, []);

		const cancel = React.useCallback(() => {
			if (!confirmDiscard()) return;
			dirtyRef.current = false;
			setOpen(false);
		}, [confirmDiscard]);

		const save = React.useCallback(
			(next?: Data) => {
				const committed = next ?? draftRef.current;
				draftRef.current = committed;
				dirtyRef.current = false;
				onChange(committed);
				setOpen(false);
			},
			[onChange],
		);

		const handlePuckChange = React.useCallback((next: Data) => {
			draftRef.current = next;
		}, []);

		// Escape closes and discards (after a confirm when there is something
		// to discard). The page behind the overlay must not scroll while the
		// editor owns the screen.
		React.useEffect(() => {
			if (!open) return;
			if (typeof document === "undefined" || typeof window === "undefined") return;

			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key !== "Escape" || event.defaultPrevented) return;
				if (!confirmDiscard()) return;
				dirtyRef.current = false;
				setOpen(false);
			};

			window.addEventListener("keydown", handleKeyDown);
			const previousOverflow = document.body.style.overflow;
			document.body.style.overflow = "hidden";

			return () => {
				window.removeEventListener("keydown", handleKeyDown);
				document.body.style.overflow = previousOverflow;
			};
		}, [open, confirmDiscard]);

		// Replace Puck's default "Publish" action with Cancel / Save, and keep
		// Puck's own header (title, undo/redo, viewport switcher) intact.
		const overrides = React.useMemo<Partial<Overrides>>(
			() => ({
				// The site's stylesheets, scoped to the iframe and nowhere else.
				iframe: ({ children }) => (
					<>
						{(canvas.stylesheets ?? []).map((href) => (
							<link key={href} rel="stylesheet" href={href} />
						))}
						{canvas.css ? <style>{canvas.css}</style> : null}
						{/* Last, so it beats both the sheets above and Puck's own
						    inline styles on <body>. */}
						{canvasOverrideCss ? <style>{canvasOverrideCss}</style> : null}
						{children}
					</>
				),
				...(BlockPanel ? { components: () => <BlockPanel /> } : {}),
				// Doubles as the dirty-state probe: <UnsavedIndicator /> is the
				// one component rendered inside Puck's tree.
				headerActions: () => (
					<div style={styles.headerActions}>
						<UnsavedIndicator dirtyRef={dirtyRef} label={labels.unsaved} />
						<button type="button" style={styles.cancelButton} onClick={cancel}>
							{labels.cancel}
						</button>
						<button type="button" style={styles.saveButton} onClick={() => save()}>
							{labels.save}
						</button>
					</div>
				),
				...userOverrides,
			}),
			[cancel, save],
		);

		const overlay =
			open && mounted && typeof document !== "undefined"
				? createPortal(
						<div
							style={styles.overlay}
							role="dialog"
							aria-modal="true"
							aria-label={`${label}: layout editor`}
						>
							<div style={styles.editor}>
								<Puck
									config={configRef.current}
									plugins={plugins}
									data={draftRef.current}
									onChange={handlePuckChange}
									onPublish={(published) => save(published)}
									overrides={overrides}
									headerTitle={label}
									iframe={{ enabled: true }}
									height="100%"
								/>
							</div>
						</div>,
						document.body,
					)
				: null;

		return (
			<div>
				{!minimal && (
					<span id={`${id}-label`} style={styles.label}>
						{label}
						{required && <span style={styles.requiredMark}>*</span>}
					</span>
				)}

				<div style={styles.resting}>
					<span style={styles.summary}>
						<span style={styles.summaryPrimary}>
							{names.length === 0 ? labels.empty : labels.count(names.length)}
						</span>
						{names.length > 0 && (
							<span style={styles.summarySecondary}>{names.join(" · ")}</span>
						)}
					</span>
					<button
						type="button"
						id={id}
						style={styles.editButton}
						onClick={openEditor}
						aria-describedby={minimal ? undefined : `${id}-label`}
					>
						{labels.edit}
					</button>
				</div>

				{overlay}
			</div>
		);
	}

	return PuckCanvasField;
}

/**
 * The whole admin entry in one call:
 *
 *     export const { fields } = createPuckAdmin({ config });
 *
 * Returns the field widget map the admin reads as `pluginAdmins["puck"].fields`.
 */
export function createPuckAdmin(options: PuckCanvasOptions): {
	fields: { canvas: React.ComponentType<FieldWidgetProps> };
} {
	return { fields: { canvas: createPuckCanvasField(options) } };
}
