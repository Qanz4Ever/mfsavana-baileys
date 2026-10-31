import P from 'pino';
import { createDynamicLogger } from './dynamic-logger.js';
export { createDynamicLogger };
export default P({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
//# sourceMappingURL=logger.js.map