import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import type { Editable } from "../../shared/types";
import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type TextProps = WithLayout<{
	text: Editable;
	size: "s" | "m" | "l";
	tone: "default" | "muted";
	align: "left" | "center" | "right";
	maxWidth: string;
}>;

/** A paragraph of plain body copy. Reach for Prose when it needs links or emphasis. */
export function textBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<TextProps> = {
		label: "Text",
		fields: {
			text: { type: "textarea", label: "Text", contentEditable: true },
			size: {
				type: "select",
				label: "Size",
				options: [
					{ label: "S", value: "s" },
					{ label: "M", value: "m" },
					{ label: "L", value: "l" },
				],
			},
			tone: {
				type: "radio",
				label: "Tone",
				options: [
					{ label: "Default", value: "default" },
					{ label: "Muted", value: "muted" },
				],
			},
			align: {
				type: "radio",
				label: "Align",
				options: [
					{ label: "Left", value: "left" },
					{ label: "Center", value: "center" },
					{ label: "Right", value: "right" },
				],
			},
			maxWidth: { type: "select", label: "Width", options: [...ctx.options.maxWidth] },
		},
		defaultProps: {
			text: "Body copy.",
			size: "m",
			tone: "default",
			align: "left",
			maxWidth: "768px",
		},
		render: ({ text, size, tone, align, maxWidth }) => (
			<Section maxWidth={maxWidth}>
				<p className={`zk-text zk-text--${size} zk-text--${tone}`} style={{ textAlign: align }}>
					{text}
				</p>
			</Section>
		),
	};

	return withAi(
		withLayout(inner, layoutField),
		"A single run of plain body copy. If the passage needs a link, bold, or " +
			"a bullet list, use Prose instead.",
	);
}
