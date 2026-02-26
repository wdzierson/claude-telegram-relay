/**
 * Channel Registry
 *
 * Tracks all registered channels. Supports broadcasting to all channels
 * or targeting a specific one. The first registered channel is the primary.
 */

import type { Channel } from "./types.ts";

export class ChannelRegistry {
  private channels = new Map<string, Channel>();
  private primaryId: string | null = null;

  /**
   * Register a channel. The first channel registered (or one marked isPrimary)
   * becomes the primary channel for sendToPrimary().
   */
  register(channel: Channel, isPrimary = false): void {
    this.channels.set(channel.id, channel);
    if (isPrimary || !this.primaryId) {
      this.primaryId = channel.id;
    }
  }

  get(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  get primary(): Channel | undefined {
    return this.primaryId ? this.channels.get(this.primaryId) : undefined;
  }

  getAll(): Channel[] {
    return Array.from(this.channels.values());
  }

  /** Broadcast a message to all connected channels */
  async broadcastMessage(text: string): Promise<void> {
    await Promise.all(
      this.getAll()
        .filter((ch) => ch.isConnected())
        .map((ch) =>
          ch.sendMessage(text).catch((err) =>
            console.error(`[ChannelRegistry] ${ch.id} send failed:`, err)
          )
        )
    );
  }

  /** Send only to the primary channel */
  async sendToPrimary(text: string): Promise<void> {
    const ch = this.primary;
    if (ch?.isConnected()) {
      await ch.sendMessage(text);
    }
  }
}
