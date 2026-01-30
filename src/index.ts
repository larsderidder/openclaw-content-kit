/**
 * OpenClaw Content Kit
 * 
 * Safe content automation for AI agents.
 * Draft → Approve → Post workflow with built-in posters.
 */

export * from './types.js';
export { parsePost, validatePost } from './parser.js';
export { loadConfig, mergeConfig } from './config.js';
export { loadPlugin, loadPlugins } from './plugins.js';
export {
  parseCriticMarkup,
  stripCriticMarkup,
  acceptSuggestions,
  rejectSuggestions,
  extractDiscussion,
  stripDiscussion,
  addDiscussionComment,
  type CriticMarkup,
  type ParsedCriticMarkup,
} from './criticmarkup.js';

// Built-in posters
export {
  builtinPosters,
  getBuiltinPoster,
  linkedinPoster,
  xPoster,
} from './posters/index.js';
