import type { SupabaseClient } from '@supabase/supabase-js';

import { PasswordRecoveryController } from '../password-recovery';

type RecoveryClient = Pick<SupabaseClient, 'auth'>;

function createClient({
  requestError = null,
  updateError = null,
  verifyError = null,
}: {
  requestError?: Error | null;
  updateError?: Error | null;
  verifyError?: Error | null;
} = {}) {
  return {
    auth: {
      resetPasswordForEmail: jest.fn().mockResolvedValue({
        data: {},
        error: requestError,
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({
        data: { user: updateError ? null : { id: 'user-id' } },
        error: updateError,
      }),
      verifyOtp: jest.fn().mockResolvedValue({
        data: {
          session: verifyError
            ? null
            : { access_token: 'recovery-access-token' },
          user: verifyError ? null : { id: 'user-id' },
        },
        error: verifyError,
      }),
    },
  } as unknown as RecoveryClient;
}

describe('PasswordRecoveryController', () => {
  it('requests a recovery email without any app redirect URL', async () => {
    const client = createClient();
    const controller = new PasswordRecoveryController(client);

    await expect(controller.requestCode('person@example.com')).resolves.toEqual(
      {},
    );
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.com',
    );
  });

  it('verifies the six-digit email code as a recovery OTP', async () => {
    const client = createClient();
    const controller = new PasswordRecoveryController(client);

    await expect(
      controller.verifyCode('person@example.com', '123456'),
    ).resolves.toEqual({});
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      token: '123456',
      type: 'recovery',
    });
  });

  it('does not expose provider detail for an invalid or expired code', async () => {
    const client = createClient({
      verifyError: new Error('provider token detail'),
    });
    const controller = new PasswordRecoveryController(client);

    await expect(
      controller.verifyCode('person@example.com', '123456'),
    ).resolves.toEqual({
      error:
        'This recovery code is invalid or expired. Request a new code and try again.',
    });
  });

  it('explains a weak password without destroying the verified recovery session', async () => {
    const weakPasswordError = Object.assign(new Error('password too weak'), {
      code: 'weak_password',
    });
    const client = createClient({ updateError: weakPasswordError });
    const controller = new PasswordRecoveryController(client);

    await controller.verifyCode('person@example.com', '123456');
    await expect(controller.updatePassword('password123')).resolves.toEqual({
      error:
        'Choose a stronger password that meets the required security rules.',
    });
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it('updates the password and closes only the ephemeral recovery session', async () => {
    const client = createClient();
    const controller = new PasswordRecoveryController(client);

    await controller.verifyCode('person@example.com', '123456');
    await expect(
      controller.updatePassword('Strong-password-73!'),
    ).resolves.toEqual({});
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: 'Strong-password-73!',
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
