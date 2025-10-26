const get = (key: string, defaultValue: string = ''): string => {
  let value = '';
  try {
    if (key === 'OIDC_ISSUER_URI') {
      value = process.env.ENV_PUBLIC_OIDC_ISSUER_URI;
    } else if (key === 'OIDC_CLIENT_ID') {
      value = process.env.ENV_PUBLIC_OIDC_CLIENT_ID;
    } else {
      throw new Error('Config key not setup');
    }
  } catch {
    value = (window as any).__APP_CONFIG__?.[`ENV_PUBLIC_${key}`];
  }

  return value ?? defaultValue;
};

export default { get };
