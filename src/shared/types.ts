import type { ReactNode } from "react";

/**
 * The type of a prop whose field sets `contentEditable: true`.
 *
 * Puck swaps the value of an inline-editable field from a string to a React
 * node while the document is inside `<Puck>`, and leaves it a string inside
 * `<Render>`. Both paths run through the same block module, so every
 * inline-editable prop has to accept both.
 *
 * The practical consequence: a prop typed `Editable` may only ever be
 * RENDERED. Calling a string method on it, interpolating it, or passing it to
 * an attribute (`alt`, `aria-label`, `href`, `data-*`) produces
 * "[object Object]" in the editor and nowhere else, which is exactly the kind
 * of bug that survives a typecheck. Anything a block needs to treat AS a
 * string keeps a plain `string` type and no `contentEditable` on its field.
 */
export type Editable = string | ReactNode;
