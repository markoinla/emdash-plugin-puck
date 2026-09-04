import type { ComponentConfig, ObjectField } from "@puckeditor/core";

import type { Editable } from "../../shared/types";
import { withAi } from "../ai";
import type { BlocksContext } from "../context";
import { Section } from "../Section";
import { withLayout, type LayoutFieldProps, type WithLayout } from "../Layout";

export type ButtonProps = WithLayout<{
	label: Editable;
	action: string;
	href: string;
	variant: "primary" | "secondary";
	size: "default" | "large";
	align: "left" | "center" | "right";
}>;

/**
 * A call to action.
 *
 * `action` is "link" plus whatever `createBlocks({ buttonActions })` adds, so
 * an author never has to know how a contact drawer is opened: picking a
 * custom action swaps the anchor for a <button> that calls its handler, and
 * `resolveFields` hides the href field for it rather than leaving a text
 * input that does nothing.
 *
 * `href` stays a plain string with no `contentEditable`: it is an attribute,
 * and an inline-editable field would arrive here as a React node.
 */
export function buttonBlock(ctx: BlocksContext, layoutField: ObjectField<LayoutFieldProps>) {
	const actions = ctx.buttonActions;

	const fields: NonNullable<ComponentConfig<ButtonProps>["fields"]> = {
		label: { type: "text", label: "Label", contentEditable: true },
		...(actions.length > 0
			? {
					action: {
						type: "radio" as const,
						label: "Action",
						options: [
							{ label: "Go to a link", value: "link" },
							...actions.map((a) => ({ label: a.label, value: a.value })),
						],
					},
				}
			: {}),
		href: { type: "text", label: "Link", placeholder: "/pricing or #section-id" },
		variant: {
			type: "radio",
			label: "Style",
			options: [
				{ label: "Primary", value: "primary" },
				{ label: "Secondary", value: "secondary" },
			],
		},
		size: {
			type: "radio",
			label: "Size",
			options: [
				{ label: "Default", value: "default" },
				{ label: "Large", value: "large" },
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
	} as NonNullable<ComponentConfig<ButtonProps>["fields"]>;

	const inner: ComponentConfig<ButtonProps> = {
		label: "Button",
		fields,
		resolveFields: (data) => {
			if (!data.props.action || data.props.action === "link") return fields;
			const { href: _href, ...rest } = fields;
			return rest as typeof fields;
		},
		defaultProps: {
			label: "Get started",
			action: "link",
			href: "#",
			variant: "primary",
			size: "default",
			align: "left",
		},
		render: ({ label, action, href, variant, size, align }) => {
			const className = ctx.buttonClassName(variant, size);
			const custom = actions.find((a) => a.value === action);

			return (
				<Section maxWidth="1280px">
					<div className="zk-button" style={{ textAlign: align }}>
						{custom ? (
							<button type="button" className={className} onClick={custom.onClick}>
								{label}
							</button>
						) : (
							<a className={className} href={ctx.resolveHref(href)}>
								{label}
							</a>
						)}
					</div>
				</Section>
			);
		},
	};

	const actionHint =
		actions.length > 0
			? ` Custom actions: ${actions.map((a) => `'${a.value}' (${a.label})`).join(", ")}; otherwise use 'link'.`
			: "";

	return withAi(
		withLayout(inner, layoutField),
		"A call to action. An href of '#' followed by a section id scrolls to a " +
			"section on this page." +
			actionHint,
	);
}
