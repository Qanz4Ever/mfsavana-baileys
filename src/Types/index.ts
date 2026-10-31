export * from './Auth'
export * from './GroupMetadata'
export * from './Chat'
export * from './Contact'
export * from './State'
export * from './Message'
export * from './Socket'
export * from './Events'
export * from './Product'
export * from './Call'
export * from './Signal'
export * from './Mex'
export * from './SmartEvents'

import type { AuthenticationState } from './Auth'
import type { SocketConfig } from './Socket'

export type UserFacingSocketConfig = Partial<Omit<SocketConfig, 'browser'>> & {
	auth: AuthenticationState
	browser?: [string, string, string] | string
}

export type BrowsersMap = {
	ubuntu(browser: string): [string, string, string]
	macOS(browser: string): [string, string, string]
	baileys(browser: string): [string, string, string]
	windows(browser: string): [string, string, string]
	android(browser: string): [string, string, string]
	appropriate(browser: string): [string, string, string]
	optimal(browser?: string): [string, string, string]
	windows11(browser?: string): [string, string, string]
	ubuntu24(browser?: string): [string, string, string]
	macOSLatest(browser?: string): [string, string, string]
}

// DisconnectReason exported from ./State

export type WAInitResponse = {
	ref: string
	ttl: number
	status: 200
}

export type WABusinessHoursConfig = {
	day_of_week: string
	mode: string
	open_time?: number
	close_time?: number
}

export type WABusinessProfile = {
	description: string
	email: string | undefined
	business_hours: {
		timezone?: string
		config?: WABusinessHoursConfig[]
		business_config?: WABusinessHoursConfig[]
	}
	website: string[]
	category?: string
	wid?: string
	address?: string
}

export type CurveKeyPair = { private: Uint8Array; public: Uint8Array }
