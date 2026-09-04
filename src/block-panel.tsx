/**
 * Searchable block panel with live hover previews.
 *
 * Installed as Puck's `components` override, so it replaces the default
 * component drawer entirely. Two things the stock drawer does not do:
 *
 * 1. A search box. With a handful of blocks the default list is fine; by the
 *    time a design system has twenty-plus, scanning categories is slower than
 *    typing three letters.
 * 2. A hover preview that renders the REAL component with its real
 *    `defaultProps`, not a screenshot that goes stale the first time someone
 *    restyles a section.
 *
 * The preview renders inside an iframe rather than inline. Puck's canvas does
 * the same thing, and for the same reason: a site stylesheet defines bare
 * element rules (`body`, `h1`-`h6`, `a`, `img`, `*`) and `:root` custom
 * properties. Dropping those into the admin document, even scoped under a
 * wrapper class, means either rewriting every selector or letting site resets
 * leak into the admin chrome. An iframe is a real document boundary, so the CSS
 * goes in verbatim and cannot escape.
 */

import { Drawer } from "@puckeditor/core";
import type { Config } from "@puckeditor/core";
import * as React from "react";
import { createPortal } from "react-dom";

export type AnyConfig = Config<any, any, any>;

export interface PreviewStyles {
	/** Stylesheet URLs `<link>`ed into the preview document, in order. */
	stylesheets?: string[];
	/** Raw CSS injected after the links. */
	css?: string;
	/**
	 * Pin the preview document's `color-scheme`. Set it to `"light"` for a
	 * light-only site whose tokens use `light-dark()`, or the previews will
	 * follow the admin's dark mode onto a surface the sections were never
	 * designed for.
	 */
	colorScheme?: "light" | "dark";
	/** Body background for the preview. Defaults to whatever the site CSS paints. */
	background?: string;
	/** Body text colour for the preview. */
	color?: string;
}

export interface BlockPanelOptions {
	config: AnyConfig;
	preview?: PreviewStyles;
	/** Width the preview is rendered at before being scaled down. Default 1280. */
	previewWidth?: number;
	/** Scale applied to the rendered preview. Default 0.28. */
	previewScale?: number;
}

/** Starting height, replaced as soon as the rendered block is measured. */
const DEFAULT_PREVIEW_HEIGHT = 620;
const MIN_PREVIEW_HEIGHT = 160;
const MAX_PREVIEW_HEIGHT = 1600;

interface BlockEntry {
	name: string;
	label: string;
	category: string;
}

/**
 * Flatten `config.categories` into a display list.
 *
 * Categories with `visible: false` are dropped: they exist so a component can
 * be nested inside a slot without also cluttering the top-level drawer.
 * Anything not claimed by a category falls into "Other", matching Puck's own
 * behaviour.
 */
