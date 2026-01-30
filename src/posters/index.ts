/**
 * Built-in posters
 */

export { linkedinPoster, auth as linkedinAuth } from './linkedin.js';
export { xPoster, auth as xAuth } from './x.js';

import { linkedinPoster } from './linkedin.js';
import { xPoster } from './x.js';
import type { PosterPlugin } from '../types.js';

export const builtinPosters: Map<string, PosterPlugin> = new Map([
  ['linkedin', linkedinPoster],
  ['x', xPoster],
  ['twitter', xPoster], // Alias
]);

export function getBuiltinPoster(platform: string): PosterPlugin | undefined {
  return builtinPosters.get(platform.toLowerCase());
}
