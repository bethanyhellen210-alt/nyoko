import brandConfig from '../../brand.config.json';

export type SiteEnvironment = 'production' | 'staging';

export interface SiteBotLibraryConfig {
    title?: string;
    manifest_url?: string;
    base_url?: string;
}

export interface SiteOAuthConfig {
    id: string;
    hosts: string[];
    display_domain: string;
    website_url: string;
    redirect_uri: string;
    client_id: string;
    scopes: string[];
    environment: SiteEnvironment;
    legacy_app_id?: string;
    bot_library?: SiteBotLibraryConfig;
}

interface MultiSiteConfig {
    default_site: string;
    entries: SiteOAuthConfig[];
}

const multiSite = brandConfig.sites as MultiSiteConfig;

const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/^www\./, '');

const NYOKO_VERCEL_HOST = 'nyoko-beryl.vercel.app';
const NYOKO_VERCEL_SITE_ID = 'nyoko-vercel';
const NYOKO_VERCEL_CONFIG: SiteOAuthConfig = {
    id: NYOKO_VERCEL_SITE_ID,
    hosts: [NYOKO_VERCEL_HOST],
    display_domain: NYOKO_VERCEL_HOST,
    website_url: 'https://nyoko-beryl.vercel.app',
    redirect_uri: process.env.DERIV_REDIRECT_URI || 'https://nyoko-beryl.vercel.app/callback',
    // CLIENT_ID must be the OAuth 2.0 client ID registered for this exact callback URL.
    client_id: process.env.CLIENT_ID || '',
    scopes: ['trade', 'application_read'],
    environment: 'production',
    legacy_app_id: process.env.APP_ID || undefined,
};

export const getAllSiteConfigs = (): SiteOAuthConfig[] => [...multiSite.entries, NYOKO_VERCEL_CONFIG];

export const getSiteConfigById = (siteId: string | null | undefined): SiteOAuthConfig | undefined => {
    if (!siteId) return undefined;
    if (siteId === NYOKO_VERCEL_SITE_ID) return NYOKO_VERCEL_CONFIG;
    return multiSite.entries.find(site => site.id === siteId);
};

export const getDefaultSiteConfig = (): SiteOAuthConfig => {
    const configuredDefault = getSiteConfigById(multiSite.default_site);
    if (configuredDefault) return configuredDefault;

    const first = multiSite.entries[0];
    if (!first) throw new Error('No site OAuth configurations are defined.');
    return first;
};

export const resolveSiteConfig = (hostname?: string): SiteOAuthConfig | undefined => {
    const currentHost = normalizeHost(
        hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
    );

    if (!currentHost) return undefined;

    if (currentHost === NYOKO_VERCEL_HOST) return NYOKO_VERCEL_CONFIG;

    return multiSite.entries.find(site => site.hosts.some(host => normalizeHost(host) === currentHost));
};

/**
 * Safe configuration fallback. Visible branding should use the actual browser
 * hostname; this object is for API/client configuration only.
 */
export const getCurrentSiteConfig = (): SiteOAuthConfig => resolveSiteConfig() ?? getDefaultSiteConfig();

/**
 * Fail closed for OAuth. Every production/custom domain must be explicitly listed in
 * brand.config.json -> sites.entries[].hosts with its own client_id + redirect_uri.
 */
export const requireCurrentSiteConfig = (): SiteOAuthConfig => {
    const site = resolveSiteConfig();
    if (site) return site;

    throw new Error(
        `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'unknown'}) has no Deriv OAuth configuration.`
    );
};
