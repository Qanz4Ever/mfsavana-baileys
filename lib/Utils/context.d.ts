import type { proto } from '../../WAProto';
import type { SerializedMessage } from './serialize.js';
import type { AnyMessageContent } from '../Types/index.js';
export interface MessageContext extends SerializedMessage {
    /** Active socket connection */
    sock: any;
    /** Reference to original serialized message */
    msg: SerializedMessage;
    /** Extracted command prefix (e.g. '!', '/', '.' or '') */
    prefix: string;
    /** Parsed command name in lowercase (without prefix) */
    command: string;
    /** Command arguments array */
    args: string[];
    /** Full arguments text string */
    query: string;
    /** Short alias for query */
    q: string;
    /** Scoped group utilities for current chat (if in group) */
    group: any;
    /** Scoped profile utilities */
    profile: any;
    /** Check if current message matches given command name(s) */
    isCommand: (nameOrNames: string | string[]) => boolean;
    /** Reply with explicit typing status */
    replyTyping: (content: string | AnyMessageContent) => Promise<proto.WebMessageInfo | undefined>;
    /** Check if sender is currently rate limited */
    isRateLimited: (customConfig?: import('./rate-limiter.js').RateLimitConfig) => boolean;
    /** Check rate limit details without consuming quota */
    checkRateLimit: (customConfig?: import('./rate-limiter.js').RateLimitConfig) => import('./rate-limiter.js').RateLimitCheckResult;
    /** Consume rate limit quota for sender and evaluate status */
    consumeRateLimit: (customConfig?: import('./rate-limiter.js').RateLimitConfig) => import('./rate-limiter.js').RateLimitCheckResult;
    /** Reset rate limit for current sender */
    resetRateLimit: () => void;
}
export interface ContextOptions {
    prefixes?: string[];
}
/**
 * Creates a rich, unified Context (ctx) wrapper for messages, commands, and events.
 */
export declare const createContext: (msg: SerializedMessage, sock: any, options?: ContextOptions) => MessageContext;
//# sourceMappingURL=context.d.ts.map