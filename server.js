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
// Ad Management Dashboard Routes (SQLite Backed)
// ─────────────────────────────────────────────
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.join(__dirname, 'ads.db');
const ADS_CONFIG_PATH = path.join(__dirname, 'ads_config.json');

// Initialize database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[Database] Failed to open database:', err.message);
    } else {
        console.log('[Database] Connected to SQLite database.');
        initializeDatabase();
    }
});

// Helper to initialize table and seed default config if empty
function initializeDatabase() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS ads_config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `, (err) => {
            if (err) {
                console.error('[Database] Failed to create table:', err.message);
                return;
            }
            
            // Check if database is empty to seed it
            db.get(`SELECT COUNT(*) as count FROM ads_config`, [], (err, row) => {
                if (err) {
                    console.error('[Database] Failed to check config count:', err.message);
                    return;
                }
                
                if (row.count === 0) {
                    console.log('[Database] Table is empty. Seeding from file or defaults...');
                    const initialConfig = getAdsConfigFromFile();
                    db.serialize(() => {
                        const stmt = db.prepare(`INSERT OR REPLACE INTO ads_config (key, value) VALUES (?, ?)`);
                        Object.entries(initialConfig).forEach(([k, v]) => {
                            stmt.run(k, JSON.stringify(v));
                        });
                        stmt.finalize((err) => {
                            if (err) {
                                console.error('[Database] Seeding failed:', err.message);
                            } else {
                                console.log('[Database] Seeding completed successfully.');
                            }
                        });
                    });
                }
            });
        });
    });
}

// Return the default fallbacks
function getDefaults() {
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

// Helper to load ad configuration from file safely
function getAdsConfigFromFile() {
    try {
        if (fs.existsSync(ADS_CONFIG_PATH)) {
            const data = fs.readFileSync(ADS_CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[Ads Config File] Error reading file:', e.message);
    }
    return getDefaults();
}

// Retrieve configuration from database, with fallback to file
function getAdsConfig(callback) {
    db.all(`SELECT key, value FROM ads_config`, [], (err, rows) => {
        if (err) {
            return callback(err);
        }
        if (!rows || rows.length === 0) {
            return callback(null, getAdsConfigFromFile());
        }
        
        const config = {};
        rows.forEach(row => {
            try {
                config[row.key] = JSON.parse(row.value);
            } catch (e) {
                console.error(`[Database] Error parsing JSON for key ${row.key}:`, e.message);
            }
        });
        
        // Merge with defaults to ensure all fields are present
        const merged = { ...getDefaults(), ...config };
        callback(null, merged);
    });
}

// Serve admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// API: Retrieve ad configuration
app.get('/api/ads', (req, res) => {
    getAdsConfig((err, config) => {
        if (err) {
            console.error('[Database] Failed to load config, falling back to file:', err.message);
            return res.json({ success: true, data: getAdsConfigFromFile() });
        }
        res.json({ success: true, data: config });
    });
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

    // Save to Database and then sync file
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        let hasError = false;
        
        const stmt = db.prepare(`INSERT OR REPLACE INTO ads_config (key, value) VALUES (?, ?)`);
        
        Object.entries(config).forEach(([k, v]) => {
            stmt.run(k, JSON.stringify(v), (err) => {
                if (err) {
                    console.error(`[Database] Failed to save key ${k}:`, err.message);
                    hasError = true;
                }
            });
        });
        
        stmt.finalize(() => {
            if (hasError) {
                db.run('ROLLBACK');
                console.error('[Database] Save failed, rolled back transaction.');
                return res.status(500).json({ success: false, error: 'Failed to write configuration to database' });
            }
            
            db.run('COMMIT', (err) => {
                if (err) {
                    console.error('[Database] Commit failed:', err.message);
                    return res.status(500).json({ success: false, error: 'Failed to commit database transaction' });
                }
                
                console.log('[Database] Ad configuration saved successfully.');
                
                // Write/sync back to the JSON file
                try {
                    fs.writeFileSync(ADS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
                    console.log('[Ads Config File] Synced successfully.');
                    res.json({ success: true, message: 'Configuration saved successfully.' });
                } catch (e) {
                    console.error('[Ads Config File] Sync failed:', e.message);
                    res.json({ success: true, message: 'Saved to database successfully, but file synchronization failed.' });
                }
            });
        });
    });
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
