/**
 * Puck AI backend: brokers the admin's chat panel through Puck Cloud.
 *
 * Mount it as an Astro route at `src/pages/api/puck/[...all].ts`:
 *
 *     import { createPuckAiHandler } from "emdash-plugin-puck/ai/handler";
 *     const handler = createPuckAiHandler({ context: "You write pages for ..." });
 *     export const GET = handler;
 *     export const POST = handler;
 *     export const DELETE = handler;
 *
 * The path is not configurable: Puck's client calls `/api/puck/*` by
 * convention, exposing only `host` (a different origin), so this file has to
 * live exactly there.
 *
 * THIS ROUTE SPENDS MONEY. Every generation debits credit from the Puck Cloud
 * account behind the API key, and Puck Cloud bills the account, not the
 * caller. An unauthenticated `/api/puck` is a stranger's spend button, which
 * is why `locals.user` is checked before the handler ever runs. EmDash's auth
 * middleware populates it on public routes too, from the admin session cookie
 * that opened the editor. A bearer token does NOT authenticate here.
 */

import type { APIRoute } from "astro";
import { puckHandler } from "@puckeditor/cloud-client";

type PuckCloudOptions = NonNullable<Parameters<typeof puckHandler>[1]>;
type PuckAiOptions = NonNullable<PuckCloudOptions["ai"]>;

export interface PuckAiHandlerOptions extends Omit<PuckAiOptions, "onFinish"> {
	/**
	 * Puck Cloud API key, or a function returning it. Defaults to reading
	 * `PUCK_API_KEY` from `process.env` at REQUEST time, so a missing key fails
	 * loudly on first use instead of at import.
	 */
	apiKey?: string | (() => string | undefined);
	/**
	 * Require the `X-EmDash-Request: 1` header the admin client attaches.
	 * Browsers refuse to attach custom headers cross-origin, so its presence
	 * proves same-origin; identical reasoning to EmDash's own CSRF convention.
	 * Default true.
	 */
	csrf?: boolean;
	/**
	 * Usage accounting. Puck Cloud meters per request, and without this there
	 * is no local record of what was spent or by whom: the Puck Cloud dashboard
	 * cannot see which EmDash user ran the prompt. The default logs one line
	 * per generation with the user's email or id.
	 */
	onFinish?: (
		result: Parameters<NonNullable<PuckAiOptions["onFinish"]>>[0],
		user: { id?: string; email?: string },
	) => void;
	/** Passed through to `puckHandler`. */
	host?: string;
}

interface EmDashUser {
	id?: string;
	email?: string;
}

function readUser(locals: unknown): EmDashUser | null {
	const user = (locals as { user?: unknown } | undefined)?.user;
	if (!user || typeof user !== "object") return null;
	const { id, email } = user as { id?: unknown; email?: unknown };
	return {
		id: typeof id === "string" ? id : undefined,
		email: typeof email === "string" ? email : undefined,
	};
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function resolveApiKey(option: PuckAiHandlerOptions["apiKey"]): string {
	const key = typeof option === "function" ? option() : (option ?? process.env.PUCK_API_KEY);
	if (!key) {
		throw new Error(
			"emdash-plugin-puck: PUCK_API_KEY is not set, so Puck AI cannot reach Puck Cloud. " +
				"Set it as an environment variable or pass `apiKey` to createPuckAiHandler().",
		);
	}
	return key;
}

export function createPuckAiHandler(options: PuckAiHandlerOptions = {}): APIRoute {
	const { apiKey, csrf = true, onFinish, host, ...ai } = options;

	return async ({ request, locals }) => {
		const user = readUser(locals);
		if (!user) return json(401, { error: "Not authenticated" });

		if (csrf && request.headers.get("X-EmDash-Request") !== "1") {
			return json(403, { error: "Cross-origin request blocked" });
		}

		return puckHandler(request, {
			apiKey: resolveApiKey(apiKey),
			host,
			ai: {
				...ai,
				onFinish: (result) => {
					if (onFinish) {
						onFinish(result, user);
						return;
					}
					console.log(
						`[puck-ai] user=${user.email ?? user.id ?? "unknown"} ` +
							`cost=${result.totalCost} tokens=${result.tokenUsage?.totalTokens ?? "?"}`,
					);
				},
			},
		});
	};
}
