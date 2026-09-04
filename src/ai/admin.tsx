/**
 * Puck AI in the admin: the chat panel that assembles and designs pages.
 *
 *     const ai = puckAi();
 *     export const { fields } = createPuckAdmin({ config, ...ai });
 *
 * Call it at MODULE scope. `createAiPlugin()` returns an object carrying
 * `render` and `overrides` components; building it inside a component would
 * hand Puck a new plugin identity on every render and remount the chat,
 * throwing away the conversation mid-generation.
 *
 * The server half is `createPuckAiHandler()` in `emdash-plugin-puck/ai/handler`,
 * mounted at `/api/puck/[...all]`. That path is a convention of Puck's client:
 * `createAiPlugin` exposes `host` (a different origin) but no path option.
 */

// Same treatment, same reasons as the sheets in ../admin.tsx: admin chrome
// that must not enter any public route's style graph.
import aiCssHref from "@puckeditor/plugin-ai/styles.css?url";

import type { Config, Data, Plugin } from "@puckeditor/core";
import { createAiPlugin, withDynamicConfig } from "@puckeditor/plugin-ai";

import { ensureStylesheet } from "../shared/dom";

type AiPluginProps = NonNullable<Parameters<typeof createAiPlugin>[0]>;

export interface PuckAiOptions {
	/**
	 * Show the assembly/design toggle in the chat panel. The server must also
	 * allow it (`designMode.allowed` on the handler); this only decides whether
	 * the control is visible. Default true.
	 */
	designMode?: boolean;
	/**
	 * Assembly composes the blocks in your config, so its output is
	 * production-shaped by default. Design mode invents new components and is
	 * a deliberate per-prompt escalation. Default "assembly".
	 */
	defaultMode?: "assembly" | "design";
	/**
	 * Suggestion chips in an empty chat. Deliberately empty by default: they
	 * are user-facing product copy, and invented ones imply capabilities the
	 * config may not have.
	 */
	examplePrompts?: NonNullable<AiPluginProps["chat"]>["examplePrompts"];
	/** A different origin for the AI route. The path stays `/api/puck`. */
	host?: string;
	/** Anything else `createAiPlugin` accepts, merged last. */
	plugin?: Omit<AiPluginProps, "designMode" | "defaultMode" | "host">;
}

export interface PuckAi {
	plugins: Plugin[];
	resolveConfig: (config: Config<any, any, any>, data: Data) => Config<any, any, any>;
}

export function puckAi(options: PuckAiOptions = {}): PuckAi {
	ensureStylesheet(aiCssHref);

	const plugin = createAiPlugin({
		designMode: { visible: options.designMode !== false },
		defaultMode: options.defaultMode ?? "assembly",
		host: options.host,
		...options.plugin,
		chat: {
			...(options.examplePrompts ? { examplePrompts: options.examplePrompts } : {}),
			...options.plugin?.chat,
		},
		/**
		 * The AI route is same-origin and authenticated by the EmDash admin
		 * session cookie. `X-EmDash-Request: 1` is the CSRF proof the route
		 * checks: browsers refuse to attach custom headers to cross-origin
		 * requests, so its presence proves same-origin. `credentials` is pinned
		 * rather than left to the default so the cookie is attached even when
		 * `host` moves the endpoint.
		 */
		prepareRequest: async (opts) => {
			const prepared = (await options.plugin?.prepareRequest?.(opts)) ?? opts;
			return {
				...prepared,
				credentials: "same-origin",
				headers: { ...prepared.headers, "X-EmDash-Request": "1" },
			};
		},
	});

	return {
		plugins: [plugin as unknown as Plugin],
		/**
		 * Design mode stores the component types it invents in
		 * `root.props._dynamicConfig`, so a page designed in an earlier session
		 * has component types the static config knows nothing about.
		 * `withDynamicConfig` reads them back out of the data and merges them
		 * in; without it, reopening such a page renders those sections as
		 * unknown components.
		 */
		resolveConfig: (config, data) => withDynamicConfig(config as Config, data),
	};
}
