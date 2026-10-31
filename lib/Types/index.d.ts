export * from './Auth.js';
export * from './GroupMetadata.js';
export * from './Chat.js';
export * from './Contact.js';
export * from './State.js';
export * from './Message.js';
export * from './Socket.js';
export * from './Events.js';
export * from './Product.js';
export * from './Call.js';
export * from './Signal.js';
export * from './Mex.js';
export * from './SmartEvents.js';
import type { AuthenticationState } from './Auth.js';
import type { SocketConfig } from './Socket.js';
export type UserFacingSocketConfig = Partial<Omit<SocketConfig, 'browser'>> & {
    auth: AuthenticationState;
    browser?: [string, string, string] | string;
};
export type BrowsersMap = {
    ubuntu(browser: string): [string, string, string];
    macOS(browser: string): [string, string, string];
    baileys(browser: string): [string, string, string];
    windows(browser: string): [string, string, string];
    android(browser: string): [string, string, string];
    appropriate(browser: string): [string, string, string];
    optimal(browser?: string): [string, string, string];
    windows11(browser?: string): [string, string, string];
    ubuntu24(browser?: string): [string, string, string];
    macOSLatest(browser?: string): [string, string, string];
};
export type WAInitResponse = {
    ref: string;
    ttl: number;
    status: 200;
};
export type WABusinessHoursConfig = {
    day_of_week: string;
    mode: string;
    open_time?: number;
    close_time?: number;
};
export type WABusinessProfile = {
    description: string;
    email: string | undefined;
    business_hours: {
        timezone?: string;
        config?: WABusinessHoursConfig[];
        business_config?: WABusinessHoursConfig[];
    };
    website: string[];
    category?: string;
    wid?: string;
    address?: string;
};
export type CurveKeyPair = {
    private: Uint8Array;
    public: Uint8Array;
};
//# sourceMappingURL=index.d.ts.map