/**
 * Phone Channel — Public API
 *
 * Exports the phone server setup for use from the main entry point.
 */

export { startHTTPServer } from "./server.ts";
export type { PhoneServer, HTTPServerDeps } from "./server.ts";
export type { PhoneDeps } from "./completions.ts";
export { PhoneSessionManager } from "./session.ts";
