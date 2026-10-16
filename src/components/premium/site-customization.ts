import { useEffect, useMemo, useState } from 'react';
import { getCurrentSiteConfig } from '@/config/site-registry';
import type { PremiumSection } from './types';

export type SiteThemeColors = {
    primary: string;
    secondary: string;
    nav_background: string;
    nav_text: string;
    header_background: string;
};

export type SiteCustomization = {
    navigation: PremiumSection[];
    colors: SiteThemeColors;
    loaded: boolean;
};

export const NAVIGATION_CATALOG: Array<{ id: PremiumSection; label: string; required?: boolean }> = [
    { id: 'dashboard', label: 'Dashboard', required: true },
    { id: 'bot_builder', label: 'Bot Builder' },
    { id: 'free_bots', label: 'Free Bots' },
    { id: 'auto_trader', label: 'Auto Trades' },
    { id: 'manual_trading', label: 'Manual Trading' },
    { id: 'tradingview', label: 'TradingView' },
    { id: 'bulk_trader', label: 'Bulk Trader' },
    { id: 'batch_trader', label: 'Batch Trader' },
    { id: 'speedbot', label: 'Speed Bot' },
    { id: 'copy_trading', label: 'Copy Trading' },
    { id: 'analysis_tools', label: 'Analysis Tool' },
    { id: 'pro_analysis', label: 'Pro Analysis' },
    { id: 'calculator', label: 'Calculator' },
];

export const DEFAULT_NAVIGATION = NAVIGATION_CATALOG.map(item => item.id);

export const DEFAULT_THEME_COLORS: SiteThemeColors = {
    primary: '#059669',
    secondary: '#19cba3',
    nav_background: '#151d26',
    nav_text: '#f3f6f8',
    header_background: '#ffffff',
};

const CATALOG_IDS = new Set(DEFAULT_NAVIGATION);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const GITHUB_RAW_SITE_CONFIG = 'https://raw.githubusercontent.com/DukeNyamasege/nnn/main/public/site-config/domains';

export const isCustomizableSection = (section: PremiumSection) => CATALOG_IDS.has(section);

const normalizeNavigation = (value: unknown): PremiumSection[] => {
    if (!Array.isArray(value)) return [...DEFAULT_NAVIGATION];

    const seen = new Set<PremiumSection>();
    const navigation = value
        .map(item => String(item) as PremiumSection)
        .filter(item => CATALOG_IDS.has(item) && !seen.has(item) && Boolean(seen.add(item)));

    // Dashboard is the safe landing destination and cannot be removed by a domain configuration.
    if (!navigation.includes('dashboard')) navigation.unshift('dashboard');
    // Keep Free Bots and Pro Analysis available even when an older domain config
    // has a navigation list created before these sections existed.
    if (!navigation.includes('free_bots')) navigation.push('free_bots');
    if (!navigation.includes('pro_analysis')) navigation.push('pro_analysis');
    return navigation.length ? navigation : ['dashboard'];
};

const normalizeColors = (value: unknown): SiteThemeColors => {
    const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const next = { ...DEFAULT_THEME_COLORS };

    (Object.keys(next) as Array<keyof SiteThemeColors>).forEach(key => {
        const color = String(candidate[key] ?? '');
        if (HEX_COLOR.test(color)) next[key] = color.toLowerCase();
    });

    return next;
};

const readJson = async (urls: string[]) => {
    for (const url of urls) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) return response.json();
            if (response.status !== 404) console.warn(`Site customization request failed (${response.status}): ${url}`);
        } catch (error) {
            console.warn(`Site customization request failed: ${url}`, error);
        }
    }
    return null;
};

export const useSiteCustomization = (): SiteCustomization => {
    const site = getCurrentSiteConfig();
    const [state, setState] = useState<SiteCustomization>({
        navigation: [...DEFAULT_NAVIGATION],
        colors: { ...DEFAULT_THEME_COLORS },
        loaded: false,
    });

    const domainConfigUrl = useMemo(
        () => `/site-config/domains/${encodeURIComponent(site.id)}.json`,
        [site.id]
    );

    useEffect(() => {
        let alive = true;

        void readJson([
            domainConfigUrl,
            `${GITHUB_RAW_SITE_CONFIG}/${encodeURIComponent(site.id)}.json`,
        ]).then(payload => {
            if (!alive) return;
            setState({
                navigation: normalizeNavigation(payload?.navigation),
                colors: normalizeColors(payload?.colors),
                loaded: true,
            });
        });

        return () => {
            alive = false;
        };
    }, [domainConfigUrl]);

    return state;
};
