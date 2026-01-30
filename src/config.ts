/**
 * Config loader
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ContentKitConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const CONFIG_FILES = [
  '.content-kit.json',
  'content-kit.json',
  '.content-kit.config.json',
];

export function loadConfig(cwd: string = process.cwd()): ContentKitConfig {
  // Try to find config file
  for (const filename of CONFIG_FILES) {
    const configPath = join(cwd, filename);
    if (existsSync(configPath)) {
      const fileContent = readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(fileContent);
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    }
  }
  
  // Check package.json for content-kit key
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (pkg['content-kit']) {
      return mergeConfig(DEFAULT_CONFIG, pkg['content-kit']);
    }
  }
  
  return DEFAULT_CONFIG;
}

export function mergeConfig(
  base: ContentKitConfig,
  override: Partial<ContentKitConfig>
): ContentKitConfig {
  return {
    ...base,
    ...override,
    // Deep merge arrays
    plugins: override.plugins ?? base.plugins,
  };
}
