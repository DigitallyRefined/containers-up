import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import config from '../lib/config';

type OidcConfig = {
  enabled: boolean;
  issuer?: string | null;
  audience?: string | null;
  clientId?: string | null;
};

let userManager: UserManager | null = null;
let currentUser: User | null = null;

export const isOidcEnabled = Boolean(config.get('OIDC_ISSUER_URI') && config.get('OIDC_CLIENT_ID'));

export const getAccessToken = async (): Promise<string | null> => {
  if (!isOidcEnabled) return null;
  if (!userManager) await init();

  if (!currentUser) {
    currentUser = await userManager.getUser();
  }

  // If user exists and token is not expired, return it
  if (currentUser && !currentUser.expired && currentUser.access_token) {
    return currentUser.access_token;
  }

  // If token is expired or doesn't exist, try to refresh
  if (currentUser && currentUser.expired) {
    try {
      // Try silent renewal first (if enabled)
      currentUser = await userManager.signinSilent();
      return currentUser?.access_token ?? null;
    } catch (_) {
      // If silent renewal fails, clear the user and require re-authentication
      currentUser = null;
      await userManager.removeUser();
      return null;
    }
  }

  return null;
};

export const login = async () => {
  if (!isOidcEnabled) return;
  if (!userManager) await init();
  await userManager.signinRedirect();
};

export const logout = async () => {
  if (!isOidcEnabled) return;
  if (!userManager) await init();
  await userManager.signoutRedirect();
};

export const handleCallbackIfPresent = async () => {
  if (!isOidcEnabled) return false;
  if (!userManager) await init();

  const url = new URL(window.location.href);
  // Support both /auth-callback path and implicit/query fragment callback
  const isCallbackPath = url.pathname.startsWith('/auth-callback');
  const hasOidcParams =
    url.searchParams.get('code') ||
    url.hash.includes('id_token') ||
    url.hash.includes('access_token');
  if (!isCallbackPath && !hasOidcParams) return false;

  try {
    currentUser = await userManager.signinCallback();
  } catch (_) {
    // Some providers use hash; try hash callback
    try {
      currentUser = await userManager.signinRedirectCallback();
    } catch (_) {}
  }

  // Clean URL after callback
  window.history.replaceState({}, document.title, '/');
  return true;
};

export async function init() {
  if (!isOidcEnabled || userManager) return;

  // Explicitly fetch metadata from our backend proxy
  const metadataRes = await fetch('/api/auth/metadata');
  if (!metadataRes.ok) {
    throw new Error(await metadataRes.text(), {
      cause: metadataRes.status,
    });
  }

  const oidcMetadata = await metadataRes.json();

  userManager = new UserManager({
    authority: config.get('OIDC_ISSUER_URI'),
    client_id: config.get('OIDC_CLIENT_ID'),
    redirect_uri: `${window.location.origin}/auth-callback`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: 'openid',
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    automaticSilentRenew: false, // Disable iframe-based silent renewal
    silent_redirect_uri: `${window.location.origin}/auth-callback`,
    // Pass the fetched metadata directly
    metadata: {
      ...oidcMetadata, // Include all properties from the fetched metadata
      token_endpoint: `${window.location.origin}/api/auth/token`, // Override token_endpoint
    },
    // Additional settings to avoid iframe issues
    loadUserInfo: false, // Disable userinfo endpoint calls that might use iframes
    includeIdTokenInSilentRenew: false, // Reduce iframe usage
  });

  try {
    currentUser = await userManager.getUser();
  } catch {}
}

export async function authFetch(input: RequestInfo | URL, initOpts: RequestInit = {}) {
  if (!isOidcEnabled) {
    return fetch(input, initOpts);
  }

  await init();
  const token = await getAccessToken();
  const headers = new Headers(initOpts.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(input, { ...initOpts, headers });

  // If we get a 401 and OIDC is enabled, try to re-authenticate
  if (response.status === 401) {
    // Clear any existing user data
    if (userManager) {
      await userManager.removeUser();
      currentUser = null;
    }
    // Redirect to login
    await login();
    // Return a never-resolving promise to halt callers; after redirect the app reloads
    return new Promise<Response>(() => {});
  }
  return response;
}
