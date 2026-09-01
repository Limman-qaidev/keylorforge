import { requestApi } from '@/lib/api/client';

export type CurrentProfile = {
  id: string;
  profile: ProfileResponse;
};

export type ProfileResponse = {
  created_at: string;
  display_name: string | null;
  updated_at: string;
};

export type ProfileApiErrorKind =
  'auth' | 'forbidden' | 'validation' | 'server' | 'network' | 'unexpected';

export class ProfileApiError extends Error {
  constructor(
    public readonly kind: ProfileApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProfileApiError';
  }
}

function isCurrentProfile(payload: unknown): payload is CurrentProfile {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const { id, profile } = payload as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    typeof profile !== 'object' ||
    profile === null
  ) {
    return false;
  }

  return isProfileResponse(profile);
}

function isProfileResponse(payload: unknown): payload is ProfileResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const { created_at, display_name, updated_at } = payload as Record<
    string,
    unknown
  >;
  return (
    typeof created_at === 'string' &&
    (typeof display_name === 'string' || display_name === null) &&
    typeof updated_at === 'string'
  );
}

async function messageFor(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'detail' in payload &&
      typeof payload.detail === 'string'
    ) {
      return payload.detail;
    }
  } catch {
    // A body is optional for error responses.
  }

  return null;
}

async function profileResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const detail = await messageFor(response);

    if (response.status === 401) {
      throw new ProfileApiError(
        'auth',
        'Your session has ended. Please sign in again.',
      );
    }

    if (response.status === 403) {
      throw new ProfileApiError(
        'forbidden',
        'You are not authorized to access this profile.',
      );
    }

    if (response.status === 422) {
      throw new ProfileApiError(
        'validation',
        detail ?? 'Enter a display name between 1 and 80 characters.',
      );
    }

    if (response.status >= 500) {
      throw new ProfileApiError(
        'server',
        'The profile service is temporarily unavailable. Please try again.',
      );
    }

    throw new ProfileApiError(
      'unexpected',
      detail ?? 'Your profile could not be updated. Please try again.',
    );
  }

  return response.json();
}

function authenticatedHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Reads the authenticated caller's application-owned profile. */
export async function getCurrentProfile(
  accessToken: string,
): Promise<CurrentProfile> {
  try {
    const response = await requestApi('/me', {
      headers: authenticatedHeaders(accessToken),
    });
    const payload = await profileResponse(response);
    if (!isCurrentProfile(payload)) {
      throw new ProfileApiError(
        'unexpected',
        'The profile service returned an unexpected response.',
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ProfileApiError) {
      throw error;
    }

    throw new ProfileApiError(
      'network',
      'We could not reach your profile. Check your connection and try again.',
    );
  }
}

/** Updates only the authenticated caller's profile; no owner identifier is sent. */
export async function updateCurrentProfile(
  accessToken: string,
  displayName: string,
): Promise<ProfileResponse> {
  try {
    const response = await requestApi('/me/profile', {
      body: JSON.stringify({ display_name: displayName }),
      headers: {
        ...authenticatedHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    });
    const payload = await profileResponse(response);
    if (!isProfileResponse(payload)) {
      throw new ProfileApiError(
        'unexpected',
        'The profile service returned an unexpected response.',
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ProfileApiError) {
      throw error;
    }

    throw new ProfileApiError(
      'network',
      'We could not save your profile. Check your connection and try again.',
    );
  }
}
