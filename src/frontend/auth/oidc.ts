import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

type OidcConfig = {
  enabled: boolean;
  issuer?: string | null;
  audience?: string | null;
  clientId?: string | null;
};

let userManager: UserManager | null = null;
let currentUser: User | null = null;
let configLoaded = false;
let config: OidcConfig | null = null;

export const getAccessToken = async (): Promise<string | null> => {
  if (!configLoaded) await init();
  if (!config?.enabled) return null;
  if (!userManager) return null;

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

export const isOidcEnabled = async (): Promise<boolean> => {
  if (!configLoaded) await init();
  return Boolean(config?.enabled);
};

export const login = async () => {
  if (!configLoaded) await init();
  if (!config?.enabled || !userManager) return;
  await userManager.signinRedirect();
};

export const logout = async () => {
  if (!configLoaded) await init();
  if (!config?.enabled || !userManager) return;
  await userManager.signoutRedirect();
};

export const handleCallbackIfPresent = async () => {
  if (!configLoaded) await init();
  if (!config?.enabled || !userManager) return false;

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

async function fetchServerAuthConfig(): Promise<OidcConfig> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) return { enabled: false };
  return res.json();
}

export async function init() {
  if (configLoaded) return;
  config = await fetchServerAuthConfig();
  configLoaded = true;
  if (!config.enabled) return;

  if (!config.issuer || !config.clientId) {
    console.warn('OIDC enabled on server but missing issuer/clientId');
    return;
  }

  // Explicitly fetch metadata from our backend proxy
  const metadataRes = await fetch('/api/auth/metadata');
  if (!metadataRes.ok) {
    console.error(
      'Failed to fetch OIDC metadata from backend proxy:',
      metadataRes.status,
      metadataRes.statusText
    );

    return;
  }

  const oidcMetadata = await metadataRes.json();

  userManager = new UserManager({
    authority: String(config.issuer),
    client_id: String(config.clientId),
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
  await init();
  const token = await getAccessToken();
  const headers = new Headers(initOpts.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(input, { ...initOpts, headers });

  // If we get a 401 and OIDC is enabled, try to re-authenticate
  if (response.status === 401 && (await isOidcEnabled())) {
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
