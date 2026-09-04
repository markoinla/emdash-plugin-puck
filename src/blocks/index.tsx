/**
 * emdash-plugin-puck/blocks: a composable starter kit.
 *
 * Layout containers and leaf elements that snap together into feature grids,
 * media splits and CTA rows without a developer: Grid, Flex and Space; Heading,
 * Text, Prose, Card, Stats, Logos and Button.
 *
 * Ported from Puck's own demo app (apps/demo/config in puckeditor/puck), the
 * reference implementation of the pattern: a `withLayout` HOC that gives every
 * block parent-aware placement controls, slot fields for nesting, and
 * `contentEditable` fields so copy is edited on the canvas. What changed on
 * the way over: closed token selects instead of free numbers, one plain
 * stylesheet instead of CSS modules (the block panel injects CSS into its
 * preview iframe as raw text, where hashed class names would not survive),
 * no `--puck-*` variables (those exist in the admin only), the EmDash media
 * picker instead of pasted URLs, and a closed icon vocabulary you supply
 * instead of lucide's 1,500-entry list.
 *
 *     import { createBlocks } from "emdash-plugin-puck/blocks";
 *     import "emdash-plugin-puck/blocks.css";
 *
 *     const kit = createBlocks({ resolveHref: withBase });
 *     export const config = {
 *       categories: { ...kit.categories },
 *       components: { ...kit.components },
 *     };
 *
 * The stylesheet also has to reach the block panel's preview iframe: pass
 * `import blocksCss from "emdash-plugin-puck/blocks.css?raw"` as
 * `blockPanel.css` in the admin entry.
 */

import { buildLayoutField, withLayout } from "./Layout";
import { Section } from "./Section";
import type { BlocksContext, BlocksOptions } from "./context";
import { defaultOptionLists } from "./options";
import { buttonBlock } from "./blocks/Button";
import { cardBlock } from "./blocks/Card";
import { flexBlock } from "./blocks/Flex";
import { gridBlock } from "./blocks/Grid";
import { headingBlock } from "./blocks/Heading";
import { logosBlock } from "./blocks/Logos";
import { proseBlock } from "./blocks/Prose";
import { spaceBlock } from "./blocks/Space";
import { statsBlock } from "./blocks/Stats";
import { textBlock } from "./blocks/Text";

export type { ButtonAction, BlocksOptions } from "./context";
export type { LayoutFieldProps, WithLayout } from "./Layout";
export type { BlockOptionLists, Option } from "./options";
export type { ButtonProps } from "./blocks/Button";
export type { CardProps } from "./blocks/Card";
export type { FlexProps } from "./blocks/Flex";
export type { GridProps } from "./blocks/Grid";
export type { HeadingProps } from "./blocks/Heading";
export type { LogosProps } from "./blocks/Logos";
export type { ProseProps } from "./blocks/Prose";
export type { SpaceProps } from "./blocks/Space";
export type { StatsProps } from "./blocks/Stats";
export type { TextProps } from "./blocks/Text";
export { Section, withLayout, buildLayoutField };
export { columnOptions, gapOptions, maxWidthOptions, spacingOptions } from "./options";

/** The `PuckComponentProps` entries for the kit, to merge into your config's generic. */
export type BlockComponentProps = {
	Grid: import("./blocks/Grid").GridProps;
	Flex: import("./blocks/Flex").FlexProps;
	Space: import("./blocks/Space").SpaceProps;
	Heading: import("./blocks/Heading").HeadingProps;
	Text: import("./blocks/Text").TextProps;
	Prose: import("./blocks/Prose").ProseProps;
	Card: import("./blocks/Card").CardProps;
	Stats: import("./blocks/Stats").StatsProps;
	Logos: import("./blocks/Logos").LogosProps;
	Button: import("./blocks/Button").ButtonProps;
};

/** The registry keys the kit occupies. */
export type BlockName = keyof BlockComponentProps;

function defaultButtonClassName(variant: "primary" | "secondary", size: "default" | "large") {
	return `zk-btn zk-btn--${variant}${size === "large" ? " zk-btn--lg" : ""}`;
}

export function createBlocks(options: BlocksOptions = {}) {
	const ctx: BlocksContext = {
		icons: options.icons,
		resolveHref: options.resolveHref ?? ((href) => href),
		disallow: options.disallow ?? [],
		buttonActions: options.buttonActions ?? [],
		buttonClassName: options.buttonClassName ?? defaultButtonClassName,
		options: { ...defaultOptionLists, ...options.options },
	};
	const layoutField = buildLayoutField(ctx.options.spacing);

	const components = {
		Grid: gridBlock(ctx, layoutField),
		Flex: flexBlock(ctx, layoutField),
		Space: spaceBlock(ctx),
		Heading: headingBlock(ctx, layoutField),
		Text: textBlock(ctx, layoutField),
		Prose: proseBlock(ctx, layoutField),
		Card: cardBlock(ctx, layoutField),
		Stats: statsBlock(ctx, layoutField),
		Logos: logosBlock(ctx, layoutField),
		Button: buttonBlock(ctx, layoutField),
	};

	/**
	 * Two categories rather than one because the drawer is the only place an
	 * author learns what nests in what: a Layout block takes children, a
	 * Content block is a leaf.
	 */
	const categories: Record<"layout" | "content", { title: string; components: BlockName[] }> = {
		layout: { title: "Layout", components: ["Grid", "Flex", "Space"] },
		content: {
			title: "Content",
			components: ["Heading", "Text", "Prose", "Card", "Stats", "Logos", "Button"],
		},
	};

	return { components, categories };
}
