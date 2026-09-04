import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import type { Editable } from "../../shared/types";
import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type StatsProps = WithLayout<{
	items: { value: Editable; label: Editable }[];
	tone: "brand" | "plain";
	maxWidth: string;
}>;

/**
 * A row of headline figures on a brand panel.
 *
 * The array's sub-fields are inline-editable too, so an author edits the
 * numbers on the canvas rather than expanding array rows in the sidebar.
 * `getItemSummary` therefore type-checks `item.value` rather than
 * interpolating it: inside <Puck> that value is a React node.
 */
export function statsBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<StatsProps> = {
		label: "Stats",
		fields: {
			items: {
				type: "array",
				label: "Stats",
				min: 1,
				max: 6,
				getItemSummary: (item, i) =>
					typeof item?.value === "string" && item.value ? item.value : `Stat ${(i ?? 0) + 1}`,
				defaultItemProps: { value: "100+", label: "Metric" },
				arrayFields: {
					value: { type: "text", label: "Value", contentEditable: true },
					label: { type: "text", label: "Label", contentEditable: true },
				},
			},
			tone: {
				type: "radio",
				label: "Style",
				options: [
					{ label: "Brand panel", value: "brand" },
					{ label: "Plain", value: "plain" },
				],
			},
			maxWidth: { type: "select", label: "Width", options: [...ctx.options.maxWidth] },
		},
		defaultProps: {
			items: [
				{ value: "100+", label: "Customers" },
				{ value: "24/7", label: "Support" },
				{ value: "99.9%", label: "Uptime" },
			],
			tone: "brand",
			maxWidth: "1280px",
		},
		render: ({ items, tone, maxWidth }) => (
			<Section maxWidth={maxWidth}>
				<div
					className={`zk-stats zk-stats--${tone}`}
					style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, minmax(0, 1fr))` }}
				>
					{items.map((item, i) => (
						<div className="zk-stat" key={i}>
							<div className="zk-stat-value">{item.value}</div>
							<div className="zk-stat-label">{item.label}</div>
						</div>
					))}
				</div>
			</Section>
		),
	};

	return withAi(
		withLayout(inner, layoutField),
		"Headline figures. Put the number and any '+' in value and keep label to " +
			"a two or three word noun phrase. Three stats reads best and six is the " +
			"maximum. Never invent a metric: use only figures supplied to you.",
	);
}
