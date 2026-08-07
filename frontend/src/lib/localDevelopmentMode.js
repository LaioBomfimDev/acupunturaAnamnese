export const LOCAL_DEVELOPMENT_MODE =
  import.meta.env.DEV
  && import.meta.env.VITE_ENABLE_LOCAL_AUTH_FALLBACK === 'true';