function buildEntries(config: AnyConfig): BlockEntry[] {
	const components = config.components as Record<string, { label?: string }>;
	const categories = (config.categories ?? {}) as Record<
		string,
		{ title?: string; components?: string[]; visible?: boolean }
	>;

	const entries: BlockEntry[] = [];
	const claimed = new Set<string>();

	for (const [key, category] of Object.entries(categories)) {
		if (category.visible === false) {
			for (const name of category.components ?? []) claimed.add(name);
			continue;
		}
		for (const name of category.components ?? []) {
			if (!components[name] || claimed.has(name)) continue;
			claimed.add(name);
			entries.push({
				name,
				label: components[name]?.label ?? name,
				category: category.title ?? key,
			});
		}
	}

	for (const name of Object.keys(components)) {
		if (claimed.has(name)) continue;
		entries.push({ name, label: components[name]?.label ?? name, category: "Other" });
	}

	return entries;
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** An isolated document to render a preview into. */
function buildPreviewDoc(preview: PreviewStyles): string {
	const links = (preview.stylesheets ?? [])
		.map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`)
		.join("");
	const bodyRules = [
		preview.background ? `background:${preview.background};` : "",
		preview.color ? `color:${preview.color};` : "",
	].join("");
	const override =
		(preview.colorScheme ? `:root{color-scheme:${preview.colorScheme};}` : "") +
		(bodyRules ? `body{${bodyRules}}` : "");
	return (
		`<!doctype html><html><head><meta charset="utf-8">` +
		links +
		`<style>${preview.css ?? ""}</style>` +
		`<style>${override}</style>` +
		`<style>html,body{margin:0;padding:0;overflow:hidden;}</style></head><body></body></html>`
	);
}

export function createBlockPanel(options: BlockPanelOptions): React.ComponentType {
	const { config } = options;
	const preview = options.preview ?? {};
	const PREVIEW_WIDTH = options.previewWidth ?? 1280;
	const PREVIEW_SCALE = options.previewScale ?? 0.28;
	// Built once: the srcDoc is the same for every block.
	const PREVIEW_DOC = buildPreviewDoc(preview);

	function PreviewFrame({ children }: { children: React.ReactNode }) {
		const ref = React.useRef<HTMLIFrameElement | null>(null);
		const [body, setBody] = React.useState<HTMLElement | null>(null);
		const [height, setHeight] = React.useState(DEFAULT_PREVIEW_HEIGHT);

		// `srcDoc` is parsed asynchronously, so the body is captured on load
		// rather than on mount: portalling into a document that has not been
		// parsed yet silently renders nothing.
		const attach = React.useCallback(() => {
			setBody(ref.current?.contentDocument?.body ?? null);
		}, []);

		React.useEffect(() => {
			// Some browsers fire `load` before React attaches the handler when
			// the document is this small, so also check once on mount.
			attach();
			return () => setBody(null);
		}, [attach]);

		// Sections vary from a 200px logo strip to a 900px feature grid.
		// Measuring the rendered document and sizing the frame to it means the
		// card shows the whole block instead of an arbitrary crop.
		React.useEffect(() => {
			if (!body) return;

			const measure = () => {
				const next = Math.ceil(body.scrollHeight);
				if (next > 0)
					setHeight(Math.min(Math.max(next, MIN_PREVIEW_HEIGHT), MAX_PREVIEW_HEIGHT));
			};

			measure();
			const observer = new ResizeObserver(measure);
			observer.observe(body);
			return () => observer.disconnect();
		}, [body]);

		return (
			<div
				style={{
					width: PREVIEW_WIDTH * PREVIEW_SCALE,
					height: height * PREVIEW_SCALE,
					overflow: "hidden",
				}}
			>
				<iframe
					ref={ref}
					title="Block preview"
					aria-hidden="true"
					tabIndex={-1}
					srcDoc={PREVIEW_DOC}
					onLoad={attach}
					style={{
						width: PREVIEW_WIDTH,
						height,
						border: 0,
						display: "block",
						transform: `scale(${PREVIEW_SCALE})`,
						transformOrigin: "top left",
						pointerEvents: "none",
					}}
				>
					{body ? createPortal(children, body) : null}
				</iframe>
			</div>
		);
	}

	/**
	 * Render a component the way Puck would, using only its `defaultProps`.
	 *
	 * `puck` and `id` are supplied because Puck injects them into every
	 * component; a block that reads `puck.isEditing` would otherwise crash on a
	 * bare render.
	 */
	function BlockPreview({ name }: { name: string }) {
		const entry = (config.components as Record<string, any>)[name];
		if (!entry?.render) return <div style={styles.previewFailed}>Preview unavailable</div>;

		const Component = entry.render as React.ComponentType<Record<string, unknown>>;
		const props = {
			...(entry.defaultProps ?? {}),
			id: `preview-${name}`,
			puck: { isEditing: false, dragRef: null, metadata: {} },
		};

		return (
			<PreviewBoundary>
				<PreviewFrame>
					<Component {...props} />
				</PreviewFrame>
			</PreviewBoundary>
		);
	}

	/** Drawer item wrapper that reveals a preview card on hover or keyboard focus. */
	function BlockItem({ entry }: { entry: BlockEntry }) {
		const [hovered, setHovered] = React.useState(false);
		const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);
		const ref = React.useRef<HTMLDivElement | null>(null);

		const show = React.useCallback(() => {
			const rect = ref.current?.getBoundingClientRect();
			if (rect) {
				// Clamp so a block near the bottom of a long list still shows its card.
				const cardHeight = MAX_PREVIEW_HEIGHT * PREVIEW_SCALE * 0.5;
				const top = Math.min(rect.top, Math.max(8, window.innerHeight - cardHeight - 8));
				setAnchor({ top, left: rect.right + 12 });
			}
			setHovered(true);
		}, []);

		const hide = React.useCallback(() => setHovered(false), []);

		return (
			<div
				ref={ref}
				onMouseEnter={show}
				onMouseLeave={hide}
				onFocusCapture={show}
				onBlurCapture={hide}
			>
				<Drawer.Item name={entry.name} label={entry.label} />
				{hovered && anchor
					? createPortal(
							<div
								style={{
									...styles.previewCard,
									top: anchor.top,
									left: anchor.left,
									width: PREVIEW_WIDTH * PREVIEW_SCALE,
								}}
							>
								<div
									style={{
										...styles.previewViewport,
										background: preview.background ?? "#fff",
									}}
								>
									<BlockPreview name={entry.name} />
								</div>
								<div style={styles.previewLabel}>{entry.label}</div>
							</div>,
							document.body,
						)
					: null}
			</div>
		);
	}

	function BlockPanel() {
		const [query, setQuery] = React.useState("");
		const entries = React.useMemo(() => buildEntries(config), []);

		/**
		 * Which categories are open. Tracks EXPANDED rather than collapsed so
		 * the empty initial set means "everything closed": the panel opens as a
		 * short list of category names instead of a wall of blocks.
		 *
		 * Deliberately not persisted. The editor mounts this fresh every time
		 * it opens, and remembering the last session's open categories would
		 * defeat the point of defaulting to collapsed.
		 */
		const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
			() => new Set<string>(),
		);

		const toggleCategory = React.useCallback((category: string) => {
			setExpanded((prev) => {
				const next = new Set(prev);
				if (!next.delete(category)) next.add(category);
				return next;
			});
		}, []);

		// Inline styles cannot express :hover, and a clickable row with no
		// feedback reads as dead. One piece of state for the whole list rather
		// than a component per header.
		const [hoveredCategory, setHoveredCategory] = React.useState<string | null>(null);

		const needle = query.trim().toLowerCase();
		const matches = React.useMemo(
			() =>
				needle
					? entries.filter(
							(e) =>
								e.label.toLowerCase().includes(needle) ||
								e.name.toLowerCase().includes(needle) ||
								e.category.toLowerCase().includes(needle),
						)
					: entries,
			[entries, needle],
		);

		// Searching flattens the list: category headers between two results
		// just add noise when the point is to get to one block quickly.
		const grouped = React.useMemo(() => {
			if (needle) return null;
			const out = new Map<string, BlockEntry[]>();
			for (const entry of matches) {
				const bucket = out.get(entry.category) ?? [];
				bucket.push(entry);
				out.set(entry.category, bucket);
			}
			return out;
		}, [matches, needle]);

		return (
			<div style={styles.panel}>
				<div style={styles.searchRow}>
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={`Search ${entries.length} blocks…`}
						aria-label="Search blocks"
						style={styles.search}
					/>
				</div>

				{matches.length === 0 ? (
					<p style={styles.empty}>No blocks match “{query}”.</p>
				) : grouped ? (
					[...grouped.entries()].map(([category, items]) => {
						const open = expanded.has(category);
						const panelId = `blockpanel-${category.replace(/\W+/g, "-").toLowerCase()}`;
						return (
							<section key={category} style={styles.group}>
								{/* Heading kept for semantics, button nested inside it for
								    behaviour: a <button> that IS the <h3> loses the heading
								    role in most AT. */}
								<h3 style={styles.groupHeading}>
									<button
										type="button"
										onClick={() => toggleCategory(category)}
										onMouseEnter={() => setHoveredCategory(category)}
										onMouseLeave={() => setHoveredCategory(null)}
										onFocus={() => setHoveredCategory(category)}
										onBlur={() => setHoveredCategory(null)}
										aria-expanded={open}
										// Only while open: the panel is unmounted when collapsed,
										// and aria-controls pointing at an id that is not in the
										// document is an ARIA violation.
										aria-controls={open ? panelId : undefined}
										style={
											hoveredCategory === category || open
												? { ...styles.groupToggle, ...styles.groupToggleActive }
												: styles.groupToggle
										}
									>
										<Caret open={open} />
										<span style={styles.groupTitleText}>{category}</span>
										<span style={styles.groupCount}>{items.length}</span>
									</button>
								</h3>
								{/* Unmounted, not hidden. A display:none <Drawer> would leave
								    its items registered as drag sources with no visible target. */}
								{open && (
									<div id={panelId}>
										<Drawer>
											{items.map((entry) => (
												<BlockItem key={entry.name} entry={entry} />
											))}
										</Drawer>
									</div>
								)}
							</section>
						);
					})
				) : (
					<section style={styles.group}>
						<h3 style={styles.groupTitle}>
							{matches.length} result{matches.length === 1 ? "" : "s"}
						</h3>
						<Drawer>
							{matches.map((entry) => (
								<BlockItem key={entry.name} entry={entry} />
							))}
						</Drawer>
					</section>
				)}
			</div>
		);
	}

	return BlockPanel;
}

/** A component that throws must not take the whole panel down with it. */
class PreviewBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	render() {
		if (this.state.failed) {
			return <div style={styles.previewFailed}>Preview unavailable</div>;
		}
		return this.props.children;
	}
}

/** Disclosure caret. Inline rather than an icon import: one 12px glyph does
 *  not justify pulling an icon package into the drawer chunk. */
function Caret({ open }: { open: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="12"
			height="12"
			fill="none"
			stroke="currentColor"
			strokeWidth="3"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{
				flexShrink: 0,
				transition: "transform var(--puck-duration-fast, 50ms) var(--puck-ease-exit, ease-in)",
				transform: open ? "rotate(90deg)" : "none",
			}}
		>
			<path d="M9 18l6-6-6-6" />
		</svg>
	);
}

/**
 * Panel chrome is coloured from Puck's SEMANTIC tokens, never its raw
 * `--puck-color-grey-*` ramp. The ramp is a fixed hex scale that never moves,
 * so anything built on it stays light while the rest of the admin follows Kumo
 * into dark mode. theme.css aliases the semantic tokens onto Kumo's, so
 * everything below picks up light and dark for free.
 */
const styles: Record<string, React.CSSProperties> = {
	panel: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		padding: "8px 0",
	},
	searchRow: {
		padding: "0 16px 8px",
	},
	search: {
		width: "100%",
		padding: "7px 10px",
		fontSize: 13,
		borderRadius: 6,
		border: "1px solid var(--puck-color-border)",
		background: "var(--puck-color-surface)",
		color: "inherit",
		boxSizing: "border-box",
	},
	group: {
		padding: "0 16px 12px",
	},
	groupTitle: {
		margin: "6px 0 8px",
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: "0.06em",
		textTransform: "uppercase",
		color: "var(--puck-color-text-muted)",
	},
	groupHeading: {
		margin: 0,
	},
	groupToggle: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		width: "100%",
		padding: "7px 4px",
		border: "none",
		background: "transparent",
		font: "inherit",
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: "0.06em",
		textTransform: "uppercase",
		color: "var(--puck-color-text-muted)",
		textAlign: "left",
		cursor: "pointer",
		borderRadius: "var(--puck-radius-m, 4px)",
	},
	groupToggleActive: {
		background: "var(--puck-color-interactive-soft-hover)",
		color: "var(--puck-color-text)",
	},
	groupTitleText: {
		flex: 1,
		minWidth: 0,
	},
	groupCount: {
		flexShrink: 0,
		padding: "1px 6px",
		borderRadius: "var(--puck-radius-pill, 30px)",
		background: "var(--puck-color-interactive-soft)",
		color: "var(--puck-color-text-secondary)",
		fontSize: 10,
		letterSpacing: "normal",
	},
	empty: {
		padding: "4px 16px 12px",
		fontSize: 13,
		color: "var(--puck-color-text-secondary)",
	},
	previewCard: {
		position: "fixed",
		zIndex: 2147483647,
		// The only fallback in this file: the card floats over the whole
		// editor, so a missing token would leave it transparent.
		background: "var(--puck-color-surface, #fff)",
		border: "1px solid var(--puck-color-border)",
		borderRadius: 8,
		// Kumo's own elevation recipe, widened for a floating card. Both halves
		// are `light-dark()` tokens, so the shadow lightens instead of turning
		// into a black smear on a dark surface.
		boxShadow:
			"0 0 1px 0.5px var(--color-kumo-shadow-edge), 0 12px 32px var(--color-kumo-shadow-drop)",
		overflow: "hidden",
		pointerEvents: "none",
	},
	previewViewport: {
		overflow: "hidden",
	},
	previewLabel: {
		padding: "6px 10px",
		fontSize: 12,
		fontWeight: 500,
		borderTop: "1px solid var(--puck-color-border)",
		color: "var(--puck-color-text)",
	},
	previewFailed: {
		padding: 16,
		fontSize: 12,
		color: "var(--puck-color-text-secondary)",
	},
};
