/**
 * emdash-plugin-puck/render: the public half.
 *
 * `createPuckPage(config)` builds the hydration boundary for a Puck-authored
 * page. Use it as an Astro island:
 *
 *     // src/puck/PuckPage.tsx
 *     export default createPuckPage(config);
 *
 *     // src/pages/[...slug].astro
 *     <PuckPage client:load data={layout} />
 *
 * WHY AN ISLAND. Calling Puck's `<Render>` from `.astro` with no client
 * directive server-renders the document and ships zero JavaScript, which is
 * right for a page of prose blocks and wrong for one whose sections are
 * interactive. Astro cannot put a client directive on a component nested
 * inside `<Render>`, so the whole document becomes one island: Astro
 * server-renders it (every heading and link is in the HTML for crawlers) and
 * hydrates it in place.
 *
 * THE ONE RULE THIS IMPOSES ON BLOCKS. Everything in the tree is evaluated on
 * the server, so a module that touches `window`, `document` or `navigator` at
 * module scope (mapbox-gl, for one) must be reached through a dynamic
 * `import()`, never a static one.
 *
 * WHAT THIS DELIBERATELY CANNOT RENDER. Pages whose authors used Puck AI's
 * design mode carry extra component types inside the document itself.
 * Rendering those needs `withDynamicConfig` from `@puckeditor/plugin-ai`,
 * which is one bundle whose chat runtime does not tree-shake away: importing
 * it here was measured at +800KB on every public page. That path is
 * `emdash-plugin-puck/render/designed`; pick between the two per page with
 * `hasDesignedComponents(data)`.
 */

import type { JSX } from "react";
import { useMemo } from "react";
import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";

import { type AnyConfig, PageErrorBoundary, withBoundaries } from "./boundaries";

export { BlockErrorBoundary, ErrorBoundary, PageErrorBoundary, withBoundaries } from "./boundaries";
export type { AnyConfig } from "./boundaries";
export { EMPTY_DATA, hasDesignedComponents, isPuckData } from "../shared/data";

export type { Editable } from "../shared/types";

/**
 * Puck types a component's `render` as returning `JSX.Element`, but a section
 * may legitimately render nothing (an empty list). React and Puck both handle
 * a `null` return fine; this only relaxes the static type.
 */
export function renderable<P>(component: (props: P) => JSX.Element | null) {
	return component as (props: P) => JSX.Element;
}

export interface ParseLayoutOptions {
	/**
	 * Applied to the parsed document before it is returned. The place to
	 * rewrite stored media URLs to a CDN, for instance: doing it on the parsed
	 * object reaches nested values an allowlist would miss.
	 */
	transform?: (data: Data) => Data;
}

/**
 * Coerce a stored `json` field value into Puck `Data`, or `null`.
 *
 * EmDash's loader JSON.parses values that start with `{` or `[`, so this is
 * normally an object already, but a driver that hands back the raw column
 * still gives a string, so both are accepted. Anything unparseable, empty, or
 * not shaped like Puck data becomes `null` so the route can render a
 * placeholder instead of crashing. An empty document is `null` too.
 */
export function parseLayout(value: unknown, options: ParseLayoutOptions = {}): Data | null {
	let candidate: unknown = value;

	if (typeof candidate === "string") {
		const trimmed = candidate.trim();
		if (!trimmed) return null;
		try {
			candidate = JSON.parse(trimmed);
		} catch {
			return null;
		}
	}

	if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
		return null;
	}

	const shape = candidate as Partial<Data>;
	const content = Array.isArray(shape.content) ? shape.content : [];
	if (content.length === 0) return null;

	const data = { ...shape, content, root: shape.root ?? {} } as Data;
	return options.transform ? options.transform(data) : data;
}

export interface PuckPageProps {
	data: Data;
}

/**
 * Build the public island for pages assembled from your config.
 *
 * `data` arrives as a prop rather than being fetched here so the route stays
 * the only thing that talks to EmDash, and so Astro serializes the document
 * into the island's props exactly once. The config cannot be a prop: it holds
 * React components, and Astro serializes island props to JSON.
 */
export function createPuckPage(config: AnyConfig): (props: PuckPageProps) => JSX.Element {
	return function PuckPage({ data }: PuckPageProps) {
		// Built once per mount. Rebuilding it on every render would give Puck
		// a new component identity each time and remount every section.
		const safeConfig = useMemo(() => withBoundaries(config), []);

		return (
			<PageErrorBoundary>
				<Render config={safeConfig} data={data} />
			</PageErrorBoundary>
		);
	};
}
