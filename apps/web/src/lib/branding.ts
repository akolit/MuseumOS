// Institution-specific branding.
//
// MuseumOS is deployment-neutral: everything that names one particular museum
// lives here and is supplied at build time, so a fork only has to set env vars
// rather than edit components. Every value has a usable generic default, so
// the app runs unconfigured.
//
// Set these in `.env` (Vite reads `VITE_*` at build time):
//   VITE_ORG_SHORT_NAME    — short name used in generated social captions
//   VITE_PUBLIC_SITE_URL   — public-facing site that exhibit permalinks target
//   VITE_SOCIAL_HANDLE     — example handle shown as a form placeholder
//   VITE_SOCIAL_HASHTAGS   — comma-separated hashtags suggested on every post

const env = import.meta.env;

export const branding = {
  shortName: env.VITE_ORG_SHORT_NAME || 'the museum',

  // Trailing slash stripped so callers can always join with a leading '/'.
  publicSiteUrl: (env.VITE_PUBLIC_SITE_URL || 'https://example.org').replace(/\/+$/, ''),

  socialHandle: env.VITE_SOCIAL_HANDLE || '@yourmuseum',

  baseHashtags: (env.VITE_SOCIAL_HASHTAGS || '#museum,#vintagecomputing')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`)),
};

// Public permalink for an exhibit, as printed on labels and attached to posts.
export function publicExhibitUrl(displayId: string): string {
  return `${branding.publicSiteUrl}/exhibits/${displayId}`;
}

// Same permalink without the scheme — for compact display in the UI.
export function publicExhibitUrlDisplay(displayId: string): string {
  return publicExhibitUrl(displayId).replace(/^https?:\/\//, '');
}
