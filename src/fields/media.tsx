/**
 * `mediaField` -- the EmDash media library, as a Puck field.
 *
 * Replaces the plain URL text box on every image prop with the browse /
 * search / upload picker authors already know from the EmDash admin, while
 * storing exactly what a text field would store: a URL string. Components and
 * renderers are untouched by the swap; changing a field is a one-line edit at
 * the call site in your config.
 *
 * Four things here are load-bearing.
 *
 * 1. **Puck renders `custom` fields bare.** For every built-in field type Puck
 *    wraps the control in its own `FieldLabel`; for `type: "custom"` it calls
 *    `field.render` and does nothing else. So this module draws the label
 *    itself, using Puck's `FieldLabel`, or the field would sit in the sidebar
 *    unlabelled and half a step out of line with its neighbours.
 *
 * 2. **Importing Puck's runtime here is free.** A Puck config is isomorphic
 *    and the public route imports it, so a runtime import from
 *    `@puckeditor/core` would normally be suspect. `FieldLabel` and `Button`
 *    are re-exported from the same built chunk that backs `Render`, which the
 *    public route already imports, so this adds nothing to the server graph.
 *    None of this code runs during SSR in any case: `<Render>` never reads
 *    `fields`.
 *
 * 3. **`X-EmDash-Request: 1` is the CSRF token.** EmDash accepts an
 *    authenticated write when that custom header is present, on the grounds
 *    that browsers refuse to attach custom headers cross-origin. Auth itself
 *    is the admin session cookie, so every call is same-origin with
 *    credentials. This mirrors emdash's own internal `ecFetch`.
 *
 * 4. **Media-usage tracking cannot see any of this.** EmDash's usage extractor
 *    walks `image`, `file`, `repeater` and `portableText` fields only, so a URL
 *    stored inside the `json` layout is invisible to it and every asset used by
 *    a Puck page reads as used-nowhere in the media library. Nothing deletes
 *    those files -- the media-usage GC only collects bookkeeping rows -- but
 *    "where is this used" will under-report until a hook mirrors layout
 *    references into the usage table.
 */

import { Button, FieldLabel } from "@puckeditor/core";
import type { CustomField } from "@puckeditor/core";
import * as React from "react";
import { createPortal } from "react-dom";

import { MODAL_Z_INDEX } from "../shared/dom";

const API_BASE = "/_emdash/api";

/**
 * Page size for the grid. Deliberately below the API's 50 default: the file
 * route serves originals with no resizing endpoint wired up, so each tile costs
 * a full-size image. A short first page plus "Load more" beats a slow modal.
 */
const PAGE_SIZE = 24;

const SEARCH_DEBOUNCE_MS = 250;

/** Sweep size and page cap used to build the URL -> filename index. */
const INDEX_PAGE_SIZE = 100;
const INDEX_MAX_PAGES = 5;

/** 32 MB of RGBA -- matches the server's own `MAX_DECODED_BYTES`. */
const MAX_DECODED_BYTES = 32 * 1024 * 1024;

/** Longest edge of the client-side thumbnail sent with oversized uploads. */
const THUMBNAIL_MAX_EDGE = 512;

interface MediaItem {
	id: string;
	filename: string;
	mimeType: string;
	url: string;
	width: number | null;
	height: number | null;
	size: number | null;
	alt: string | null;
}

interface MediaPage {
	items: MediaItem[];
	nextCursor?: string;
}

/**
 * First pages, keyed by search term, kept for the lifetime of the admin bundle.
 *
 * Used stale-while-revalidate: a cached page paints instantly on open and the
 * network result replaces it when it lands, so reopening the picker never shows
 * a spinner for content that has not changed. Cleared on upload, which is the
 * one mutation this component makes.
 */
const firstPageCache = new Map<string, MediaPage>();

/**
 * Same-origin fetch carrying the header EmDash's CSRF check looks for.
 */
async function api(url: string, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set("X-EmDash-Request", "1");
	return fetch(url, { credentials: "same-origin", ...init, headers });
}

/**
 * Pull the human-readable reason out of EmDash's `{ success, error }` envelope.
 *
 * Worth the effort rather than showing a generic failure: the messages that
 * actually reach authors here are the MIME allowlist rejections, and "SVG files
 * are not allowed" is a message someone can act on.
 */
