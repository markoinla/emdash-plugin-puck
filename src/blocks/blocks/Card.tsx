import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import type { Editable } from "../../shared/types";
import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type CardProps = WithLayout<{
	icon: string;
	title: Editable;
	body: Editable;
	linkLabel: Editable;
	linkHref: string;
	mode: "card" | "flat";
	align: "left" | "center";
}>;

/**
 * The feature-grid cell: an optional icon, a title, body copy, an optional
 * link. Designed to be dropped into a Grid, which is why it fills its cell's
 * height rather than sizing to its content.
 *
 * Puck's demo builds its icon field from lucide's full `dynamicIconImports`
 * map: roughly 1,500 select options and a dynamic import per icon. This takes
 * a closed vocabulary from `createBlocks({ icons })`, so the props stay JSON
 * (an icon travels as a string key, never a component). Without `icons` the
 * field is absent.
 */
export function cardBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const iconField = ctx.icons
		? {
				icon: {
					type: "select" as const,
					label: "Icon",
					options: [{ label: "None", value: "" }, ...ctx.icons.options],
				},
			}
		: {};

	const inner: ComponentConfig<CardProps> = {
		label: "Card",
		fields: {
			...iconField,
			title: { type: "text", label: "Title", contentEditable: true },
			body: { type: "textarea", label: "Body", contentEditable: true },
			linkLabel: { type: "text", label: "Link label", contentEditable: true },
			linkHref: { type: "text", label: "Link URL" },
			mode: {
				type: "radio",
				label: "Style",
				options: [
					{ label: "Card", value: "card" },
					{ label: "Flat", value: "flat" },
				],
			},
			align: {
				type: "radio",
				label: "Align",
				options: [
					{ label: "Left", value: "left" },
					{ label: "Center", value: "center" },
				],
			},
		} as ComponentConfig<CardProps>["fields"],
		defaultProps: {
			icon: ctx.icons?.options[0]?.value ?? "",
			title: "Title",
			body: "What this does for the customer, in one or two sentences.",
			linkLabel: "",
			linkHref: "",
			mode: "card",
			align: "left",
		},
		render: ({ icon, title, body, linkLabel, linkHref, mode, align }) => {
			const iconNode = icon && ctx.icons ? ctx.icons.render(icon) : null;

			return (
				<Section maxWidth="100%">
					<div className={`zk-card zk-card--${mode} zk-card--${align}`}>
						{iconNode ? (
							<div className="zk-card-icon" aria-hidden="true">
								{iconNode}
							</div>
						) : null}
						<h3 className="zk-card-title">{title}</h3>
						<p className="zk-card-body">{body}</p>
						{linkHref ? (
							<a className="zk-card-link" href={ctx.resolveHref(linkHref)}>
								{linkLabel}
							</a>
						) : null}
					</div>
				</Section>
			);
		},
	};

	return withAi(
		withLayout(inner, layoutField),
		"A feature or capability cell, intended to be placed inside a Grid " +
			"rather than at the page root. icon must be one of the listed keys or an " +
			"empty string, never an invented name. Leave linkHref empty unless the " +
			"card genuinely links somewhere on this site.",
	);
}
