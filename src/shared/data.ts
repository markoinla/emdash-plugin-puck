import type { Data } from "@puckeditor/core";

/**
 * A valid, empty Puck document. `Data` requires `root` and `content`; `root`
 * is itself fully partial, so `{}` is a legal root.
 *
 * Treat it as immutable: clone it (`structuredClone(EMPTY_DATA)`) before
 * handing it to anything that mutates.
 */
export const EMPTY_DATA: Data = {
	content: [],
	root: {},
};

/**
 * Structural check for stored Puck data.
 *
 * A page that has never been edited stores `null`/`undefined`; a page edited
 * by some earlier widget could store anything at all. Puck throws on a
 * malformed `data` prop, so anything that is not recognisably Puck `Data`
 * should fall back to the empty document.
 */
export function isPuckData(value: unknown): value is Data {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<Data>;
	if (!Array.isArray(candidate.content)) return false;
	if (typeof candidate.root !== "object" || candidate.root === null) return false;
	if (candidate.zones !== undefined) {
		if (typeof candidate.zones !== "object" || candidate.zones === null) return false;
	}
	return true;
}

/** Component type names of the top-level items, in document order. */
export function sectionNames(data: Data): string[] {
	return data.content
		.map((item) => (typeof item?.type === "string" ? item.type : null))
		.filter((name): name is string => name !== null);
}

/**
 * Whether a document carries component types invented by Puck AI's design
 * mode. Those live inside the document at `root.props._dynamicConfig`, and a
 * page that has any needs `withDynamicConfig` (from `@puckeditor/plugin-ai`)
 * to render. See `emdash-plugin-puck/render/designed`.
 */
export function hasDesignedComponents(data: Data | null | undefined): boolean {
	const props = (data?.root as { props?: Record<string, unknown> } | undefined)?.props;
	const dynamicConfig = props?._dynamicConfig;
	return (
		typeof dynamicConfig === "object" &&
		dynamicConfig !== null &&
		Object.keys(dynamicConfig as Record<string, unknown>).length > 0
	);
}
