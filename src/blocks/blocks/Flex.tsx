import type { ComponentConfig, ObjectField, Slot } from "@puckeditor/core";

import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type FlexProps = WithLayout<{
	direction: "row" | "column";
	justify: "start" | "center" | "end" | "between";
	align: "start" | "center" | "end" | "stretch";
	gap: string;
	wrap: "wrap" | "nowrap";
	maxWidth: string;
	items: Slot;
}>;

/**
 * Author-facing values translated to CSS keywords. Maps rather than a template
 * literal because `start` and `end` become `flex-start` / `flex-end` while
 * `center`, `stretch` and `space-between` do not.
 */
const JUSTIFY: Record<FlexProps["justify"], string> = {
	start: "flex-start",
	center: "center",
	end: "flex-end",
	between: "space-between",
};

const ALIGN: Record<FlexProps["align"], string> = {
	start: "flex-start",
	center: "center",
	end: "flex-end",
	stretch: "stretch",
};

/**
 * A flex row or column, for the arrangements a Grid's equal columns cannot
 * express: a button pair, a logo beside a caption, an unevenly weighted split.
 */
export function flexBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<FlexProps> = {
		label: "Flex",
		fields: {
			direction: {
				type: "radio",
				label: "Direction",
				options: [
					{ label: "Row", value: "row" },
					{ label: "Column", value: "column" },
				],
			},
			justify: {
				type: "select",
				label: "Distribute",
				options: [
					{ label: "Start", value: "start" },
					{ label: "Center", value: "center" },
					{ label: "End", value: "end" },
					{ label: "Space between", value: "between" },
				],
			},
			align: {
				type: "select",
				label: "Align",
				options: [
					{ label: "Start", value: "start" },
					{ label: "Center", value: "center" },
					{ label: "End", value: "end" },
					{ label: "Stretch", value: "stretch" },
				],
			},
			gap: { type: "select", label: "Gap", options: [...ctx.options.gap] },
			wrap: {
				type: "radio",
				label: "Wrap",
				options: [
					{ label: "Wrap", value: "wrap" },
					{ label: "No wrap", value: "nowrap" },
				],
			},
			maxWidth: { type: "select", label: "Width", options: [...ctx.options.maxWidth] },
			items: { type: "slot", label: "Content" },
		},
		defaultProps: {
			direction: "row",
			justify: "start",
			align: "stretch",
			gap: "24px",
			wrap: "wrap",
			maxWidth: "1280px",
			items: [],
		},
		render: ({ direction, justify, align, gap, wrap, maxWidth, items: Items }) => (
			<Section maxWidth={maxWidth} style={{ height: "100%" }}>
				<Items
					className="zk-flex"
					disallow={ctx.disallow}
					style={{
						flexDirection: direction,
						justifyContent: JUSTIFY[justify],
						alignItems: ALIGN[align],
						gap,
						flexWrap: wrap,
					}}
				/>
			</Section>
		),
	};

	return withAi(
		withLayout(inner, layoutField),
		"For arrangements a Grid's equal columns cannot express: a pair of " +
			"Buttons, a logo beside a caption, or a media-and-text split where one " +
			"side is set to fill the space and the other is not. Prefer Grid when " +
			"the children are the same kind of thing.",
	);
}
