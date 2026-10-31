const DEFAULT_PREFIXES = ['.', '/', '!', '#', '$', '%', '^', '&', '*', '+', '-', '~', '?'];
/**
 * Creates a rich, unified Context (ctx) wrapper for messages, commands, and events.
 */
export const createContext = (msg, sock, options) => {
    const rawText = (msg.text || msg.body || '').trim();
    const prefixes = options?.prefixes || DEFAULT_PREFIXES;
    let prefix = '';
    let withoutPrefix = rawText;
    for (const pfx of prefixes) {
        if (rawText.startsWith(pfx)) {
            prefix = pfx;
            withoutPrefix = rawText.slice(pfx.length).trim();
            break;
        }
    }
    const parts = withoutPrefix.length ? withoutPrefix.split(/\s+/) : [];
    const command = parts[0] ? parts[0].toLowerCase() : '';
    const args = parts.slice(1);
    const query = parts[0] ? withoutPrefix.slice(parts[0].length).trim() : '';
    const group = typeof sock.groupUtils === 'function' ? sock.groupUtils(msg.chat) : undefined;
    const profile = typeof sock.profileUtils === 'function' ? sock.profileUtils(msg.sender) : undefined;
    const ctx = {
        ...msg,
        sock,
        msg,
        prefix,
        command,
        args,
        query,
        q: query,
        group,
        profile,
        isCommand: (nameOrNames) => {
            const list = Array.isArray(nameOrNames) ? nameOrNames.map(n => n.toLowerCase()) : [nameOrNames.toLowerCase()];
            return list.includes(command);
        },
        replyTyping: async (content) => {
            return msg.reply(content, { typing: true });
        },
        isRateLimited: (customConfig) => {
            if (typeof sock.checkRateLimit === 'function') {
                const res = sock.checkRateLimit(msg.sender, customConfig, false);
                return res?.limited ?? false;
            }
            return false;
        },
        checkRateLimit: (customConfig) => {
            if (typeof sock.checkRateLimit === 'function') {
                return sock.checkRateLimit(msg.sender, customConfig, false);
            }
            return { limited: false, remainingMs: 0, count: 0, max: 5, resetAt: Date.now() };
        },
        consumeRateLimit: (customConfig) => {
            if (typeof sock.checkRateLimit === 'function') {
                return sock.checkRateLimit(msg.sender, customConfig, true);
            }
            return { limited: false, remainingMs: 0, count: 1, max: 5, resetAt: Date.now() };
        },
        resetRateLimit: () => {
            if (typeof sock.resetRateLimit === 'function') {
                sock.resetRateLimit(msg.sender);
            }
        },
        inspectPhone: (async (targetNumber, fieldOrOptions) => {
            const target = targetNumber || msg.sender;
            if (typeof msg.inspectPhone === 'function') {
                return msg.inspectPhone(target, fieldOrOptions);
            }
            if (typeof sock.inspectPhone === 'function') {
                return sock.inspectPhone(target, fieldOrOptions);
            }
            throw new Error('inspectPhone is not available on this socket instance');
        })
    };
    return ctx;
};
//# sourceMappingURL=context.js.map