import { ApiClient } from '@twurple/api';
import type { AppTokenAuthProvider } from '@twurple/auth';

export function buildApiClient(authProvider: AppTokenAuthProvider): ApiClient {
  return new ApiClient({ authProvider });
}
