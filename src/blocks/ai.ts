import type { ComponentConfig } from "@puckeditor/core";

/**
 * Attach Puck AI instructions to a block without depending on
 * `@puckeditor/plugin-ai`'s type augmentation, which a site without the AI
 * plugin does not have. The key is exactly what `createAiPlugin` reads.
 */
export function withAi<C extends ComponentConfig<any>>(config: C, instructions: string): C {
	return { ...config, ai: { instructions } } as C;
}
