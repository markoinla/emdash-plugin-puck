/**
 * emdash-plugin-puck: the server half.
 *
 * Registers one field widget, `puck:canvas`, that takes over any `json` field
 * and edits it with the Puck visual editor instead of a raw JSON textarea. The
 * stored value is Puck `Data` ({ root, content, zones? }), which the public
 * route renders with `emdash-plugin-puck/render`.
 *
 * The plugin is `format: "native"` because it renders React in the admin, and
 * only native plugins may. The trade-off is that it can never be installed
 * from the admin UI or the marketplace; it is registered in astro.config.mjs.
 */

import { definePlugin } from "emdash";
import type { PluginDefinition, PluginDescriptor } from "emdash";

const PACKAGE_NAME = "emdash-plugin-puck";
const PLUGIN_ID = "puck";
const PLUGIN_VERSION = "0.1.0";

export interface PuckPluginOptions {
	/**
	 * Absolute module specifier of YOUR admin entry: the file that builds the
	 * field widget from your Puck config with `createPuckAdmin()` and exports
	 * `fields`. Pass `new URL("./src/puck/admin.tsx", import.meta.url).href`.
	 *
	 * It has to be yours rather than this package's because the widget needs
	 * your `config`, and EmDash inlines `adminEntry` verbatim into its generated
	 * `virtual:emdash/admin-registry` module, so it must resolve without a
	 * relative anchor (a bare relative path fails there).
	 */
	adminEntry: string;
	/** Label shown for the widget in the admin's field settings. Default "Puck canvas". */
	widgetLabel?: string;
}

/**
 * The descriptor `astro.config.mjs` registers:
 *
 * ```js
 * import puck from "emdash-plugin-puck";
 * emdash({
 *   plugins: [puck({ adminEntry: new URL("./src/puck/admin.tsx", import.meta.url).href })],
 * })
 * ```
 */
export function puckPlugin(options: PuckPluginOptions): PluginDescriptor<PuckPluginOptions> {
	if (!options?.adminEntry) {
		throw new Error(
			`${PACKAGE_NAME}: \`adminEntry\` is required. Pass the absolute URL of the module ` +
				`that calls createPuckAdmin() and exports \`fields\`.`,
		);
	}
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: PACKAGE_NAME,
		adminEntry: options.adminEntry,
		options,
	};
}

function buildDefinition(options: PuckPluginOptions): PluginDefinition {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		admin: {
			// The descriptor's `adminEntry` is what the admin registry actually
			// imports; this is the plugin's own declaration of the same module,
			// and it is what flips the plugin's admin mode to "react" in the
			// admin manifest.
			entry: options.adminEntry,
			fieldWidgets: [
				{
					name: "canvas",
					label: options.widgetLabel ?? "Puck canvas",
					fieldTypes: ["json"],
				},
			],
		},
	};
}

/**
 * Called by EmDash's generated plugins module at runtime, with the descriptor's
 * `options` JSON-round-tripped.
 */
export function createPlugin(options: PuckPluginOptions) {
	return definePlugin(buildDefinition(options));
}

export default puckPlugin;
