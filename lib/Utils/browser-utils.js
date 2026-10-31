import { platform, release } from 'os';
import { proto } from '../../WAProto/index.js';
const PLATFORM_MAP = {
    aix: 'AIX',
    darwin: 'Mac OS',
    win32: 'Windows',
    android: 'Android',
    freebsd: 'FreeBSD',
    openbsd: 'OpenBSD',
    sunos: 'Solaris',
    linux: undefined,
    haiku: undefined,
    cygwin: undefined,
    netbsd: undefined
};
export const Browsers = {
    ubuntu: browser => ['Ubuntu', browser || 'Chrome', '22.04.4'],
    macOS: browser => ['Mac OS', browser || 'Chrome', '14.7.1'],
    baileys: browser => ['Baileys', browser || 'Chrome', '6.5.0'],
    windows: browser => ['Windows', browser || 'Chrome', '10.0.26100'],
    android: browser => [browser || 'Chrome', 'Android', ''],
    /** The appropriate browser based on your OS & release */
    appropriate: browser => [PLATFORM_MAP[platform()] || 'Ubuntu', browser || 'Chrome', release()],
    /** Optimal high-reputation preset for modern WhatsApp Web (Lowest ban & disconnect rate) */
    optimal: (browser = 'Chrome') => ['Mac OS', browser, '14.7.1'],
    /** Modern Windows 11 24H2 client signature */
    windows11: (browser = 'Chrome') => ['Windows', browser, '10.0.26100'],
    /** Modern Ubuntu LTS 24.04 client signature */
    ubuntu24: (browser = 'Chrome') => ['Ubuntu', browser, '24.04'],
    /** Latest macOS Sequoia client signature */
    macOSLatest: (browser = 'Chrome') => ['Mac OS', browser, '15.3.1']
};
/**
 * Resolve any browser string or tuple into a valid WABrowserDescription
 */
export const resolveBrowserConfig = (input) => {
    if (!input)
        return Browsers.optimal('Chrome');
    if (Array.isArray(input))
        return input;
    const lower = input.toLowerCase().trim();
    if (lower === 'optimal' || lower === 'chrome' || lower === 'default') {
        return Browsers.optimal('Chrome');
    }
    if (lower === 'windows' || lower === 'windows11' || lower === 'win') {
        return Browsers.windows11('Chrome');
    }
    if (lower === 'macos' || lower === 'mac' || lower === 'sequoia') {
        return Browsers.macOSLatest('Chrome');
    }
    if (lower === 'ubuntu' || lower === 'ubuntu24' || lower === 'linux') {
        return Browsers.ubuntu24('Chrome');
    }
    if (lower === 'edge') {
        return ['Windows', 'Edge', '131.0.0.0'];
    }
    if (lower === 'firefox') {
        return ['Windows', 'Firefox', '133.0'];
    }
    if (lower === 'safari') {
        return ['Mac OS', 'Safari', '18.1'];
    }
    return Browsers.optimal(input);
};
export const getPlatformId = (browser) => {
    const platformType = proto.DeviceProps.PlatformType[browser.toUpperCase()];
    return platformType ? platformType.toString() : '1'; //chrome
};
//# sourceMappingURL=browser-utils.js.map