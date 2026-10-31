import { createHash } from 'node:crypto';
import { jidEncode, jidNormalizedUser } from '../WABinary/index.js';
/**
 * Parse country code and national number from raw digits
 */
export function parseCountryAndNational(phoneNumber) {
    let clean = phoneNumber.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    }
    const commonPrefixes = [
        '62', '60', '65', '91', '44', '1', '55', '7', '81', '82', '84', '86', '92', '93', '94',
        '95', '98', '20', '27', '33', '49', '39', '34', '61', '63', '64', '66', '90', '966', '971'
    ];
    for (const prefix of commonPrefixes) {
        if (clean.startsWith(prefix)) {
            return { cc: prefix, in: clean.slice(prefix.length) };
        }
    }
    return { cc: clean.slice(0, 2), in: clean.slice(2) };
}
/**
 * Check if a number is banned or requires official WhatsApp
 */
export async function checkBanStatus(cleanNumber) {
    const { cc, in: nationalNumber } = parseCountryAndNational(cleanNumber);
    const waVersion = '2.25.23.24';
    const waVersionHash = createHash('md5').update(waVersion).digest('hex');
    const mobileToken = Buffer.from('0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM' + waVersionHash);
    const token = createHash('md5').update(Buffer.concat([mobileToken, Buffer.from(nationalNumber)])).digest('hex');
    const params = new URLSearchParams({
        cc,
        in: nationalNumber,
        Rc: '0',
        lg: 'en',
        lc: 'GB',
        mistyped: '6',
        network_ratio_type: '1',
        simnum: '1',
        hasinrc: '1',
        pid: Math.floor(Math.random() * 1000).toString(),
        token,
        method: 'sms'
    });
    try {
        const res = await fetch(`https://v.whatsapp.net/v2/exist?${params.toString()}`, {
            headers: {
                'User-Agent': `WhatsApp/${waVersion} iOS/17.5.1 Device/Apple-iPhone_13`
            }
        });
        const json = (await res.json());
        if (json?.appeal_token) {
            return {
                isBanned: true,
                isNeedOfficialWa: false,
                banDetails: {
                    violationType: json.violation_type || undefined,
                    inAppAppeal: json.in_app_ban_appeal || undefined,
                    appealToken: json.appeal_token || undefined
                }
            };
        }
        if (json?.custom_block_screen || json?.reason === 'blocked') {
            return { isBanned: false, isNeedOfficialWa: true };
        }
        return { isBanned: false, isNeedOfficialWa: false };
    }
    catch (err) {
        if (err?.appeal_token) {
            return {
                isBanned: true,
                isNeedOfficialWa: false,
                banDetails: {
                    violationType: err.violation_type || undefined,
                    inAppAppeal: err.in_app_ban_appeal || undefined,
                    appealToken: err.appeal_token || undefined
                }
            };
        }
        if (err?.custom_block_screen || err?.reason === 'blocked') {
            return { isBanned: false, isNeedOfficialWa: true };
        }
        return { isBanned: false, isNeedOfficialWa: false };
    }
}
/**
 * Inspect a phone number in full detail (registration, bio/about, ban status, avatar, business profile)
 */
export async function inspectPhoneNumber(sock, input, options = {}) {
    let clean = input.trim();
    if (clean.includes('@')) {
        clean = clean.split('@')[0];
    }
    clean = clean.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    }
    const jid = jidEncode(clean, 's.whatsapp.net');
    const result = {
        number: clean,
        jid,
        exists: false,
        isBanned: false,
        isNeedOfficialWa: false
    };
    // 1. Check if registered on WhatsApp
    try {
        const onWa = await sock.onWhatsApp(clean);
        if (Array.isArray(onWa) && onWa.length > 0 && onWa[0]?.exists) {
            result.exists = true;
            if (onWa[0]?.jid) {
                result.jid = jidNormalizedUser(onWa[0].jid);
            }
        }
    }
    catch { }
    // 2. Check About / Bio
    if (options.checkAbout !== false) {
        try {
            const statusData = await sock.fetchStatus(result.jid);
            if (statusData) {
                result.about = statusData.status;
                result.statusSetAt = statusData.setAt;
            }
        }
        catch { }
    }
    // 3. Check Profile Picture
    if (options.checkProfilePic !== false) {
        try {
            result.profilePictureUrl = await sock.profilePictureUrl(result.jid, 'image');
        }
        catch { }
    }
    // 4. Check Business Profile
    if (options.checkBusiness !== false) {
        try {
            const biz = await sock.getBusinessProfile(result.jid);
            if (biz) {
                result.business = {
                    isBusiness: true,
                    description: biz.description,
                    category: biz.category,
                    email: biz.email,
                    website: biz.website,
                    address: biz.address
                };
            }
        }
        catch { }
    }
    // 5. Check Ban / Need Official WhatsApp Status
    if (options.checkBan !== false) {
        try {
            const banInfo = await checkBanStatus(clean);
            result.isBanned = banInfo.isBanned;
            result.isNeedOfficialWa = banInfo.isNeedOfficialWa;
            if (banInfo.banDetails) {
                result.banDetails = banInfo.banDetails;
            }
        }
        catch { }
    }
    return result;
}
//# sourceMappingURL=phone-inspector.js.map