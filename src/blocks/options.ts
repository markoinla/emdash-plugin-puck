/**
 * The closed option lists the blocks' spacing and sizing fields draw from.
 *
 * Puck's own demo types these as `number` fields, which lets an author type
 * `gap: 37` and produces pages that are almost, but not quite, aligned with
 * each other. Every value below is a step on a spacing or width scale, so a
 * page assembled by an editor (or by Puck AI, which sees the same options)
 * lands on the grid by construction. All three lists can be replaced through
 * `createBlocks({ options })`.
 */

export type Option<V = string> = { label: string; value: V };

/** Vertical rhythm: block padding and the Space block's size. */
export const spacingOptions: readonly Option[] = [
	{ label: "None", value: "0px" },
	{ label: "XS", value: "8px" },
	{ label: "S", value: "16px" },
	{ label: "M", value: "24px" },
	{ label: "L", value: "40px" },
	{ label: "XL", value: "64px" },
	{ label: "2XL", value: "96px" },
	{ label: "3XL", value: "128px" },
];

/** Gutters between the children of a Grid or a Flex. */
export const gapOptions: readonly Option[] = [
	{ label: "None", value: "0px" },
	{ label: "XS", value: "8px" },
	{ label: "S", value: "16px" },
	{ label: "M", value: "24px" },
	{ label: "L", value: "40px" },
	{ label: "XL", value: "64px" },
];

/** Content measures. */
export const maxWidthOptions: readonly Option[] = [
	{ label: "Narrow (640px)", value: "640px" },
	{ label: "Text (768px)", value: "768px" },
	{ label: "Content (1024px)", value: "1024px" },
	{ label: "Wide (1280px)", value: "1280px" },
	{ label: "Full bleed", value: "100%" },
];

/** Column counts a Grid offers. Capped at 6: past that nothing is readable. */
export const columnOptions: readonly Option<number>[] = [1, 2, 3, 4, 5, 6].map((n) => ({
	label: `${n}`,
	value: n,
}));

export interface BlockOptionLists {
	spacing: readonly Option[];
	gap: readonly Option[];
	maxWidth: readonly Option[];
}

export const defaultOptionLists: BlockOptionLists = {
	spacing: spacingOptions,
	gap: gapOptions,
	maxWidth: maxWidthOptions,
};
