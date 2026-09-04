/**
 * Error boundaries for a rendered Puck document.
 *
 * A Puck page rendered through one hydrating island is one React root, and
 * React's response to an uncaught render error is to unmount the WHOLE root.
 * A single failed dynamic import (a hashed chunk 404 after a redeploy, a flaky
 * network) then replaces a complete, correct server render with a blank page.
 *
 * These boundaries put the blast radius back:
 *
 *   - `withBoundaries` wraps every registered component's `render` in its own
 *     `BlockErrorBoundary`, so a throw inside one section costs that section
 *     and nothing else.
 *   - `PageErrorBoundary` is the last resort around the whole document.
 *
 * React only runs boundaries on the client. A throw during SSR still fails the
 * render, which is correct: that is a build/data bug the server should
 * surface, not something to paper over.
 */

import type { Config } from "@puckeditor/core";
import { Component, type ErrorInfo, type ReactNode } from "react";

export type AnyConfig = Config<any, any, any>;

interface Props {
	children: ReactNode;
	/** Shown in the console and in the fallback's aria-label. */
	label: string;
	/** Rendered in place of the children when they throw. `null` renders nothing. */
	fallback?: ReactNode;
}

interface State {
	error: Error | null;
}

/** A boundary with a caller-supplied fallback. */
export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		// Keep the detail in the console. Silently swallowing a render error is
		// how a section quietly goes missing in production with no trace.
		console.error(`[puck] "${this.props.label}" failed to render`, error, info.componentStack);
	}

	render() {
		if (this.state.error) return this.props.fallback ?? null;
		return this.props.children;
	}
}

/**
 * Wraps one Puck section. The fallback is deliberately empty: a section that
 * cannot render should disappear quietly rather than replace editorial copy
 * with an error notice on a public page. The console carries the detail.
 */
export function BlockErrorBoundary({ label, children }: { label: string; children: ReactNode }) {
	return (
		<ErrorBoundary label={label} fallback={null}>
			{children}
		</ErrorBoundary>
	);
}

/** Last resort around the whole document. */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
	return (
		<ErrorBoundary label="page" fallback={null}>
			{children}
		</ErrorBoundary>
	);
}

/**
 * Wrap every registered component's `render` in its own error boundary.
 *
 * Applied at render time rather than in the config so the admin canvas keeps
 * rendering raw components, where a hard failure should be loud rather than
 * swallowed.
 */
export function withBoundaries<C extends AnyConfig>(source: C): C {
	const components = Object.fromEntries(
		Object.entries(source.components ?? {}).map(([name, component]) => {
			const definition = component as { render: (props: any) => any };
			const Inner = definition.render;
			return [
				name,
				{
					...definition,
					render: (props: any) => (
						<BlockErrorBoundary label={name}>
							<Inner {...props} />
						</BlockErrorBoundary>
					),
				},
			];
		}),
	);

	return { ...source, components } as C;
}
