import { forwardRef, type CSSProperties, type ReactNode } from "react";

import type { ComponentConfig, DefaultComponentProps, ObjectField } from "@puckeditor/core";

import type { Option } from "./options";

/**
 * The per-instance layout controls every block carries.
 *
 * A block cannot know how it will be placed: the same Card is a grid cell on
 * one page, a flex child on another, and a lone element at the page root on a
 * third. Each of those wants a DIFFERENT control (a column span, a flex grow,
 * or just vertical padding), and showing all three everywhere is how a
 * sidebar becomes unusable. `withLayout` therefore adds one `layout` object
 * field and narrows it per parent in `resolveFields`.
 *
 * Ported from Puck's own demo app (apps/demo/config/components/Layout). Two
 * deliberate changes: padding is a token select rather than a free number,
 * and the wrapper class is a plain class rather than a CSS module, because the
 * block panel injects the stylesheet into its preview iframe as raw text and a
 * hashed module class would not survive that.
 */
export type LayoutFieldProps = {
	padding?: string;
	spanCol?: number;
	spanRow?: number;
	grow?: boolean;
};

export type WithLayout<Props extends DefaultComponentProps> = Props & {
	layout?: LayoutFieldProps;
};

type LayoutProps = WithLayout<{
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
}>;

export function buildLayoutField(spacing: readonly Option[]): ObjectField<LayoutFieldProps> {
	return {
		type: "object",
		label: "Layout",
		objectFields: {
			spanCol: { label: "Columns to span", type: "number", min: 1, max: 12 },
			spanRow: { label: "Rows to span", type: "number", min: 1, max: 12 },
			grow: {
				label: "Fill available space",
				type: "radio",
				options: [
					{ label: "Yes", value: true },
					{ label: "No", value: false },
				],
			},
			padding: { type: "select", label: "Vertical padding", options: [...spacing] },
		},
	};
}

const Layout = forwardRef<HTMLDivElement, LayoutProps>(
	({ children, className, layout, style }, ref) => (
		<div
			className={className}
			style={{
				gridColumn: layout?.spanCol
					? `span ${Math.max(Math.min(layout.spanCol, 12), 1)}`
					: undefined,
				gridRow: layout?.spanRow
					? `span ${Math.max(Math.min(layout.spanRow, 12), 1)}`
					: undefined,
				paddingTop: layout?.padding,
				paddingBottom: layout?.padding,
				flex: layout?.grow ? "1 1 0" : undefined,
				...style,
			}}
			ref={ref}
		>
			{children}
		</div>
	),
);

Layout.displayName = "PuckLayout";

/**
 * Wraps a block config so it gains the `layout` field and the wrapper element
 * that applies it.
 *
 * `inline: true` tells Puck not to add its own wrapper around the render
 * output, which is what makes the layout div the element Puck measures and
 * drags; that is also why the render must forward `puck.dragRef` to it. Drop
 * either half and the block still renders but becomes undraggable.
 *
 * The narrowing keys on the PARENT'S registry name, so the layout blocks must
 * be registered as "Grid" and "Flex" for spans and grow to appear.
 */
export function withLayout<C extends ComponentConfig<any>>(
	componentConfig: C,
	layoutField: ObjectField<LayoutFieldProps>,
): C {
	const baseFields = componentConfig.fields ?? {};

	return {
		...componentConfig,
		fields: {
			...baseFields,
			layout: layoutField,
		},
		defaultProps: {
			...componentConfig.defaultProps,
			layout: {
				spanCol: 1,
				spanRow: 1,
				padding: "0px",
				grow: false,
				...componentConfig.defaultProps?.layout,
			},
		},
		/**
		 * Only the controls that mean something under this parent. A block's
		 * own `resolveFields` runs FIRST and its result is what the layout
		 * field is added to, so wrapping never discards a block's field logic
		 * (a straight overwrite would, with no type error to catch it).
		 */
		resolveFields: async (data: any, params: any) => {
			const fields = componentConfig.resolveFields
				? await componentConfig.resolveFields(data, params)
				: baseFields;

			const { spanCol, spanRow, grow, padding } = layoutField.objectFields;

			if (params.parent?.type === "Grid") {
				return {
					...fields,
					layout: { ...layoutField, objectFields: { spanCol, spanRow, padding } },
				};
			}

			if (params.parent?.type === "Flex") {
				return {
					...fields,
					layout: { ...layoutField, objectFields: { grow, padding } },
				};
			}

			return {
				...fields,
				layout: { ...layoutField, objectFields: { padding } },
			};
		},
		inline: true,
		render: (props: any) => (
			<Layout className="zk-layout" layout={props.layout} ref={props.puck.dragRef}>
				{componentConfig.render(props)}
			</Layout>
		),
	} as C;
}