async function errorMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { error?: { message?: string } };
		return body.error?.message ?? fallback;
	} catch {
		return fallback;
	}
}

function messageOf(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

async function fetchMedia(
	query: string,
	cursor?: string,
	limit: number = PAGE_SIZE,
): Promise<MediaPage> {
	const params = new URLSearchParams({
		mimeType: "image/",
		limit: String(limit),
	});
	if (query) params.set("q", query);
	if (cursor) params.set("cursor", cursor);

	const res = await api(`${API_BASE}/media?${params.toString()}`);
	if (!res.ok) {
		throw new Error(await errorMessage(res, "Could not load the media library."));
	}
	const body = (await res.json()) as { data?: Partial<MediaPage> };
	const items = body.data?.items ?? [];
	indexNames(items);
	return { items, nextCursor: body.data?.nextCursor };
}

interface ImageProbe {
	width: number;
	height: number;
	thumbnail?: Blob;
}

/**
 * Read a file's pixel dimensions, and downscale it when it is large enough to
 * be a problem server-side.
 *
 * Both are optional parts of the upload, and both mirror what EmDash's own
 * picker sends: dimensions save the server a decode, and the thumbnail keeps
 * blurhash generation from decoding a huge bitmap. Any failure resolves `null`
 * and the upload proceeds without them.
 */
function probeImage(file: File): Promise<ImageProbe | null> {
	if (!file.type.startsWith("image/")) return Promise.resolve(null);

	return new Promise((resolve) => {
		const objectUrl = URL.createObjectURL(file);
		const img = new window.Image();

		img.onload = () => {
			const width = img.naturalWidth;
			const height = img.naturalHeight;
			// An SVG with no intrinsic size decodes to 0x0; treat it as unknown
			// rather than sending nonsense dimensions.
			if (width < 1 || height < 1) {
				URL.revokeObjectURL(objectUrl);
				resolve(null);
				return;
			}

			if (width * height * 4 <= MAX_DECODED_BYTES) {
				URL.revokeObjectURL(objectUrl);
				resolve({ width, height });
				return;
			}

			const scale = Math.min(
				1,
				THUMBNAIL_MAX_EDGE / Math.max(width, height),
			);
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
			const context = canvas.getContext("2d");
			if (!context) {
				URL.revokeObjectURL(objectUrl);
				resolve({ width, height });
				return;
			}
			context.drawImage(img, 0, 0, canvas.width, canvas.height);
			canvas.toBlob((blob) => {
				URL.revokeObjectURL(objectUrl);
				resolve({ width, height, thumbnail: blob ?? undefined });
			}, "image/png");
		};

		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			resolve(null);
		};

		img.src = objectUrl;
	});
}

async function uploadMedia(file: File): Promise<MediaItem> {
	const form = new FormData();
	form.append("file", file);

	const probe = await probeImage(file);
	if (probe) {
		form.append("width", String(probe.width));
		form.append("height", String(probe.height));
		if (probe.thumbnail) form.append("thumbnail", probe.thumbnail, "thumb.png");
	}

	const res = await api(`${API_BASE}/media`, { method: "POST", body: form });
	if (!res.ok) {
		throw new Error(await errorMessage(res, `Could not upload ${file.name}.`));
	}

	const body = (await res.json()) as {
		data?: { item?: Partial<MediaItem> & { storageKey?: string } };
	};
	const item = body.data?.item;
	if (!item?.id) throw new Error(`Uploading ${file.name} returned no media item.`);

	// The create response is a bare media row: it carries `storageKey` but no
	// `url`, which only the list endpoint adds.
	return {
		id: item.id,
		filename: item.filename ?? file.name,
		mimeType: item.mimeType ?? file.type,
		url: item.url ?? `${API_BASE}/media/file/${item.storageKey ?? ""}`,
		width: item.width ?? probe?.width ?? null,
		height: item.height ?? probe?.height ?? null,
		size: item.size ?? file.size,
		alt: item.alt ?? null,
	};
}

