import { requestApi } from '@/lib/api/client';

export type AccountDeletionApiErrorKind =
  'auth' | 'forbidden' | 'server' | 'network' | 'unexpected';

export class AccountDeletionApiError extends Error {
  constructor(
    public readonly kind: AccountDeletionApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AccountDeletionApiError';
  }
}

/** Deletes only the identity represented by the bearer token. */
export async function deleteCurrentAccount(accessToken: string): Promise<void> {
  try {
    const response = await requestApi('/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: 'DELETE',
    });

    if (response.status === 204) {
      return;
    }
    if (response.status === 401) {
      throw new AccountDeletionApiError(
        'auth',
        'Your session has ended. Please sign in again.',
      );
    }
    if (response.status === 403) {
      throw new AccountDeletionApiError(
        'forbidden',
        'You are not authorized to delete this account.',
      );
    }
    if (response.status >= 500) {
      throw new AccountDeletionApiError(
        'server',
        'Account deletion could not be completed. Please try again.',
      );
    }
    throw new AccountDeletionApiError(
      'unexpected',
      'Account deletion could not be completed. Please try again.',
    );
  } catch (error) {
    if (error instanceof AccountDeletionApiError) {
      throw error;
    }
    throw new AccountDeletionApiError(
      'network',
      'We could not reach account deletion. Check your connection and try again.',
    );
  }
}
