/**
 * FileStore — Cloud file persistence via Supabase Storage
 *
 * Uploads local files to a public Supabase Storage bucket and returns
 * a public URL. Used by the MCP client to auto-persist tool outputs
 * and by the upload_file task tool for manual uploads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";

const MIME_MAP: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  // Documents
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
};

const DEFAULT_BUCKET = "agent-files";

export class FileStore {
  private supabaseClient: SupabaseClient;
  private supabaseUrl: string;
  private bucket: string;

  constructor(
    supabaseClient: SupabaseClient,
    supabaseUrl: string,
    bucket = DEFAULT_BUCKET
  ) {
    this.supabaseClient = supabaseClient;
    this.supabaseUrl = supabaseUrl;
    this.bucket = bucket;
  }

  /**
   * Upload a local file to Supabase Storage.
   * Returns the public URL, or null if the upload fails.
   */
  async upload(localPath: string): Promise<string | null> {
    if (!existsSync(localPath)) {
      console.warn(`FileStore: file not found: ${localPath}`);
      return null;
    }

    try {
      const fileData = readFileSync(localPath);
      const ext = extname(localPath).toLowerCase();
      const contentType = MIME_MAP[ext] || "application/octet-stream";
      const originalName = basename(localPath, ext);
      const storagePath = `${Date.now()}_${originalName}${ext}`;

      const { error } = await this.supabaseClient.storage
        .from(this.bucket)
        .upload(storagePath, fileData, {
          contentType,
          upsert: false,
        });

      if (error) {
        console.warn(`FileStore: upload failed: ${error.message}`);
        return null;
      }

      return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${storagePath}`;
    } catch (err: any) {
      console.warn(`FileStore: upload error: ${err.message}`);
      return null;
    }
  }
}
