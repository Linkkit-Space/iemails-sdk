import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Saved API keys, one per profile. Lives in ~/.config/iemails/config.json (0600). */
export interface ConfigFile {
  current: string;
  profiles: Record<string, { apiKey: string; baseUrl?: string }>;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.IEMAILS_CONFIG) return env.IEMAILS_CONFIG;
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'iemails', 'config.json');
}

export function readConfig(path: string): ConfigFile {
  if (!existsSync(path)) return { current: 'default', profiles: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ConfigFile>;
    return { current: parsed.current || 'default', profiles: parsed.profiles ?? {} };
  } catch {
    return { current: 'default', profiles: {} };
  }
}

export function writeConfig(path: string, config: ConfigFile): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* not supported on this filesystem */ }
}

/** `em_live_abc…xyz` → `em_live_abc…wxyz`, never the whole key. */
export function maskKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 11)}…${key.slice(-4)}`;
}