/**
 * `url` -> the filename it was uploaded under, built once per editing session.
 *
 * A stored value is only ever a URL, and a media item's `id` is a different
 * ULID from its `storageKey`, so the id cannot be recovered from the URL and
 * there is no lookup-by-storage-key endpoint. Without this every field would
 * label itself with an opaque `01M18EGW9ZEWA555AN4VBRRMAH.png`.
 *
 * Filled by every list request the picker already makes, and backfilled on
 * demand by `ensureNameIndex` for values that were seeded rather than picked.
 */
const nameIndex = new Map<string, string>();

let nameIndexPromise: Promise<void> | null = null;

function indexNames(items: MediaItem[]): void {
	for (const item of items) nameIndex.set(item.url, item.filename);
}

/**
 * Walk the library once to name values that were never picked in this session.
 *
 * Shared across every field on the page and deduplicated behind one promise, so
 * opening the editor costs a single sweep no matter how many image fields the
 * page has. Capped: past the cap a field falls back to the URL's last segment,
 * which is what it would have shown anyway.
 */
async function ensureNameIndex(): Promise<void> {
	if (!nameIndexPromise) {
		nameIndexPromise = (async () => {
			let cursor: string | undefined;
			for (let page = 0; page < INDEX_MAX_PAGES; page += 1) {
				const result = await fetchMedia("", cursor, INDEX_PAGE_SIZE);
				if (!result.nextCursor) return;
				cursor = result.nextCursor;
			}
		})().catch(() => {
			// Labels fall back to the URL basename; nothing else depends on this.
		});
	}
	return nameIndexPromise;
}

/** Friendly filename for a stored URL, falling back to its last path segment. */
function useMediaName(url: string): string {
	const [name, setName] = React.useState(() => nameIndex.get(url) ?? basename(url));

	React.useEffect(() => {
		const known = nameIndex.get(url);
		if (known) {
			setName(known);
			return;
		}
		setName(basename(url));

		// An off-site URL has no library entry to find, and its last segment is
		// already the best name available.
		//
		// Stored values keep the proxy shape (`/_emdash/api/media/file/<key>`)
		// even on sites that rewrite them to a CDN at render time; that rewrite
		// belongs on the way OUT, in the route. Migrating the data instead would
		// break this lookup and blank every filename label in the admin.
		if (!url.startsWith(`${API_BASE}/media/file/`)) return;

		let cancelled = false;
		void ensureNameIndex().then(() => {
			if (!cancelled) setName(nameIndex.get(url) ?? basename(url));
		});
		return () => {
			cancelled = true;
		};
	}, [url]);

	return name;
}

