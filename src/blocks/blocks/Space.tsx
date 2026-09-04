import type { CSSProperties } from "react";

import type { ComponentConfig } from "@puckeditor/core";

import { withAi } from "../ai";
import type { BlocksContext } from "../context";

export type SpaceProps = {
	size: string;
	direction: "" | "vertical" | "horizontal";
};

/**
 * Blank space, for the gap a layout's own `gap` and padding cannot express.
 *
 * Not wrapped in `withLayout`: a spacer with its own padding field is two
 * controls for one measurement. It sets `inline` and forwards `puck.dragRef`
 * itself so the empty div stays selectable and draggable on the canvas.
 */
export function spaceBlock(ctx: BlocksContext) {
	const block: ComponentConfig<SpaceProps> = {
		label: "Space",
		fields: {
			size: { type: "select", label: "Size", options: [...ctx.options.spacing] },
			direction: {
				type: "radio",
				label: "Axis",
				options: [
					{ label: "Vertical", value: "vertical" },
					{ label: "Horizontal", value: "horizontal" },
					{ label: "Both", value: "" },
				],
			},
		},
		defaultProps: {
			size: "40px",
			direction: "vertical",
		},
		inline: true,
		render: ({ size, direction, puck }) => (
			<div
				ref={puck.dragRef}
				className={`zk-space${direction ? ` zk-space--${direction}` : ""}`}
				style={{ "--zk-size": size } as CSSProperties}
			/>
		),
	};

	return withAi(
		block,
		"A blank gap. Only reach for it when a layout's own gap and padding " +
			"cannot produce the separation; a page built mostly of Spaces is a page " +
			"whose containers are configured wrong.",
	);
}
