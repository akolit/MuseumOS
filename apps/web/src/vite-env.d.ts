/// <reference types="vite/client" />

// Build-time branding, consumed by src/lib/branding.ts. All optional —
// each has a generic fallback so an unconfigured build still runs.
interface ImportMetaEnv {
  readonly VITE_ORG_SHORT_NAME?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_SOCIAL_HANDLE?: string;
  readonly VITE_SOCIAL_HASHTAGS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