/** Last path segment of a URL, for labelling a value we only know as a string. */
function basename(url: string): string {
	const withoutQuery = url.split(/[?#]/)[0] ?? url;
	const segments = withoutQuery.split("/").filter(Boolean);
	return decodeURIComponent(segments[segments.length - 1] ?? url);
}

function formatSize(bytes: number | null): string | null {
	if (bytes === null || bytes <= 0) return null;
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Dimensions and weight, for the caption under a tile. */
function describe(item: MediaItem): string {
	const parts: string[] = [];
	if (item.width && item.height) parts.push(`${item.width}x${item.height}`);
	const size = formatSize(item.size);
	if (size) parts.push(size);
	return parts.join(" · ");
}

function ImageIcon(): React.JSX.Element {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
		</svg>
	);
}

function UploadIcon(): React.JSX.Element {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" x2="12" y1="3" y2="15" />
		</svg>
	);
}

/**
 * Checkerboard, so a transparent PNG reads as transparent rather than as a
 * white rectangle. Every logo in this project ships with an alpha channel, so
 * without it half the media library looks like blank tiles.
 */
const CHECKERBOARD: React.CSSProperties = {
	backgroundColor: "#fff",
	backgroundImage:
		"linear-gradient(45deg, #ededed 25%, transparent 25%), linear-gradient(-45deg, #ededed 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ededed 75%), linear-gradient(-45deg, transparent 75%, #ededed 75%)",
	backgroundSize: "12px 12px",
	backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
};

const styles: Record<string, React.CSSProperties> = {
	control: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
	},
	empty: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		width: "100%",
		padding: "10px 12px",
		fontSize: 13,
		textAlign: "left",
		color: "var(--puck-color-grey-04, #5a5a5a)",
		background: "var(--puck-color-white, #fff)",
		border: "1px dashed var(--puck-color-grey-08, #c3c3c3)",
		borderRadius: 6,
		cursor: "pointer",
	},
	emptyDragging: {
		borderColor: "var(--puck-color-azure-05, #3479be)",
		background: "var(--puck-color-azure-12, #f7faff)",
		color: "var(--puck-color-azure-04, #0158ad)",
	},
	emptyText: {
		display: "flex",
		flexDirection: "column",
		gap: 1,
		minWidth: 0,
	},
	emptyHint: {
		fontSize: 11,
		color: "var(--puck-color-grey-06, #949494)",
	},
	filled: {
		display: "flex",
		alignItems: "center",
		gap: 10,
		padding: 8,
		background: "var(--puck-color-white, #fff)",
		border: "1px solid var(--puck-color-grey-09, #dcdcdc)",
		borderRadius: 6,
	},
	thumb: {
		...CHECKERBOARD,
		flex: "0 0 auto",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: 44,
		height: 44,
		borderRadius: 4,
		border: "1px solid var(--puck-color-grey-10, #efefef)",
		overflow: "hidden",
	},
	thumbImg: {
		maxWidth: "100%",
		maxHeight: "100%",
		objectFit: "contain",
	},
	filledMeta: {
		display: "flex",
		flexDirection: "column",
		gap: 1,
		minWidth: 0,
		flex: 1,
	},
	filledName: {
		fontSize: 13,
		fontWeight: 500,
		color: "var(--puck-color-grey-02, #292929)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	filledPath: {
		fontSize: 11,
		color: "var(--puck-color-grey-06, #949494)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	linkRow: {
		display: "flex",
		alignItems: "center",
		gap: 10,
	},
	link: {
		padding: 0,
		fontSize: 12,
		color: "var(--puck-color-azure-04, #0158ad)",
		background: "none",
		border: "none",
		cursor: "pointer",
		textDecoration: "underline",
	},
	linkMuted: {
		padding: 0,
		fontSize: 12,
		color: "var(--puck-color-grey-05, #767676)",
		background: "none",
		border: "none",
		cursor: "pointer",
		textDecoration: "underline",
	},
	urlInput: {
		width: "100%",
		padding: "7px 10px",
		fontSize: 13,
		borderRadius: 6,
		border: "1px solid var(--puck-color-grey-09, #dcdcdc)",
		background: "var(--puck-color-white, #fff)",
		color: "inherit",
		boxSizing: "border-box",
	},
	controlError: {
		fontSize: 12,
		color: "#b3261e",
	},
	backdrop: {
		position: "fixed",
		inset: 0,
		zIndex: MODAL_Z_INDEX,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
		background: "rgba(0, 0, 0, 0.45)",
	},
	dialog: {
		position: "relative",
		display: "flex",
		flexDirection: "column",
		// Explicit, and load-bearing. Puck's secondary Button sets no `color` of
		// its own -- it inherits from Puck's themed container. This dialog is
		// portalled to `document.body`, outside that container, so without a
		// foreground set here it inherits the EmDash admin's instead: on a
		// dark-themed admin that renders "Cancel" as near-white text and a
		// near-white border on this white panel, i.e. invisible.
		color: "var(--puck-color-grey-02, #292929)",
		width: "min(920px, 100%)",
		height: "min(680px, 100%)",
		background: "var(--puck-color-white, #fff)",
		borderRadius: 12,
		boxShadow: "0 24px 64px rgba(0, 0, 0, 0.28)",
		overflow: "hidden",
	},
	dialogHeader: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		padding: "14px 20px",
		borderBottom: "1px solid var(--puck-color-grey-10, #efefef)",
	},
	dialogTitle: {
		flex: "0 0 auto",
		margin: 0,
		fontSize: 15,
		fontWeight: 600,
		color: "var(--puck-color-grey-01, #181818)",
	},
	search: {
		flex: 1,
		maxWidth: 300,
		marginLeft: "auto",
		padding: "7px 10px",
		fontSize: 13,
		borderRadius: 6,
		border: "1px solid var(--puck-color-grey-09, #dcdcdc)",
		background: "var(--puck-color-white, #fff)",
		color: "inherit",
		boxSizing: "border-box",
	},
	close: {
		flex: "0 0 auto",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: 28,
		height: 28,
		fontSize: 18,
		lineHeight: 1,
		color: "var(--puck-color-grey-05, #767676)",
		background: "none",
		border: "none",
		borderRadius: 6,
		cursor: "pointer",
	},
	body: {
		flex: 1,
		overflowY: "auto",
		padding: "16px 20px",
	},
	grid: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
		gap: 12,
	},
	tile: {
		display: "flex",
		flexDirection: "column",
		padding: 0,
		textAlign: "left",
		background: "var(--puck-color-white, #fff)",
		border: "1px solid var(--puck-color-grey-09, #dcdcdc)",
		borderRadius: 8,
		overflow: "hidden",
		cursor: "pointer",
	},
	tileSelected: {
		borderColor: "var(--puck-color-azure-04, #0158ad)",
		boxShadow: "0 0 0 2px var(--puck-color-azure-09, #cfdff0)",
	},
	tileThumb: {
		...CHECKERBOARD,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		aspectRatio: "4 / 3",
		padding: 8,
		overflow: "hidden",
	},
	tileImg: {
		maxWidth: "100%",
		maxHeight: "100%",
		objectFit: "contain",
	},
	tileMeta: {
		padding: "6px 8px",
		borderTop: "1px solid var(--puck-color-grey-10, #efefef)",
		minWidth: 0,
	},
	tileName: {
		display: "block",
		fontSize: 12,
		fontWeight: 500,
		color: "var(--puck-color-grey-02, #292929)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	tileDetail: {
		display: "block",
		fontSize: 11,
		color: "var(--puck-color-grey-06, #949494)",
	},
	uploadTile: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		aspectRatio: "4 / 3",
		padding: 8,
		fontSize: 12,
		fontWeight: 500,
		color: "var(--puck-color-grey-04, #5a5a5a)",
		background: "var(--puck-color-grey-12, #fafafa)",
		border: "1px dashed var(--puck-color-grey-08, #c3c3c3)",
		borderRadius: 8,
		cursor: "pointer",
	},
	skeleton: {
		aspectRatio: "4 / 3",
		background: "var(--puck-color-grey-11, #f5f5f5)",
		border: "1px solid var(--puck-color-grey-10, #efefef)",
		borderRadius: 8,
	},
	status: {
		padding: "32px 0",
		fontSize: 13,
		textAlign: "center",
		color: "var(--puck-color-grey-05, #767676)",
	},
	moreRow: {
		display: "flex",
		justifyContent: "center",
		paddingTop: 16,
	},
	dialogFooter: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		padding: "12px 20px",
		borderTop: "1px solid var(--puck-color-grey-10, #efefef)",
	},
	footerNote: {
		flex: 1,
		minWidth: 0,
		fontSize: 12,
		color: "var(--puck-color-grey-05, #767676)",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	footerError: {
		flex: 1,
		minWidth: 0,
		fontSize: 12,
		color: "#b3261e",
	},
	dropOverlay: {
		position: "absolute",
		inset: 0,
		zIndex: 1,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		fontSize: 14,
		fontWeight: 600,
		color: "var(--puck-color-azure-03, #014292)",
		background: "rgba(247, 250, 255, 0.92)",
		border: "2px dashed var(--puck-color-azure-05, #3479be)",
		borderRadius: 12,
		pointerEvents: "none",
	},
	srOnly: {
		position: "absolute",
		width: 1,
		height: 1,
		padding: 0,
		margin: -1,
		overflow: "hidden",
		clip: "rect(0, 0, 0, 0)",
		whiteSpace: "nowrap",
		border: 0,
	},
};

