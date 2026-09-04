import type { ReactNode } from "react";

import type { BlockOptionLists, Option } from "./options";

/**
 * A custom Button action beyond "go to a link": for instance, opening a
 * contact drawer. The handler lives in the config (which may hold functions),
 * never in the stored document.
 */
export interface ButtonAction {
	value: string;
	label: string;
	onClick: () => void;
}

/** Everything the blocks take from the site. Every field is optional. */
export interface BlocksOptions {
	/**
	 * Icon vocabulary for the Card block. `options` feeds the select field;
	 * `render` turns a stored key into a node. Without this the Card has no
	 * icon field. Keys travel as strings so the stored document stays JSON.
	 */
	icons?: {
		options: readonly Option[];
		render: (key: string) => ReactNode;
	};
	/**
	 * Rewrite an author-typed href before it is rendered. The place to apply a
	 * base path or normalise internal links. Default: identity.
	 */
	resolveHref?: (href: string) => string;
	/**
	 * Component names that may NOT be dropped inside a Grid or Flex cell.
	 * Typically the site's full-width page bands, which carry their own
	 * measure and sibling spacing and silently lose both inside a column.
	 */
	disallow?: string[];
	/**
	 * Extra Button actions, offered beside "Go to a link". Picking one hides
	 * the href field and renders a <button> that calls the handler.
	 */
	buttonActions?: ButtonAction[];
	/**
	 * Class names for the Button block, so it wears the site's own button
	 * styles. Default: the package's `zk-btn` classes.
	 */
	buttonClassName?: (variant: "primary" | "secondary", size: "default" | "large") => string;
	/** Replace the spacing, gap or width scales. */
	options?: Partial<BlockOptionLists>;
}

export interface BlocksContext {
	icons: BlocksOptions["icons"];
	resolveHref: (href: string) => string;
	disallow: string[];
	buttonActions: ButtonAction[];
	buttonClassName: NonNullable<BlocksOptions["buttonClassName"]>;
	options: BlockOptionLists;
}
