/**
 * Channel Abstraction — Core Interface
 *
 * Defines the contract that all frontend adapters must implement.
 * Currently implemented by TelegramChannel and AdminChannel.
 * Future: PhoneChannel (Telnyx), WebChannel, etc.
 */

export interface Channel {
  /** Unique channel identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Send a text message to the primary user */
  sendMessage(text: string): Promise<void>;

  /** Send a task status update */
  sendTaskUpdate(taskId: string, status: string, detail?: string): Promise<void>;

  /**
   * Ask the user a question and return their answer.
   * Implementations may throw if async question flow is handled elsewhere.
   */
  askUser(taskId: string, question: string, options?: string[]): Promise<string>;

  /** Send a file to the user (optional capability) */
  sendFile?(filePath: string, caption?: string): Promise<void>;

  /** Whether this channel is currently active/connected */
  isConnected(): boolean;
}