/** First image in a drag payload or file input, ignoring anything else dropped. */
function firstImageFile(files: FileList | null): File | null {
	if (!files) return null;
	for (const file of Array.from(files)) {
		if (file.type.startsWith("image/")) return file;
	}
	return null;
}

interface MediaPickerModalProps {
	initialValue: string;
	onClose: () => void;
	onSelect: (url: string) => void;
}

/**
 * The library itself: search, an upload target, and a grid of what is already
 * there. Portalled to `document.body` for the same reason the Puck overlay is
 * -- the field lives inside the sidebar's scroll container, which would clip
 * and scroll-trap a dialog rendered in place.
 */
function MediaPickerModal({
	initialValue,
	onClose,
	onSelect,
}: MediaPickerModalProps): React.JSX.Element {
	const [query, setQuery] = React.useState("");
	const [term, setTerm] = React.useState("");
	const [items, setItems] = React.useState<MediaItem[]>([]);
	const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
	const [loading, setLoading] = React.useState(true);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [uploading, setUploading] = React.useState(false);
	const [dragging, setDragging] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [selected, setSelected] = React.useState(initialValue);

	const selectedName = useMediaName(selected);

	const searchRef = React.useRef<HTMLInputElement>(null);
	const fileRef = React.useRef<HTMLInputElement>(null);
	const dragDepth = React.useRef(0);

	React.useEffect(() => {
		searchRef.current?.focus();
	}, []);

	React.useEffect(() => {
		const timer = window.setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [query]);

	// Stale-while-revalidate: paint any cached page for this term immediately,
	// then replace it with the network result. A cache hit means no spinner.
	React.useEffect(() => {
		let cancelled = false;
		const cached = firstPageCache.get(term);

		if (cached) {
			setItems(cached.items);
			setNextCursor(cached.nextCursor);
			setLoading(false);
		} else {
			setItems([]);
			setNextCursor(undefined);
			setLoading(true);
		}
		setError(null);

		void (async () => {
			try {
				const page = await fetchMedia(term);
				if (cancelled) return;
				firstPageCache.set(term, page);
				setItems(page.items);
				setNextCursor(page.nextCursor);
			} catch (caught) {
				if (cancelled) return;
				// Keep showing cached results if the revalidation fails.
				if (!cached) setError(messageOf(caught, "Could not load the media library."));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [term]);

	const loadMore = async (): Promise<void> => {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const page = await fetchMedia(term, nextCursor);
			setItems((previous) => [...previous, ...page.items]);
			setNextCursor(page.nextCursor);
		} catch (caught) {
			setError(messageOf(caught, "Could not load more media."));
		} finally {
			setLoadingMore(false);
		}
	};

	const runUpload = async (file: File | null): Promise<void> => {
		if (!file || uploading) return;
		setUploading(true);
		setError(null);
		try {
			const item = await uploadMedia(file);
			// Every cached page is now missing the new item.
			firstPageCache.clear();
			indexNames([item]);
			setItems((previous) => [item, ...previous.filter((entry) => entry.id !== item.id)]);
			setSelected(item.url);
		} catch (caught) {
			setError(messageOf(caught, `Could not upload ${file.name}.`));
		} finally {
			setUploading(false);
		}
	};

	const confirm = (url: string): void => {
		onSelect(url);
		onClose();
	};

	return createPortal(
		<div
			style={styles.backdrop}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			// Puck binds document-level shortcuts (undo, duplicate, delete).
			// Without this, typing in the search box can reach them.
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") onClose();
			}}>
			<div
				style={styles.dialog}
				role="dialog"
				aria-modal="true"
				aria-label="Media library"
				onDragEnter={(event) => {
					event.preventDefault();
					dragDepth.current += 1;
					setDragging(true);
				}}
				onDragOver={(event) => event.preventDefault()}
				onDragLeave={() => {
					dragDepth.current = Math.max(0, dragDepth.current - 1);
					if (dragDepth.current === 0) setDragging(false);
				}}
				onDrop={(event) => {
					event.preventDefault();
					dragDepth.current = 0;
					setDragging(false);
					void runUpload(firstImageFile(event.dataTransfer.files));
				}}>
				<div style={styles.dialogHeader}>
					<h2 style={styles.dialogTitle}>Media library</h2>
					<input
						ref={searchRef}
						type="search"
						style={styles.search}
						placeholder="Search by filename"
						value={query}
						onChange={(event) => setQuery(event.currentTarget.value)}
					/>
					<button type="button" style={styles.close} onClick={onClose} aria-label="Close">
						&times;
					</button>
				</div>

				<div style={styles.body}>
					<div style={styles.grid}>
						<button
							type="button"
							style={styles.uploadTile}
							onClick={() => fileRef.current?.click()}
							disabled={uploading}>
							<UploadIcon />
							<span>{uploading ? "Uploading…" : "Upload"}</span>
						</button>

						{loading
							? Array.from({ length: 7 }, (_, index) => (
									<div key={`skeleton-${index}`} style={styles.skeleton} />
								))
							: items.map((item) => {
									const isSelected = item.url === selected;
									return (
										<button
											key={item.id}
											type="button"
											aria-pressed={isSelected}
											style={
												isSelected ? { ...styles.tile, ...styles.tileSelected } : styles.tile
											}
											onClick={() => setSelected(item.url)}
											onDoubleClick={() => confirm(item.url)}>
											<span style={styles.tileThumb}>
												<img
													src={item.url}
													alt=""
													loading="lazy"
													decoding="async"
													style={styles.tileImg}
												/>
											</span>
											<span style={styles.tileMeta}>
												<span style={styles.tileName} title={item.filename}>
													{item.filename}
												</span>
												<span style={styles.tileDetail}>{describe(item)}</span>
											</span>
										</button>
									);
								})}
					</div>

					{!loading && items.length === 0 && (
						<p style={styles.status}>
							{term
								? `Nothing in the library matches "${term}".`
								: "The media library has no images yet."}
						</p>
					)}

					{nextCursor && !loading && (
						<div style={styles.moreRow}>
							<Button type="button" variant="secondary" onClick={loadMore} loading={loadingMore}>
								Load more
							</Button>
						</div>
					)}
				</div>

				<div style={styles.dialogFooter}>
					{error ? (
						<span style={styles.footerError} role="alert">
							{error}
						</span>
					) : (
						<span style={styles.footerNote}>
							{selected ? selectedName : "Select an image, or drop a file to upload."}
						</span>
					)}
					<Button type="button" variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						variant="primary"
						disabled={!selected}
						onClick={() => {
							if (selected) confirm(selected);
						}}>
						Select
					</Button>
				</div>

				{dragging && <div style={styles.dropOverlay}>Drop to upload</div>}

				<input
					ref={fileRef}
					type="file"
					accept="image/*"
					style={styles.srOnly}
					onChange={(event) => {
						void runUpload(firstImageFile(event.currentTarget.files));
						event.currentTarget.value = "";
					}}
				/>
			</div>
		</div>,
		document.body,
	);
}

interface MediaFieldControlProps {
	id: string;
	label: string;
	hint?: string;
	value: string;
	readOnly: boolean;
	onChange: (value: string) => void;
}

/**
 * The resting control in the sidebar: a thumbnail and filename once something
 * is chosen, a dashed target before that. Dropping a file anywhere on it
 * uploads without opening the library at all.
 *
 * The URL escape hatch stays, behind a toggle. Every existing layout stores
 * plain URL strings and some of them point outside the media library, so a
 * picker that could only ever produce library URLs would be a capability
 * regression over the text field it replaces.
 */
function MediaFieldControl({
	id,
	label,
	hint,
	value,
	readOnly,
	onChange,
}: MediaFieldControlProps): React.JSX.Element {
	const [open, setOpen] = React.useState(false);
	const [urlMode, setUrlMode] = React.useState(false);
	const [dragging, setDragging] = React.useState(false);
	const [uploading, setUploading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const displayName = useMediaName(value);
	const dragDepth = React.useRef(0);

	const handleDrop = async (files: FileList | null): Promise<void> => {
		const file = firstImageFile(files);
		if (!file || readOnly) return;
		setUploading(true);
		setError(null);
		try {
			const item = await uploadMedia(file);
			firstPageCache.clear();
			indexNames([item]);
			onChange(item.url);
		} catch (caught) {
			setError(messageOf(caught, `Could not upload ${file.name}.`));
		} finally {
			setUploading(false);
		}
	};

	const emptyStyle = dragging ? { ...styles.empty, ...styles.emptyDragging } : styles.empty;

	return (
		<FieldLabel label={label} icon={<ImageIcon />} el="div" readOnly={readOnly}>
			<div
				style={styles.control}
				onDragEnter={(event) => {
					if (readOnly) return;
					event.preventDefault();
					dragDepth.current += 1;
					setDragging(true);
				}}
				onDragOver={(event) => {
					if (!readOnly) event.preventDefault();
				}}
				onDragLeave={() => {
					dragDepth.current = Math.max(0, dragDepth.current - 1);
					if (dragDepth.current === 0) setDragging(false);
				}}
				onDrop={(event) => {
					if (readOnly) return;
					event.preventDefault();
					dragDepth.current = 0;
					setDragging(false);
					void handleDrop(event.dataTransfer.files);
				}}>
				{value ? (
					<div style={styles.filled}>
						<span style={styles.thumb}>
							<img src={value} alt="" decoding="async" style={styles.thumbImg} />
						</span>
						<span style={styles.filledMeta}>
							<span style={styles.filledName} title={value}>
								{displayName}
							</span>
							<span style={styles.filledPath}>
								{uploading ? "Uploading…" : dragging ? "Drop to replace" : value}
							</span>
						</span>
					</div>
				) : (
					<button
						type="button"
						id={id}
						style={emptyStyle}
						disabled={readOnly || uploading}
						onClick={() => setOpen(true)}>
						<ImageIcon />
						<span style={styles.emptyText}>
							<span>
								{uploading ? "Uploading…" : dragging ? "Drop to upload" : "Choose an image"}
							</span>
							<span style={styles.emptyHint}>Browse the media library, or drop a file</span>
						</span>
					</button>
				)}

				{urlMode && (
					<input
						type="text"
						style={styles.urlInput}
						placeholder="https://example.com/image.png"
						value={value}
						readOnly={readOnly}
						onChange={(event) => onChange(event.currentTarget.value)}
					/>
				)}

				{!readOnly && (
					<div style={styles.linkRow}>
						{value && (
							<>
								<button type="button" style={styles.link} onClick={() => setOpen(true)}>
									Replace
								</button>
								<button type="button" style={styles.linkMuted} onClick={() => onChange("")}>
									Remove
								</button>
							</>
						)}
						<button
							type="button"
							style={styles.linkMuted}
							onClick={() => setUrlMode((previous) => !previous)}>
							{urlMode ? "Hide URL" : "Use a URL"}
						</button>
					</div>
				)}

				{error && (
					<span style={styles.controlError} role="alert">
						{error}
					</span>
				)}
				{!error && hint && <span style={styles.emptyHint}>{hint}</span>}
			</div>

			{open && (
				<MediaPickerModal
					initialValue={value}
					onClose={() => setOpen(false)}
					onSelect={onChange}
				/>
			)}
		</FieldLabel>
	);
}

/**
 * Build a media-library-backed field for an image prop.
 *
 * Drop-in for `{ type: "text" }` on any prop holding an image URL:
 *
 *     image: mediaField("Image"),
 *     logo: mediaField("Logo", "Empty renders the name as a wordmark"),
 *
 * `hint` replaces what a text field would have said in `placeholder`, since a
 * picker has no placeholder to put it in.
 *
 * Generic over the value type because Puck's `CustomField<Value>` is invariant:
 * an optional prop is typed `string | undefined`, and a `CustomField<string>`
 * will not go where a `CustomField<string | undefined>` is wanted. `Value` is
 * inferred from the prop being assigned to. Clearing writes `""` rather than
 * `undefined`, matching what the text field it replaces produced.
 */
export function mediaField<Value extends string | undefined = string>(
	label: string,
	hint?: string,
): CustomField<Value> {
	return {
		type: "custom",
		label,
		/**
		 * Puck AI cannot infer anything about a `custom` field -- it has no
		 * type to reason from, only whatever is declared here. Without a
		 * schema the agent has nothing to populate these props from and skips
		 * them; with a naive one it writes a plausible-looking image URL for a
		 * file that does not exist, and a broken <img> ships to a public page.
		 *
		 * So: the shape is "a string", and the instruction is the real
		 * constraint -- this is a picker over an existing media library, and
		 * the model has no way to learn a valid key. `format: "uri"` is
		 * deliberately absent because real values are usually root-relative
		 * (`/_emdash/api/media/file/<id>.png`), which is not a valid absolute
		 * URI and would push the agent toward inventing an absolute one.
		 */
		ai: {
			schema: { type: "string" },
			instructions:
				"An EmDash media library URL. Never invent one: only reuse a URL " +
				"that already appears elsewhere in this document, or write an empty " +
				"string to leave the image unset for an author to pick.",
		},
		render: ({ id, value, onChange, readOnly }) => (
			<MediaFieldControl
				id={id}
				label={label}
				hint={hint}
				value={value ?? ""}
				readOnly={readOnly === true}
				onChange={(next) => onChange(next as Value)}
			/>
		),
	};
}
