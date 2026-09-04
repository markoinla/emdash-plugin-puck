import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type ProseProps = WithLayout<{
	content: string;
	maxWidth: string;
}>;

/**
 * Rich body copy: the one block where an author gets bold, italic, links and
 * lists rather than a single run of plain text.
 *
 * The `richtext` field is Puck's own TipTap-backed editor. `options` is a
 * DENY list: every extension is registered unless the key is set to `false`.
 * Headings are off because the Heading block owns those, so a page's outline
 * stays inspectable as fields instead of buried inside stored HTML.
 */
export function proseBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const inner: ComponentConfig<ProseProps> = {
		label: "Prose",
		fields: {
			content: {
				type: "richtext",
				label: "Content",
				contentEditable: true,
				options: {
					heading: false,
					code: false,
					codeBlock: false,
					horizontalRule: false,
					strike: false,
					underline: false,
					textAlign: false,
				},
			},
			maxWidth: { type: "select", label: "Width", options: [...ctx.options.maxWidth] },
		},
		defaultProps: {
			content: "<p>Body copy.</p>",
			maxWidth: "768px",
		},
		render: ({ content, maxWidth }) => (
			<Section maxWidth={maxWidth}>
				<div className="zk-prose">{content}</div>
			</Section>
		),
	};

	return withAi(
		withLayout(inner, layoutField),
		"Rich body copy: the only block that carries links, emphasis and lists. " +
			"The value is an HTML string limited to p, strong, em, a, ul, ol and li. " +
			"Never emit a heading tag here; use the Heading block so the page " +
			"outline stays editable as fields.",
	);
}
