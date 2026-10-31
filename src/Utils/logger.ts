import P from 'pino'
import { createDynamicLogger } from './dynamic-logger'

export interface ILogger {
	level: string
	child(obj: Record<string, unknown>): ILogger
	trace(obj: unknown, msg?: string): void
	debug(obj: unknown, msg?: string): void
	info(obj: unknown, msg?: string): void
	warn(obj: unknown, msg?: string): void
	error(obj: unknown, msg?: string): void
	fatal?(obj: unknown, msg?: string): void
}

export { createDynamicLogger }
export default P({ timestamp: () => `,"time":"${new Date().toJSON()}"` })
