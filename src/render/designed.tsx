/**
 * The public island for a page that contains AI-DESIGNED components.
 *
 * Puck AI has two modes. Assembly composes the blocks registered in your
 * config, and those pages render through `createPuckPage`. Design mode
 * instead invents new component types on the fly and persists them inside the
 * document at `root.props._dynamicConfig`, as HTML plus a page-level
 * stylesheet. Nothing in the static config knows those types exist, so
 * `<Render>` alone would treat every designed section as an unknown component
 * and drop it: correct in the admin, blank in production.
 *
 * `withDynamicConfig` reads those registrations back out of the data, turns
 * them into real components, and wraps `root.render` so the page's generated
 * stylesheet is emitted ahead of its content.
 *
 * WHY THIS IS A SEPARATE ENTRY. `@puckeditor/plugin-ai` ships as a single
 * bundle whose chat runtime does not tree-shake away from `withDynamicConfig`.
 * Keeping it in its own module means the bundler gives it its own chunk, and
 * Astro only ships the island the route actually renders, so an assembled page
 * never fetches it. That is also why this imports from ./boundaries rather
 * than from ./index: importing the sibling island would merge the chunks.
 */

import type { JSX } from "react";
import { useMemo } from "react";
import { Render } from "@puckeditor/core";
import type { Config } from "@puckeditor/core";
import { withDynamicConfig } from "@puckeditor/plugin-ai";

import { type AnyConfig, PageErrorBoundary, withBoundaries } from "./boundaries";
import type { PuckPageProps } from "./index";

export function createPuckPageDesigned(
	config: AnyConfig,
): (props: PuckPageProps) => JSX.Element {
	return function PuckPageDesigned({ data }: PuckPageProps) {
		// `withDynamicConfig` runs FIRST so that `withBoundaries` wraps the
		// designed components too: model-authored markup is exactly the kind
		// of thing that should cost its own section rather than the whole page.
		//
		// Keyed on `data` because the designed component types come OUT of the
		// data, unlike the static config the sibling island memoizes once.
		const safeConfig = useMemo(
			() => withBoundaries(withDynamicConfig(config as Config, data) as AnyConfig),
			[data],
		);

		return (
			<PageErrorBoundary>
				<Render config={safeConfig} data={data} />
			</PageErrorBoundary>
		);
	};
}
