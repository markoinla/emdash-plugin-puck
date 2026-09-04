import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import { mediaField } from "../../fields/media";
import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type LogosProps = WithLayout<{
	logos: { src: string; alt: string }[];
	grayscale: boolean;
	maxWidth: string;
}>;

/**
 * A customer or partner logo strip. Images come from the EmDash media library
 * through `mediaField()`, and `alt` is a real attribute so it stays a plain
 * text field with no inline editing.
 */
export function logosBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<LogosProps> = {
		label: "Logos",
		fields: {
			logos: {
				type: "array",
				label: "Logos",
				getItemSummary: (item, i) => item?.alt || `Logo ${(i ?? 0) + 1}`,
				defaultItemProps: { src: "", alt: "" },
				arrayFields: {
					src: mediaField("Logo"),
					alt: { type: "text", label: "Alt text" },
				},
			},
			grayscale: {
				type: "radio",
				label: "Treatment",
				options: [
					{ label: "Greyscale", value: true },
					{ label: "Full colour", value: false },
				],
			},
			maxWidth: { type: "select", label: "Width", options: [...ctx.options.maxWidth] },
		},
		defaultProps: {
			logos: [],
			grayscale: true,
			maxWidth: "1280px",
		},
		render: ({ logos, grayscale, maxWidth }) => (
			<Section maxWidth={maxWidth}>
				<div className={`zk-logos${grayscale ? " zk-logos--grayscale" : ""}`}>
					{logos
						.filter((logo) => logo.src)
						.map((logo, i) => (
							<img className="zk-logo" key={i} src={logo.src} alt={logo.alt} loading="lazy" />
						))}
				</div>
			</Section>
		),
	};

	return withAi(
		withLayout(inner, layoutField),
		"A partner or customer logo strip. Each logo's src is an EmDash media " +
			"library URL, so leave it empty for an author to pick rather than " +
			"writing a URL, and always give alt the organisation's name.",
	);
}
