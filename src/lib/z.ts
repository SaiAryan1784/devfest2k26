// Single z-index scale for the whole site. The loader sits under the film grain
// on purpose, so the grain textures the title sequence as well as the page.
export const Z = { nav: 40, overlay: 50, loader: 55, grain: 60 } as const;
