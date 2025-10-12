import fs from 'fs/promises';
import type { Config } from './types.js';

const DEFAULT_CONFIG: Config = {
  downloadPath: './downloads',
  checkIntervalHours: 6,
  port: 36660,
  quality: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
  maxConcurrentDownloads: 2
};

class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor(configPath: string = './config.json') {
    this.configPath = configPath;
  }

  async load(): Promise<Config> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const loadedConfig = JSON.parse(data) as Config;

      // Merge with defaults in case new config options were added
      this.config = { ...DEFAULT_CONFIG, ...loadedConfig };

      return this.config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Config doesn't exist, create it with defaults
        this.config = { ...DEFAULT_CONFIG };
        await this.save();
        return this.config;
      }
      throw error;
    }
  }

  async save(): Promise<void> {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    // Atomic write: write to temp file then rename
    const tempPath = `${this.configPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.config, null, 2), 'utf-8');
    await fs.rename(tempPath, this.configPath);
  }

  getConfig(): Config {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }
}

export const configManager = new ConfigManager();
