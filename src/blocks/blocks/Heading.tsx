import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import type { Editable } from "../../shared/types";
import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type HeadingProps = WithLayout<{
	text: Editable;
	size: "xs" | "s" | "m" | "l" | "xl" | "xxl";
	level: "" | "1" | "2" | "3" | "4" | "5" | "6";
	align: "left" | "center" | "right";
	maxWidth: string;
}>;

/**
 * A heading, with its visual size and its document level as separate fields.
 *
 * `size` is how big it looks, `level` is where it sits in the outline a
 * screen reader and a crawler walk. Tying them together is what produces
 * pages whose h2 is followed by an h4 because the author wanted smaller text.
 * An empty `level` renders a <div>, for a heading that is decorative.
 */
export function headingBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<HeadingProps> = {
		label: "Heading",
		fields: {
			text: { type: "textarea", label: "Text", contentEditable: true },
			size: {
				type: "select",
				label: "Size",
				options: [
					{ label: "XS", value: "xs" },
					{ label: "S", value: "s" },
					{ label: "M", value: "m" },
					{ label: "L", value: "l" },
					{ label: "XL", value: "xl" },
					{ label: "XXL", value: "xxl" },
				],
			},
			level: {
				type: "select",
				label: "Heading level",
				options: [
					{ label: "None (decorative)", value: "" },
					{ label: "h1", value: "1" },
					{ label: "h2", value: "2" },
					{ label: "h3", value: "3" },
					{ label: "h4", value: "4" },
					{ label: "h5", value: "5" },
					{ label: "h6", value: "6" },
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
			text: "Heading",
			size: "l",
			level: "2",
			align: "left",
			maxWidth: "1280px",
			layout: { padding: "8px" },
		},
		render: ({ text, size, level, align, maxWidth }) => {
			const Tag = (level ? `h${level}` : "div") as "h2";

			return (
				<Section maxWidth={maxWidth}>
					<Tag className={`zk-heading zk-heading--${size}`} style={{ textAlign: align }}>
						{text}
					</Tag>
				</Section>
			);
		},
	};

	return withAi(
		withLayout(inner, layoutField),
		"Size and heading level are separate fields on purpose. Set level to " +
			"keep the document outline correct (one h1 per page, and never skip " +
			"from h2 to h4), and set size purely for how large it should look.",
	);
}
