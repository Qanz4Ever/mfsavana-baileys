import type { BrowsersMap } from '../Types/index.js';
export declare const Browsers: BrowsersMap;
/**
 * Resolve any browser string or tuple into a valid WABrowserDescription
 */
export declare const resolveBrowserConfig: (input?: [string, string, string] | string) => [string, string, string];
export declare const getPlatformId: (browser: string) => string;
//# sourceMappingURL=browser-utils.d.ts.map