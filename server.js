/**
 * SportSRC Live - Node.js Express Proxy Server
 * Serves static files and proxies API requests to SportSRC API.
 * This avoids browser CORS restrictions when fetching live stream data.
 */

require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json()); // Support JSON-encoded request bodies
const PORT = process.env.PORT || process.env.NODE_PORT || 3000;

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
const API_BASE = process.env.SPORTSRC_API_BASE || 'https://api.sportsrc.org/';
const API_KEYS = [
    process.env.SPORTSRC_KEY_1,
    process.env.SPORTSRC_KEY_2,
].filter(Boolean);
if (!API_KEYS.length) {
    API_KEYS.push('d69fd24b135ab1496edf433bee6092cf', '39033471315a92133134448699dec0fd');
}
let activeKeyIndex = 0;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Makes a request to the SportSRC API with automatic key rotation.
 * @param {string} queryString - e.g. "?data=sports"
 * @param {Function} callback - (err, data) => {}
 */
function fetchSportSRC(queryString, callback) {
    const tryKey = (keyIndex, attempts) => {
        if (attempts >= API_KEYS.length) {
            return callback(new Error('All API keys exhausted.'));
        }

        const key = API_KEYS[keyIndex];
        const separator = queryString.includes('?') ? '&' : '?';
        const url = `${API_BASE}${queryString}${separator}key=${key}`;

        console.log(`[API] Fetching: ${url}`);

        https.get(url, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(rawData);
                    if (parsed.success) {
                        activeKeyIndex = keyIndex; // remember working key
                        callback(null, parsed.data);
                    } else {
                        console.error(`[API] Key ${keyIndex} responded success:false — rotating key`);
                        tryKey((keyIndex + 1) % API_KEYS.length, attempts + 1);
                    }
                } catch (e) {
                    callback(new Error('Failed to parse API response: ' + e.message));
                }
            });
        }).on('error', (err) => {
            console.error(`[API] Key ${keyIndex} network error: ${err.message} — rotating key`);
            tryKey((keyIndex + 1) % API_KEYS.length, attempts + 1);
        });
    };

    tryKey(activeKeyIndex, 0);
}

// ─────────────────────────────────────────────
// Static Assets
// ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────────
// CORS Headers Middleware (for development)
// ─────────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// ─────────────────────────────────────────────
// Ad Management Dashboard Routes
// ─────────────────────────────────────────────
const ADS_CONFIG_PATH = path.join(__dirname, 'ads_config.json');

// Helper to load ad configuration safely
function getAdsConfig() {
    try {
        if (fs.existsSync(ADS_CONFIG_PATH)) {
            const data = fs.readFileSync(ADS_CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[Ads Config] Error reading file, using default values:', e.message);
    }
    // Default fallback structure
    return {
        ad_slot_hero_bottom: { enabled: true, code: "" },
        ad_slot_player_top: { enabled: true, code: "" },
        ad_slot_player_bottom: { enabled: true, code: "" },
        ad_slot_content_mid: { enabled: true, code: "" },
        global_head_inject: { enabled: true, code: "" },
        global_body_inject: { enabled: true, code: "" },
        network_optimizations: {
            adsterra_lazy_load: true,
            monetag_anti_block: false,
            adcash_bypass: false
        }
    };
}

// Serve admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// API: Retrieve ad configuration
app.get('/api/ads', (req, res) => {
    res.json({ success: true, data: getAdsConfig() });
});

// API: Save ad configuration
app.post('/api/ads', (req, res) => {
    const { password, config } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password !== adminPassword) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid password' });
    }

    if (!config || typeof config !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid config payload' });
    }

    try {
        fs.writeFileSync(ADS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
        console.log('[Ads Config] Saved successfully.');
        res.json({ success: true, message: 'Configuration saved successfully.' });
    } catch (e) {
        console.error('[Ads Config] Error saving file:', e.message);
        res.status(500).json({ success: false, error: 'Failed to write configuration file' });
    }
});

// ─────────────────────────────────────────────
// API Proxy Routes
// ─────────────────────────────────────────────

/**
 * GET /api/sports
 * Returns the list of sport categories.
 */
app.get('/api/sports', (req, res) => {
    fetchSportSRC('?data=sports', (err, data) => {
        if (err) {
            console.error('[/api/sports] Error:', err.message);
            return res.status(502).json({ success: false, error: err.message });
        }
        res.json({ success: true, data });
    });
});

/**
 * GET /api/matches?category=football
 * Returns match schedule for a given category.
 */
app.get('/api/matches', (req, res) => {
    const category = req.query.category;
    if (!category) {
        return res.status(400).json({ success: false, error: 'Missing category parameter.' });
    }
    fetchSportSRC(`?data=matches&category=${encodeURIComponent(category)}`, (err, data) => {
        if (err) {
            console.error('[/api/matches] Error:', err.message);
            return res.status(502).json({ success: false, error: err.message });
        }
        res.json({ success: true, data });
    });
});

/**
 * GET /api/detail?category=football&id=match-id
 * Returns detailed info + stream sources for a specific match.
 */
app.get('/api/detail', (req, res) => {
    const { category, id } = req.query;
    if (!category || !id) {
        return res.status(400).json({ success: false, error: 'Missing category or id parameter.' });
    }
    fetchSportSRC(`?data=detail&category=${encodeURIComponent(category)}&id=${encodeURIComponent(id)}`, (err, data) => {
        if (err) {
            console.error('[/api/detail] Error:', err.message);
            return res.status(502).json({ success: false, error: err.message });
        }
        res.json({ success: true, data });
    });
});

// ─────────────────────────────────────────────
// Catch-all: serve index.html for SPA routing
// ─────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   SportSRC Live - Server Running           ║');
    console.log(`║   Open: http://localhost:${PORT}               ║`);
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Set PORT or NODE_PORT to a free port, or stop the process already bound to that port.`);
    } else {
        console.error('Server startup error:', err);
    }
    process.exit(1);
});
