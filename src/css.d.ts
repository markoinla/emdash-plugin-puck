/**
 * Stylesheets are imported as URLs and linked at runtime, never as
 * side-effect imports. See the note at the top of admin.tsx for why.
 */
declare module "*.css?url" {
	const href: string;
	export default href;
}
