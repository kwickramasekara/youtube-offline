import fs from 'fs/promises';
import path from 'path';
import type { Database, Playlist, Video } from './types.js';

const DEFAULT_DATABASE: Database = {
  playlists: [],
  videos: []
};

class DatabaseManager {
  private dbPath: string;
  private db: Database | null = null;

  constructor(dbPath: string = './database.json') {
    this.dbPath = dbPath;
  }

  async load(): Promise<Database> {
    try {
      const data = await fs.readFile(this.dbPath, 'utf-8');
      this.db = JSON.parse(data) as Database;

      return this.db;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Database doesn't exist, create it
        this.db = { ...DEFAULT_DATABASE };
        await this.save();
        return this.db;
      }
      throw error;
    }
  }

  async save(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not loaded');
    }

    // Atomic write: write to temp file then rename
    const tempPath = `${this.dbPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.db, null, 2), 'utf-8');
    await fs.rename(tempPath, this.dbPath);
  }

  getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not loaded. Call load() first.');
    }
    return this.db;
  }

  // Playlist methods
  async addPlaylist(playlist: Omit<Playlist, 'id'>): Promise<Playlist> {
    const db = this.getDatabase();
    const newPlaylist: Playlist = {
      ...playlist,
      id: this.generateId()
    };
    db.playlists.push(newPlaylist);
    await this.save();
    return newPlaylist;
  }

  async removePlaylist(id: string): Promise<boolean> {
    const db = this.getDatabase();
    const initialLength = db.playlists.length;
    db.playlists = db.playlists.filter(p => p.id !== id);

    if (db.playlists.length < initialLength) {
      // Also remove associated videos
      db.videos = db.videos.filter(v => v.playlistId !== id);
      await this.save();
      return true;
    }
    return false;
  }

  async updatePlaylist(id: string, updates: Partial<Playlist>): Promise<Playlist | null> {
    const db = this.getDatabase();
    const playlist = db.playlists.find(p => p.id === id);

    if (!playlist) {
      return null;
    }

    Object.assign(playlist, updates);
    await this.save();
    return playlist;
  }

  getPlaylists(): Playlist[] {
    return this.getDatabase().playlists;
  }

  // Video methods
  async addVideo(video: Omit<Video, 'downloadedAt'>): Promise<Video> {
    const db = this.getDatabase();
    const newVideo: Video = {
      ...video,
      downloadedAt: new Date().toISOString()
    };
    db.videos.push(newVideo);
    await this.save();
    return newVideo;
  }

  getVideos(playlistId?: string): Video[] {
    const db = this.getDatabase();
    if (playlistId) {
      return db.videos.filter(v => v.playlistId === playlistId);
    }
    return db.videos;
  }

  isVideoDownloaded(videoId: string): boolean {
    const db = this.getDatabase();
    return db.videos.some(v => v.id === videoId && v.status === 'completed');
  }

  async deleteVideo(videoId: string): Promise<Video | null> {
    const db = this.getDatabase();
    const videoIndex = db.videos.findIndex(v => v.id === videoId);

    if (videoIndex === -1) {
      return null;
    }

    const deletedVideo = db.videos[videoIndex];
    db.videos.splice(videoIndex, 1);
    await this.save();
    return deletedVideo;
  }

  // Utility
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const db = new DatabaseManager();
