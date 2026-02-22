/**
 * Phone Session Manager
 *
 * Maps Telnyx conversation IDs to per-call session state.
 * Tracks message history for context continuity during a call.
 */

export interface PhoneSession {
  conversationId: string;
  callerId: string;
  startedAt: Date;
  messages: Array<{ role: string; content: string }>;
  metadata: Record<string, unknown>;
}

export class PhoneSessionManager {
  private sessions = new Map<string, PhoneSession>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Clean up stale sessions every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  create(conversationId: string, callerId: string): PhoneSession {
    const session: PhoneSession = {
      conversationId,
      callerId,
      startedAt: new Date(),
      messages: [],
      metadata: {},
    };
    this.sessions.set(conversationId, session);
    return session;
  }

  get(conversationId: string): PhoneSession | undefined {
    return this.sessions.get(conversationId);
  }

  getOrCreate(conversationId: string, callerId: string): PhoneSession {
    return this.sessions.get(conversationId) || this.create(conversationId, callerId);
  }

  addMessage(conversationId: string, role: string, content: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.messages.push({ role, content });
    }
  }

  destroy(conversationId: string): void {
    this.sessions.delete(conversationId);
  }

  /** Remove sessions older than 1 hour */
  cleanup(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, session] of this.sessions) {
      if (session.startedAt.getTime() < cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
  }
}
