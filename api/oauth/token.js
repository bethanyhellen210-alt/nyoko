const ALLOWED_HOST = 'nyoko-beryl.vercel.app';
const DEFAULT_REDIRECT_URI = 'https://nyoko-beryl.vercel.app/callback';
const TOKEN_ENDPOINT = 'https://auth.deriv.com/oauth2/token';

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');

    const origin = req.headers.origin || '';
    let originHost = '';
    try {
        originHost = new URL(origin).hostname.toLowerCase();
    } catch {
        originHost = '';
    }

    if (originHost !== ALLOWED_HOST) {
        return res.status(403).json({
            error: 'origin_not_allowed',
            error_description: 'This OAuth endpoint is configured for the Nyoko Vercel domain only.',
        });
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    const clientId = process.env.CLIENT_ID;
    const redirectUri = process.env.DERIV_REDIRECT_URI || DEFAULT_REDIRECT_URI;
    if (!clientId) {
        return res.status(500).json({
            error: 'server_configuration_error',
            error_description: 'Set CLIENT_ID in Vercel to your Deriv OAuth 2.0 client ID.',
        });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const grantType = payload.grant_type;
    const form = new URLSearchParams();
    form.set('client_id', clientId);

    if (grantType === 'authorization_code') {
        if (payload.site_id !== 'nyoko-vercel' || !payload.code || !payload.code_verifier) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'A valid authorization code, PKCE verifier, and Nyoko site ID are required.',
            });
        }
        form.set('grant_type', 'authorization_code');
        form.set('code', String(payload.code));
        form.set('code_verifier', String(payload.code_verifier));
        form.set('redirect_uri', redirectUri);
    } else if (grantType === 'refresh_token') {
        if (!payload.refresh_token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'refresh_token is required.',
            });
        }
        form.set('grant_type', 'refresh_token');
        form.set('refresh_token', String(payload.refresh_token));
    } else {
        return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    try {
        const upstream = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: form.toString(),
        });
        const raw = await upstream.text();
        let data;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            data = {
                error: 'invalid_upstream_response',
                error_description: 'Deriv returned a non-JSON token response.',
            };
        }
        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error('Deriv OAuth token exchange failed:', error);
        return res.status(502).json({
            error: 'oauth_upstream_unavailable',
            error_description: 'Unable to reach the Deriv OAuth token service.',
        });
    }
};
