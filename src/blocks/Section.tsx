import { forwardRef, type CSSProperties, type ReactNode } from "react";

/**
 * The width constraint every block renders inside.
 *
 * A block dropped at the page root inherits whatever measure the page's root
 * gives it, which on a full-bleed page is none at all, so every block wraps
 * its render in a Section rather than relying on a block an author can
 * forget. Nested sections (a Card inside a Grid inside a Section) drop their
 * padding and auto margins, so the measure is applied once, by the outermost
 * one, and inner blocks fill whatever cell they were given.
 */
export type SectionProps = {
	className?: string;
	children: ReactNode;
	maxWidth?: string;
	style?: CSSProperties;
};

export const Section = forwardRef<HTMLDivElement, SectionProps>(
	({ children, className, maxWidth = "1280px", style }, ref) => (
		<div className={className ? `zk-section ${className}` : "zk-section"} style={style} ref={ref}>
			<div className="zk-section-inner" style={{ maxWidth }}>
				{children}
			</div>
		</div>
	),
);

Section.displayName = "PuckSection";
