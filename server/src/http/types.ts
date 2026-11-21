import type { AuthContext } from '../auth/types';
import type { TenantRequestContext } from '../tenancy/context';
import type { Logger } from './log';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      auth?: AuthContext;
      tenantContext?: TenantRequestContext;
    }
  }
}

export {};
