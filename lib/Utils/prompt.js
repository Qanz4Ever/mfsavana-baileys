import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
/**
 * Prompt user in terminal for their WhatsApp phone number.
 * Automatically cleans non-digits (spaces, dashes, '+').
 */
export const askPhoneNumber = async (promptText = '📱 Masukkan Nomor WhatsApp Bot (tanpa tanda +): ') => {
    const rl = readline.createInterface({ input, output });
    try {
        const answer = await rl.question(promptText);
        return answer.replace(/\D/g, '').trim();
    }
    finally {
        rl.close();
    }
};
//# sourceMappingURL=prompt.js.map