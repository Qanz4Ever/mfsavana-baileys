export interface PhoneInspectionResult {
    number: string;
    jid: string;
    exists: boolean;
    isBanned: boolean;
    isNeedOfficialWa: boolean;
    banDetails?: {
        violationType?: string;
        inAppAppeal?: boolean;
        appealToken?: string;
    };
    about?: string;
    statusSetAt?: Date;
    profilePictureUrl?: string;
    business?: {
        isBusiness: boolean;
        description?: string;
        category?: string;
        email?: string;
        website?: string[];
        address?: string;
    };
}
export interface InspectPhoneOptions {
    checkBan?: boolean;
    checkAbout?: boolean;
    checkProfilePic?: boolean;
    checkBusiness?: boolean;
}
/**
 * Parse country code and national number from raw digits
 */
export declare function parseCountryAndNational(phoneNumber: string): {
    cc: string;
    in: string;
};
/**
 * Check if a number is banned or requires official WhatsApp
 */
export declare function checkBanStatus(cleanNumber: string): Promise<{
    isBanned: boolean;
    isNeedOfficialWa: boolean;
    banDetails?: PhoneInspectionResult['banDetails'];
}>;
/**
 * Inspect a phone number in full detail (registration, bio/about, ban status, avatar, business profile)
 */
export declare function inspectPhoneNumber(sock: any, input: string, options?: InspectPhoneOptions): Promise<PhoneInspectionResult>;
//# sourceMappingURL=phone-inspector.d.ts.map