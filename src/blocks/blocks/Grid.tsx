import type { ComponentConfig, Slot } from "@puckeditor/core";

import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type WithLayout } from "../Layout";
import { columnOptions } from "../options";
import type { ObjectField } from "@puckeditor/core";
import type { LayoutFieldProps } from "../Layout";

export type GridProps = WithLayout<{
	columns: number;
	gap: string;
	maxWidth: string;
	items: Slot;
}>;

/**
 * A responsive column grid. Single column below 768px, `columns` above it.
 * The collapse is in the stylesheet rather than an author control, because a
 * per-breakpoint column count is the field that turns a page builder into a
 * CSS editor.
 */
export function gridBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<GridProps> = {
		label: "Grid",
		fields: {
			columns: { type: "select", label: "Columns", options: [...columnOptions] },
			gap: { type: "select", label: "Gap", options: [...ctx.options.gap] },
			maxWidth: { type: "select", label: "Width", options: [...ctx.options.maxWidth] },
			items: { type: "slot", label: "Content" },
		},
		defaultProps: {
			columns: 3,
			gap: "24px",
			maxWidth: "1280px",
			items: [],
		},
		render: ({ columns, gap, maxWidth, items: Items }) => (
			<Section maxWidth={maxWidth}>
				<Items
					className="zk-grid"
					disallow={ctx.disallow}
					style={{ gap, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
				/>
			</Section>
		),
	};

	return withAi(
		withLayout(inner, layoutField),
		"The default container for a set of repeated items: use it with Card " +
			"children for a feature grid, or Stats for a figures row. Three columns " +
			"reads best for cards, two for anything with a paragraph of body copy. " +
			"It collapses to one column below 768px on its own, so never add a " +
			"second Grid to handle small screens.",
	);
}
