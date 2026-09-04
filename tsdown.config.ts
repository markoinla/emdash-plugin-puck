import { defineConfig } from "tsdown";

/**
 * Seven entries, three environments.
 *
 * `index` is the server half: the descriptor factory and `createPlugin`.
 * `admin` and `ai/index` are the browser half, imported by EmDash's generated
 * admin registry through the site's own admin entry. `ai/handler` is an Astro
 * API route (server). `render/index`, `render/designed` and `fields` are
 * isomorphic: imported by the site's Puck config and public islands.
 *
 * `render/designed` is its own entry precisely so `render/index` never reaches
 * `@puckeditor/plugin-ai`: that package is one bundle whose chat runtime does
 * not tree-shake away, and it must only ship to pages that carry designed
 * components.
 *
 * Everything the host already has is external. Bundling a second copy of
 * React or of Puck is the documented way to break the admin.
 */
export default defineConfig({
	entry: {
		index: "src/index.ts",
		admin: "src/admin.tsx",
		"ai/index": "src/ai/admin.tsx",
		"ai/handler": "src/ai/handler.ts",
		"render/index": "src/render/index.tsx",
		"render/designed": "src/render/designed.tsx",
		fields: "src/fields/media.tsx",
	},
	format: "esm",
	dts: true,
	clean: true,
	platform: "neutral",
	deps: {
		neverBundle: [
		// `?url` stylesheet imports survive into the output verbatim. The host's
		// Vite resolves them: a bare specifier from node_modules, and
		// `./theme.css?url` relative to dist/admin.js, where the build copies
		// the sheet.
		/\.css(\?.*)?$/,
		"react",
		"react-dom",
		"react/jsx-runtime",
		"emdash",
		"astro",
		"@puckeditor/core",
		"@puckeditor/plugin-ai",
		"@puckeditor/cloud-client",
		],
	},
});
