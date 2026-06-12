/**
 * SportSRC Live – Frontend Application Controller
 * ─────────────────────────────────────────────────
 * • When served via http://localhost:3000, all API calls go through
 *   the local Express proxy (/api/…) which adds the keys server-side.
 * • When opened as a file:// URL the app detects the situation, attempts
 *   a direct API call, and if that fails falls back to MOCK_DATA which
 *   includes real, embeddable live/demo streams so the UI is always
 *   fully interactive.
 */

// ─────────────────────────────────────────────
// Runtime mode detection
// ─────────────────────────────────────────────
const IS_LOCAL_SERVER = window.IS_HOSTED ?? location.protocol.startsWith('http');
const API_BASE_PROXY = window.API_PROXY_PREFIX || './';
const API_BASE_DIRECT = window.DIRECT_API_BASE || 'https://api.sportsrc.org/'; // direct API fallback
const API_KEYS = [
    'd69fd24b135ab1496edf433bee6092cf',
    '39033471315a92133134448699dec0fd'
];
let directKeyIndex = 0;

const CACHE_TTL = 30_000;   // 30 s
const LIVE_WINDOW = 9_000_000; // 2.5 h — treat match as "live" within this window

// ─────────────────────────────────────────────
// Application State
// ─────────────────────────────────────────────
const AppState = {
    activeCategory: 'football',
    isCustomFilter: false,
    customFilterType: '',
    categories: [],
    matches: [],
    filteredMatches: [],
    favorites: [],
    recentlyWatched: [],
    currentMatch: null,
    currentSources: [],
    selectedSourceIndex: 0,
    searchQuery: '',
    countdownInterval: null,
    usingMockData: false,
};

// ─────────────────────────────────────────────
// Mock Data (rich demo database with working streams)
// ─────────────────────────────────────────────
const MOCK_CATEGORIES = [
    { id: 'football',          name: 'Football' },
    { id: 'basketball',        name: 'Basketball' },
    { id: 'fight',             name: 'Fight (UFC, Boxing)' },
    { id: 'american-football', name: 'American Football' },
    { id: 'baseball',          name: 'Baseball' },
    { id: 'hockey',            name: 'Hockey' },
    { id: 'tennis',            name: 'Tennis' },
    { id: 'motor-sports',      name: 'Motor Sports' },
];

// Build timestamps: some "live" (started 30 min ago), some upcoming
const now = Date.now();
const live    = (offset = 0) => now - 1_800_000 + offset;  // started 30 min ago + offset
const soon    = (h = 1)      => now + h * 3_600_000;

const MOCK_MATCHES = {
    football: [
        {
            id: 'brazil-vs-argentina-demo',
            title: 'Brazil vs Argentina',
            category: 'football',
            date: live(),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1551958219-acbc595b9b2a?w=640&q=80',
            teams: {
                home: { name: 'Brazil',    badge: 'https://flagcdn.com/w40/br.png' },
                away: { name: 'Argentina', badge: 'https://flagcdn.com/w40/ar.png' },
            },
            sources: [
                { streamNo: 1, language: 'English – ESPN', hd: true,  viewers: 124500, embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCiWLfSweyRNmLpgEHekhoAg&autoplay=1' },
                { streamNo: 2, language: 'English – FOX',  hd: true,  viewers: 87200,  embedUrl: 'https://www.youtube.com/embed/dDPdCfBvXNs?autoplay=1' },
                { streamNo: 3, language: 'Spanish – TV',   hd: false, viewers: 32100,  embedUrl: 'https://www.youtube.com/embed/EngW7tLk6R8?autoplay=1' },
            ],
        },
        {
            id: 'germany-vs-france-demo',
            title: 'Germany vs France',
            category: 'football',
            date: live(600_000),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=640&q=80',
            teams: {
                home: { name: 'Germany', badge: 'https://flagcdn.com/w40/de.png' },
                away: { name: 'France',  badge: 'https://flagcdn.com/w40/fr.png' },
            },
            sources: [
                { streamNo: 1, language: 'English – BT Sport', hd: true,  viewers: 98300, embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1' },
                { streamNo: 2, language: 'French – TF1',        hd: false, viewers: 41000, embedUrl: 'https://www.youtube.com/embed/mWRsgZuwf_8?autoplay=1' },
            ],
        },
        {
            id: 'england-vs-spain-demo',
            title: 'England vs Spain',
            category: 'football',
            date: soon(2),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=640&q=80',
            teams: {
                home: { name: 'England', badge: 'https://flagcdn.com/w40/gb-eng.png' },
                away: { name: 'Spain',   badge: 'https://flagcdn.com/w40/es.png' },
            },
            sources: [
                { streamNo: 1, language: 'English – ITV',  hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1' },
            ],
        },
        {
            id: 'portugal-vs-netherlands-demo',
            title: 'Portugal vs Netherlands',
            category: 'football',
            date: soon(4),
            popular: false,
            poster: 'https://images.unsplash.com/photo-1508098682722-e99c643e7f0f?w=640&q=80',
            teams: {
                home: { name: 'Portugal',    badge: 'https://flagcdn.com/w40/pt.png' },
                away: { name: 'Netherlands', badge: 'https://flagcdn.com/w40/nl.png' },
            },
            sources: [
                { streamNo: 1, language: 'English', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A?autoplay=1' },
            ],
        },
        {
            id: 'italy-vs-croatia-demo',
            title: 'Italy vs Croatia',
            category: 'football',
            date: soon(6),
            popular: true,
            poster: '',
            teams: {
                home: { name: 'Italy',   badge: 'https://flagcdn.com/w40/it.png' },
                away: { name: 'Croatia', badge: 'https://flagcdn.com/w40/hr.png' },
            },
            sources: [
                { streamNo: 1, language: 'English – RAI', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/jNQXAC9IVRw?autoplay=1' },
            ],
        },
        {
            id: 'usa-vs-mexico-demo',
            title: 'USA vs Mexico',
            category: 'football',
            date: soon(9),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1614632537197-38a17061c2bd?w=640&q=80',
            teams: {
                home: { name: 'USA',    badge: 'https://flagcdn.com/w40/us.png' },
                away: { name: 'Mexico', badge: 'https://flagcdn.com/w40/mx.png' },
            },
            sources: [
                { streamNo: 1, language: 'English – Fox Soccer', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/qWNQUvIk954?autoplay=1' },
            ],
        },
    ],
    basketball: [
        {
            id: 'lakers-vs-celtics-demo',
            title: 'Lakers vs Celtics',
            category: 'basketball',
            date: live(),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=640&q=80',
            teams: {
                home: { name: 'LA Lakers',      badge: 'https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg' },
                away: { name: 'Boston Celtics', badge: 'https://cdn.nba.com/logos/nba/1610612738/global/L/logo.svg' },
            },
            sources: [
                { streamNo: 1, language: 'English – TNT', hd: true, viewers: 85300, embedUrl: 'https://www.youtube.com/embed/s86-Z-CbaHA?autoplay=1' },
                { streamNo: 2, language: 'English – NBA TV', hd: true, viewers: 33100, embedUrl: 'https://www.youtube.com/embed/gOHB7K8IXVE?autoplay=1' },
            ],
        },
        {
            id: 'bulls-vs-heat-demo',
            title: 'Chicago Bulls vs Miami Heat',
            category: 'basketball',
            date: soon(3),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=640&q=80',
            teams: {
                home: { name: 'Chicago Bulls', badge: '' },
                away: { name: 'Miami Heat',    badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – ESPN', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/elxaOfEaW1s?autoplay=1' },
            ],
        },
        {
            id: 'warriors-vs-bucks-demo',
            title: 'Golden State Warriors vs Milwaukee Bucks',
            category: 'basketball',
            date: soon(5),
            popular: false,
            poster: '',
            teams: {
                home: { name: 'Golden State Warriors', badge: '' },
                away: { name: 'Milwaukee Bucks',       badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – TNT', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/Oq9USTqOYXc?autoplay=1' },
            ],
        },
    ],
    fight: [
        {
            id: 'ufc-305-demo',
            title: 'UFC 305: Dricus Du Plessis vs Israel Adesanya',
            category: 'fight',
            date: live(),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=640&q=80',
            teams: {
                home: { name: 'Dricus Du Plessis',  badge: '' },
                away: { name: 'Israel Adesanya',    badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – ESPN+', hd: true,  viewers: 145000, embedUrl: 'https://www.youtube.com/embed/HHA_vMEWs2I?autoplay=1' },
                { streamNo: 2, language: 'English – PPV',   hd: true,  viewers: 92000,  embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1' },
                { streamNo: 3, language: 'Spanish',          hd: false, viewers: 18000,  embedUrl: 'https://www.youtube.com/embed/EngW7tLk6R8?autoplay=1' },
            ],
        },
        {
            id: 'boxing-fury-wilder-demo',
            title: 'WBC Heavyweight: Tyson Fury vs Deontay Wilder',
            category: 'fight',
            date: soon(3),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=640&q=80',
            teams: {
                home: { name: 'Tyson Fury',     badge: '' },
                away: { name: 'Deontay Wilder', badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – Sky Sports', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/mWRsgZuwf_8?autoplay=1' },
            ],
        },
        {
            id: 'ufc-fight-night-demo',
            title: 'UFC Fight Night: Yan vs O\'Malley',
            category: 'fight',
            date: soon(7),
            popular: true,
            poster: '',
            teams: {
                home: { name: 'Petr Yan',      badge: '' },
                away: { name: 'Sean O\'Malley', badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – ESPN', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A?autoplay=1' },
            ],
        },
        {
            id: 'mma-bellator-demo',
            title: 'Bellator MMA: Grand Prix Finals',
            category: 'fight',
            date: soon(2),
            popular: false,
            poster: '',
            teams: {
                home: { name: 'Ryan Bader', badge: '' },
                away: { name: 'Vadim Nemkov', badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English', hd: false, viewers: 0, embedUrl: 'https://www.youtube.com/embed/jNQXAC9IVRw?autoplay=1' },
            ],
        },
    ],
    baseball: [
        {
            id: 'yankees-vs-redsox-demo',
            title: 'New York Yankees vs Boston Red Sox',
            category: 'baseball',
            date: live(),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?w=640&q=80',
            teams: {
                home: { name: 'NY Yankees',      badge: '' },
                away: { name: 'Boston Red Sox',  badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – ESPN', hd: true, viewers: 48000, embedUrl: 'https://www.youtube.com/embed/gOHB7K8IXVE?autoplay=1' },
                { streamNo: 2, language: 'English – YES',  hd: true, viewers: 22000, embedUrl: 'https://www.youtube.com/embed/s86-Z-CbaHA?autoplay=1' },
            ],
        },
        {
            id: 'dodgers-vs-giants-demo',
            title: 'LA Dodgers vs San Francisco Giants',
            category: 'baseball',
            date: soon(3),
            popular: true,
            poster: '',
            teams: {
                home: { name: 'LA Dodgers',        badge: '' },
                away: { name: 'San Fran. Giants',  badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – NBC Sports', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/elxaOfEaW1s?autoplay=1' },
            ],
        },
    ],
    'american-football': [
        {
            id: 'chiefs-vs-eagles-demo',
            title: 'Kansas City Chiefs vs Philadelphia Eagles',
            category: 'american-football',
            date: soon(1),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1508098682722-e99c643e7f0f?w=640&q=80',
            teams: {
                home: { name: 'KC Chiefs',           badge: '' },
                away: { name: 'Philadelphia Eagles', badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – NBC', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/qWNQUvIk954?autoplay=1' },
            ],
        },
    ],
    hockey: [
        {
            id: 'penguins-vs-capitals-demo',
            title: 'Pittsburgh Penguins vs Washington Capitals',
            category: 'hockey',
            date: live(),
            popular: true,
            poster: '',
            teams: {
                home: { name: 'Pittsburgh Penguins', badge: '' },
                away: { name: 'Washington Capitals', badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – NBCSN', hd: true, viewers: 22000, embedUrl: 'https://www.youtube.com/embed/Oq9USTqOYXc?autoplay=1' },
            ],
        },
    ],
    tennis: [
        {
            id: 'djokovic-vs-alcaraz-demo',
            title: 'Wimbledon Final: Djokovic vs Alcaraz',
            category: 'tennis',
            date: soon(2),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1561214078-f3247647fc5e?w=640&q=80',
            teams: {
                home: { name: 'Novak Djokovic', badge: '' },
                away: { name: 'Carlos Alcaraz', badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – BBC', hd: true, viewers: 0, embedUrl: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1' },
            ],
        },
    ],
    'motor-sports': [
        {
            id: 'f1-monaco-demo',
            title: 'Formula 1: Monaco Grand Prix',
            category: 'motor-sports',
            date: live(),
            popular: true,
            poster: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640&q=80',
            teams: {
                home: { name: 'Max Verstappen', badge: '' },
                away: { name: 'Lewis Hamilton',  badge: '' },
            },
            sources: [
                { streamNo: 1, language: 'English – Sky F1', hd: true, viewers: 310000, embedUrl: 'https://www.youtube.com/embed/EngW7tLk6R8?autoplay=1' },
                { streamNo: 2, language: 'English – F1 TV',  hd: true, viewers: 140000, embedUrl: 'https://www.youtube.com/embed/HHA_vMEWs2I?autoplay=1' },
            ],
        },
    ],
};

// Default sources for categories with no specific mock
function buildDefaultMockMatch(category) {
    return [{
        id: `demo-${category}`,
        title: `${category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — Live Event`,
        category,
        date: live(),
        popular: true,
        poster: '',
        teams: { home: { name: 'Home Team', badge: '' }, away: { name: 'Away Team', badge: '' } },
        sources: [
            { streamNo: 1, language: 'English', hd: true, viewers: 5000, embedUrl: 'https://www.youtube.com/embed/jNQXAC9IVRw?autoplay=1' },
        ],
    }];
}

// ─────────────────────────────────────────────
// API Layer — proxy-aware with mock fallback
// ─────────────────────────────────────────────

async function apiRequest(proxyPath, directQuery) {
    const cacheProxyKey = `api_cache_${btoa(proxyPath)}`;
    const cacheDirectKey = `api_cache_${btoa(directQuery)}`;

    const proxyUrl = `${API_BASE_PROXY}${proxyPath}`;
    if (IS_LOCAL_SERVER) {
        const cached = safeGetCache(cacheProxyKey);
        if (cached) return cached;

        try {
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Proxy returned success:false');
            safePutCache(cacheProxyKey, json.data);
            return json.data;
        } catch (e) {
            console.warn('Proxy request failed — falling back to direct API:', e.message);
        }
    }

    const cached = safeGetCache(cacheDirectKey);
    if (cached) return cached;

    for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
        const key = API_KEYS[(directKeyIndex + attempt) % API_KEYS.length];
        const sep = directQuery.includes('?') ? '&' : '?';
        const url = `${API_BASE_DIRECT}${directQuery}${sep}key=${key}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'API returned success:false');
            directKeyIndex = (directKeyIndex + attempt) % API_KEYS.length;
            safePutCache(cacheDirectKey, json.data);
            return json.data;
        } catch (e) {
            console.warn(`Direct API attempt ${attempt + 1} failed:`, e.message);
        }
    }

    throw new Error('API_UNREACHABLE');
}

function safeGetCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { timestamp, data } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL) return data;
    } catch (_) {}
    return null;
}

function safePutCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (_) {}
}

function parseTimestamp(value) {
    if (typeof value === 'number') return value;
    if (!value) return Date.now();
    if (/^\d+$/.test(String(value).trim())) return Number(value);
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeTeam(raw, fallback) {
    if (!raw) return { name: fallback, badge: '' };
    if (typeof raw === 'string') return { name: raw, badge: '' };
    return {
        name: raw.name || raw.title || raw.team || raw.displayName || fallback || 'TBA',
        badge: raw.badge || raw.logo || raw.icon || raw.image || raw.thumbnail || '',
    };
}

function normalizeStream(raw) {
    if (!raw) return { streamNo: 1, language: 'Stream', hd: false, viewers: 0, embedUrl: '' };
    return {
        streamNo: raw.streamNo || raw.stream_no || raw.id || raw.source_id || 1,
        language: raw.language || raw.lang || raw.name || raw.channel || raw.label || 'Live',
        hd: raw.hd ?? raw.highDefinition ?? raw.hd_available ?? false,
        viewers: Number(raw.viewers || raw.views || raw.watchers || raw.count || 0) || 0,
        embedUrl: raw.embedUrl || raw.url || raw.link || raw.stream_url || raw.embed_url || raw.href || '',
    };
}

function normalizeMatchObject(item, categoryOverride) {
    if (!item || typeof item !== 'object') return null;

    const home = normalizeTeam(
        item.teams?.home || item.home_team || item.home || item.team_home || item.homeTeam,
        'Home Team'
    );
    const away = normalizeTeam(
        item.teams?.away || item.away_team || item.away || item.team_away || item.awayTeam,
        'Away Team'
    );

    const category = item.category || item.sport || item.league || categoryOverride || 'unknown';
    const title = item.title || item.name || `${home.name} vs ${away.name}`;
    const poster = item.poster || item.image || item.thumbnail || item.cover || item.background || item.thumb || '';
    const sources = Array.isArray(item.sources)
        ? item.sources.map(normalizeStream)
        : Array.isArray(item.streams)
            ? item.streams.map(normalizeStream)
            : [];

    return {
        id: item.id || item.match_id || item.event_id || item.slug || `${category}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title,
        category,
        date: parseTimestamp(item.date || item.start_time || item.time || item.match_time || item.timestamp),
        poster,
        teams: { home, away },
        popular: Boolean(item.popular || item.featured || item.is_popular || item.star || item.highlight),
        sources,
    };
}

function normalizeMatches(apiData, categoryOverride) {
    let items = [];
    if (Array.isArray(apiData)) {
        items = apiData;
    } else if (apiData) {
        if (Array.isArray(apiData.matches)) items = apiData.matches;
        else if (Array.isArray(apiData.events)) items = apiData.events;
        else if (Array.isArray(apiData.data)) items = apiData.data;
        else if (Array.isArray(apiData.list)) items = apiData.list;
        else if (Array.isArray(apiData.results)) items = apiData.results;
    }
    return items.map(item => normalizeMatchObject(item, categoryOverride)).filter(Boolean);
}

function normalizeCategories(apiData) {
    let items = [];
    if (Array.isArray(apiData)) {
        items = apiData;
    } else if (apiData) {
        if (Array.isArray(apiData.categories)) items = apiData.categories;
        else if (Array.isArray(apiData.data)) items = apiData.data;
        else if (Array.isArray(apiData.list)) items = apiData.list;
    }
    return items.map(cat => ({
        id: cat.id || cat.slug || cat.key || cat.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
        name: cat.name || cat.title || cat.label || String(cat.id || cat.slug || cat.key || 'Unknown'),
    })).filter(c => c.id && c.name);
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadLocalStorageData();
    setupEventHandlers();
    startCountdownTimer();
    loadCategories().then(() => {
        const initialCategory = AppState.categories.find(c => c.id === 'football') || AppState.categories[0];
        switchCategory(initialCategory ? initialCategory.id : 'football');
    });
    // Pre-load ad config so global head/body scripts inject ASAP,
    // then run the full slot injection once the page has settled.
    loadAdsConfig().then(() => refreshDynamicAds());
});

function loadLocalStorageData() {
    try { AppState.favorites       = JSON.parse(localStorage.getItem('sportsrc_favorites') || '[]'); } catch (_) { AppState.favorites = []; }
    try { AppState.recentlyWatched = JSON.parse(localStorage.getItem('sportsrc_recent')    || '[]'); } catch (_) { AppState.recentlyWatched = []; }
    updateFavoritesBadge();
    renderRecentlyWatched();
}

function saveFavorites() {
    try { localStorage.setItem('sportsrc_favorites', JSON.stringify(AppState.favorites)); } catch (_) {}
    updateFavoritesBadge();
    renderFavorites();
}

function saveRecentlyWatched() {
    try { localStorage.setItem('sportsrc_recent', JSON.stringify(AppState.recentlyWatched)); } catch (_) {}
    renderRecentlyWatched();
}

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────
async function loadCategories() {
    try {
        const data = await apiRequest('api/sports', '?data=sports');
        const normalized = normalizeCategories(data);
        if (normalized.length) {
            AppState.categories = normalized;
            AppState.usingMockData = false;
            showMockBanner(false);
        } else {
            throw new Error('No categories returned from API');
        }
    } catch (e) {
        console.warn('Categories API failed — activating mock mode:', e.message);
        AppState.categories = MOCK_CATEGORIES;
        AppState.usingMockData = true;
        showMockBanner(true);
    }
    renderCategoryTabs();
}

function showMockBanner(show) {
    let banner = document.getElementById('mock-banner');
    if (show && !banner) {
        banner = document.createElement('div');
        banner.id = 'mock-banner';
        banner.style.cssText = `
            background: rgba(255,170,0,0.12);
            border-bottom: 1px solid rgba(255,170,0,0.35);
            color: #ffa500;
            font-size: 0.82rem;
            font-weight: 600;
            text-align: center;
            padding: 8px 16px;
            letter-spacing: 0.3px;
        `;
        const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
        const serverInstructions = isLocal
            ? `Serve via Node.js (<a href="http://localhost:3000" style="color:#ffd700;text-decoration:underline;">http://localhost:3000</a>)`
            : `Ensure the Node.js backend proxy is running`;
        banner.innerHTML = `⚠️ Demo Mode active — showing sample matches with YouTube demo streams. ${serverInstructions} for live SportSRC data.`;
        document.body.insertBefore(banner, document.body.firstChild);
    } else if (!show && banner) {
        banner.remove();
    }
}

// ─────────────────────────────────────────────
// Tab rendering
// ─────────────────────────────────────────────
function renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    const primaryTabs = [
        { id: 'football',          label: 'Football',    icon: 'fa-futbol' },
        { id: 'basketball',        label: 'Basketball',  icon: 'fa-basketball' },
        { id: 'mma',               label: 'MMA',         icon: 'fa-hand-fist', custom: true, filter: 'mma' },
        { id: 'ufc',               label: 'UFC',         icon: 'fa-shield-halved', custom: true, filter: 'ufc' },
        { id: 'baseball',          label: 'Baseball',    icon: 'fa-baseball' },
        { id: 'american-football', label: 'NFL',         icon: 'fa-football' },
    ];

    primaryTabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${AppState.activeCategory === tab.id ? 'active' : ''}`;
        btn.dataset.tabId = tab.id;
        btn.innerHTML = `<i class="fa-solid ${tab.icon}"></i> ${tab.label}`;
        btn.addEventListener('click', () =>
            tab.custom ? switchCustomCategory(tab.id, tab.filter) : switchCategory(tab.id)
        );
        tabsContainer.appendChild(btn);
    });

    // Extra API categories (skip already-mapped)
    const skip = new Set(['football', 'basketball', 'baseball', 'fight', 'american-football']);
    const iconMap = { tennis: 'fa-tennis-ball', hockey: 'fa-hockey-puck', rugby: 'fa-football',
        golf: 'fa-golf-ball-tee', 'motor-sports': 'fa-car', cricket: 'fa-cricket-bat-ball',
        billiards: 'fa-circle', darts: 'fa-bullseye', afl: 'fa-football', other: 'fa-gamepad' };

    AppState.categories.forEach(cat => {
        if (skip.has(cat.id)) return;
        const btn = document.createElement('button');
        btn.className = `tab-btn ${AppState.activeCategory === cat.id ? 'active' : ''}`;
        btn.dataset.tabId = cat.id;
        const icon = iconMap[cat.id] || 'fa-gamepad';
        btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${cat.name}`;
        btn.addEventListener('click', () => switchCategory(cat.id));
        tabsContainer.appendChild(btn);
    });
}

function updateActiveTabUI(activeId) {
    document.querySelectorAll('#category-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tabId === activeId);
    });
    const titleMap = {
        mma: 'MMA & Combat Sports', ufc: 'UFC Events',
        football: 'Football Schedule', basketball: 'Basketball Schedule',
        baseball: 'Baseball Schedule', 'american-football': 'NFL / American Football',
        fight: 'Combat Sports', hockey: 'Hockey Schedule',
        tennis: 'Tennis Schedule', 'motor-sports': 'Motor Sports',
    };
    const el = document.getElementById('category-title');
    if (el) el.textContent = titleMap[activeId] || `${activeId.replace(/-/g, ' ')} Schedule`;
}

// ─────────────────────────────────────────────
// Category switching
// ─────────────────────────────────────────────
async function switchCategory(categoryId) {
    AppState.activeCategory    = categoryId;
    AppState.isCustomFilter    = false;
    AppState.customFilterType  = '';
    updateActiveTabUI(categoryId);
    await loadCategoryMatches(categoryId);
}

async function switchCustomCategory(tabId, filterType) {
    AppState.activeCategory   = tabId;
    AppState.isCustomFilter   = true;
    AppState.customFilterType = filterType;
    updateActiveTabUI(tabId);
    await loadCategoryMatches('fight');
}

// ─────────────────────────────────────────────
// Match loading
// ─────────────────────────────────────────────
async function loadCategoryMatches(apiCategory) {
    showMatchesSkeleton(true);
    showEmptyState(false);

    try {
        let matches;
        if (AppState.usingMockData) {
            matches = getMockMatches(apiCategory);
        } else {
            try {
                const apiData = await apiRequest(
                    `api/matches?category=${encodeURIComponent(apiCategory)}`,
                    `?data=matches&category=${encodeURIComponent(apiCategory)}`
                );
                matches = normalizeMatches(apiData, apiCategory);
                if (!matches.length) {
                    throw new Error('API returned no matches');
                }
            } catch (e) {
                console.warn('Matches API failed — using mock data:', e.message);
                AppState.usingMockData = true;
                showMockBanner(true);
                matches = getMockMatches(apiCategory);
            }
        }

        AppState.matches = matches || [];

        // MMA / UFC split
        if (AppState.isCustomFilter) {
            if (AppState.customFilterType === 'ufc') {
                matches = matches.filter(m => m.title && m.title.toUpperCase().includes('UFC'));
            } else {
                matches = matches.filter(m => !m.title || !m.title.toUpperCase().includes('UFC'));
            }
        }

        // Sort: live first, then by date ascending
        matches.sort((a, b) => {
            const aL = isMatchLive(a.date), bL = isMatchLive(b.date);
            if (aL && !bL) return -1;
            if (!aL && bL) return 1;
            return a.date - b.date;
        });

        AppState.matches = matches;
        applyFilters();
        buildHeroBanner();

    } catch (err) {
        console.error('Critical match load failure:', err);
        showMatchesSkeleton(false);
        showEmptyState(true, 'Connection Error',
            'Unable to reach the match server. Please check your internet connection.', true);
    }
}

function getMockMatches(category) {
    return MOCK_MATCHES[category] || buildDefaultMockMatch(category);
}

// ─────────────────────────────────────────────
// Filtering & rendering
// ─────────────────────────────────────────────
function applyFilters() {
    const q = AppState.searchQuery.trim().toLowerCase();
    AppState.filteredMatches = q
        ? AppState.matches.filter(m =>
            (m.teams?.home?.name || '').toLowerCase().includes(q) ||
            (m.teams?.away?.name || '').toLowerCase().includes(q) ||
            (m.title || '').toLowerCase().includes(q) ||
            (m.category || '').toLowerCase().includes(q)
          )
        : [...AppState.matches];

    const fi = document.getElementById('filter-indicators');
    if (fi) fi.style.display = q ? 'flex' : 'none';
    const qd = document.getElementById('search-query-display');
    if (qd) qd.textContent = AppState.searchQuery;

    renderMatchesGrid();
}

function renderMatchesGrid() {
    showMatchesSkeleton(false);
    const grid = document.getElementById('matches-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const countBadge = document.getElementById('matches-count-badge');
    if (countBadge) countBadge.textContent = `${AppState.filteredMatches.length} matches`;

    if (!AppState.filteredMatches.length) {
        showEmptyState(true, 'No Matches Found',
            AppState.searchQuery
                ? 'No matches match your search. Try a different team or league name.'
                : 'No matches are scheduled in this category right now.');
        return;
    }

    showEmptyState(false);
    AppState.filteredMatches.forEach(m => grid.appendChild(createMatchCard(m)));
}

// ─────────────────────────────────────────────
// Match Card
// ─────────────────────────────────────────────
function createMatchCard(match) {
    const card     = document.createElement('div');
    card.className = 'match-card';
    card.dataset.id       = match.id;
    card.dataset.category = match.category;

    const isLive = isMatchLive(match.date);
    const isFav  = isMatchFavorited(match.id);

    // Poster or gradient placeholder
    let posterHtml;
    if (match.poster) {
        posterHtml = `<img src="${match.poster}" alt="${escHtml(match.title)}" class="match-poster" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                      <div class="poster-placeholder" style="display:none">
                        <span class="placeholder-sport">${escHtml(match.category)}</span>
                        <span class="placeholder-teams">${escHtml(match.teams?.home?.name||'')} vs ${escHtml(match.teams?.away?.name||'')}</span>
                      </div>`;
    } else {
        const h = match.teams?.home?.name || 'TBA';
        const a = match.teams?.away?.name || 'TBA';
        posterHtml = `<div class="poster-placeholder">
            <span class="placeholder-sport">${escHtml(match.category)}</span>
            <span class="placeholder-teams">${escHtml(h)} <br><span style="opacity:.6;font-size:.8em">VS</span><br> ${escHtml(a)}</span>
        </div>`;
    }

    // Badge
    let badgeHtml;
    if (isLive) {
        badgeHtml = `<span class="card-badge live"><span class="pulse-dot"></span>LIVE</span>`;
    } else if (match.date > Date.now()) {
        badgeHtml = `<span class="card-badge upcoming">UPCOMING</span>`;
    } else {
        badgeHtml = `<span class="card-badge" style="background:var(--text-muted);color:#000">ENDED</span>`;
    }

    // Teams
    const hBadge = match.teams?.home?.badge ? `<img src="${match.teams.home.badge}" class="match-card-badge" onerror="this.style.display='none'">` : `<span class="match-card-badge-placeholder"></span>`;
    const aBadge = match.teams?.away?.badge ? `<img src="${match.teams.away.badge}" class="match-card-badge" onerror="this.style.display='none'">` : `<span class="match-card-badge-placeholder"></span>`;
    const hName  = escHtml(match.teams?.home?.name || 'TBD');
    const aName  = escHtml(match.teams?.away?.name || 'TBD');

    // Footer time
    let timeHtml;
    if (isLive) {
        timeHtml = `<span class="countdown-timer" style="color:var(--accent-red)"><i class="fa-solid fa-circle-dot"></i> LIVE</span>`;
    } else if (match.date > Date.now()) {
        timeHtml = `<span class="countdown-timer" data-countdown="${match.date}">${getCountdownString(match.date)}</span>`;
    } else {
        timeHtml = `<span style="color:var(--text-muted)">Completed</span>`;
    }

    card.innerHTML = `
        <div class="match-poster-wrapper">
            ${posterHtml}
            <div class="card-overlay-top">
                ${badgeHtml}
                <button class="card-fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Remove from Favorites' : 'Add to Favorites'}">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
            </div>
            <div class="play-hover-overlay">
                <div class="play-icon-circle"><i class="fa-solid fa-play"></i></div>
            </div>
        </div>
        <div class="match-details">
            <span class="match-league">${escHtml(match.category.replace(/-/g,' '))}</span>
            <div class="match-teams">
                <div class="match-team-row"><span class="match-team-info">${hBadge} ${hName}</span></div>
                <div class="match-team-row"><span class="match-team-info">${aBadge} ${aName}</span></div>
            </div>
            <div class="match-time-footer">
                <span>${formatMatchDate(match.date)}</span>
                ${timeHtml}
            </div>
        </div>`;

    card.addEventListener('click', e => {
        if (e.target.closest('.card-fav-btn')) {
            e.stopPropagation();
            toggleFavoriteMatch(match);
            const btn = card.querySelector('.card-fav-btn');
            const fav = isMatchFavorited(match.id);
            btn.classList.toggle('active', fav);
            btn.querySelector('i').className = `${fav ? 'fa-solid' : 'fa-regular'} fa-heart`;
            return;
        }
        loadMatchStream(match);
    });

    return card;
}

// ─────────────────────────────────────────────
// Hero Banner
// ─────────────────────────────────────────────
function buildHeroBanner() {
    let featured = AppState.matches.find(m => isMatchLive(m.date) && m.popular)
                || AppState.matches.find(m => isMatchLive(m.date))
                || AppState.matches.find(m => m.popular)
                || AppState.matches[0];

    const backdrop   = document.getElementById('hero-backdrop');
    const titleEl    = document.getElementById('hero-title');
    const subtitleEl = document.getElementById('hero-subtitle');
    const timeEl     = document.getElementById('hero-time');
    const catEl      = document.getElementById('hero-category');
    const statusEl   = document.getElementById('hero-status-badge');
    const watchBtn   = document.getElementById('hero-watch-btn');
    const favBtn     = document.getElementById('hero-fav-btn');
    const teamsEl    = document.getElementById('hero-teams-preview');

    if (!featured) {
        if (titleEl) titleEl.textContent = 'No Events Scheduled';
        if (subtitleEl) subtitleEl.textContent = 'Check back later for live broadcasts.';
        return;
    }

    const isLive = isMatchLive(featured.date);
    const isFav  = isMatchFavorited(featured.id);
    const home   = featured.teams?.home?.name || '';
    const away   = featured.teams?.away?.name || '';

    if (backdrop) {
        backdrop.style.backgroundImage = featured.poster
            ? `url('${featured.poster}')`
            : 'linear-gradient(135deg,#1f2235 0%,#090a0f 100%)';
    }

    if (titleEl)    titleEl.textContent    = home && away ? `${home} vs ${away}` : featured.title;
    if (subtitleEl) subtitleEl.textContent = `Catch all the action live — multi-source streams, real-time coverage.`;
    if (timeEl)     timeEl.innerHTML       = `<i class="fa-regular fa-calendar"></i> ${formatMatchDate(featured.date)}`;
    if (catEl)      catEl.innerHTML        = `<i class="fa-solid fa-gamepad"></i> ${featured.category.toUpperCase()}`;

    if (statusEl) {
        if (isLive) {
            statusEl.className = 'hero-status-badge live';
            statusEl.innerHTML = '<span class="pulse-dot"></span>LIVE NOW';
        } else if (featured.date > Date.now()) {
            statusEl.className = 'hero-status-badge upcoming';
            statusEl.innerHTML = `<i class="fa-regular fa-clock"></i> UPCOMING`;
        } else {
            statusEl.className = 'hero-status-badge';
            statusEl.style.background = 'rgba(255,255,255,0.05)';
            statusEl.style.color = 'var(--text-secondary)';
            statusEl.innerHTML = 'COMPLETED';
        }
    }

    if (teamsEl) {
        if (home && away) {
            const hb = featured.teams?.home?.badge ? `<img src="${featured.teams.home.badge}" class="hero-team-badge" onerror="this.style.display='none'">` : '';
            const ab = featured.teams?.away?.badge ? `<img src="${featured.teams.away.badge}" class="hero-team-badge" onerror="this.style.display='none'">` : '';
            teamsEl.innerHTML = `
                <div class="hero-team">${hb} ${escHtml(home)}</div>
                <div class="hero-vs">VS</div>
                <div class="hero-team">${ab} ${escHtml(away)}</div>`;
            teamsEl.style.display = 'flex';
        } else {
            teamsEl.style.display = 'none';
        }
    }

    if (watchBtn) watchBtn.onclick = () => loadMatchStream(featured);

    if (favBtn) {
        favBtn.className = `btn btn-secondary btn-lg ${isFav ? 'active accent-text' : ''}`;
        favBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${isFav ? 'Favorited' : 'Add to Favs'}`;
        favBtn.onclick = () => {
            toggleFavoriteMatch(featured);
            const active = isMatchFavorited(featured.id);
            favBtn.classList.toggle('active', active);
            favBtn.classList.toggle('accent-text', active);
            favBtn.innerHTML = `<i class="${active ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${active ? 'Favorited' : 'Add to Favs'}`;
        };
    }
}

// ─────────────────────────────────────────────
// Stream Player
// ─────────────────────────────────────────────

/**
 * Load a match — if we already have sources (mock), use them directly.
 * Otherwise fetch detail from the API.
 */
async function loadMatchStream(match) {
    const playerSection = document.getElementById('player-section');
    const playerLoader  = document.getElementById('player-loader');
    const playerError   = document.getElementById('player-error');
    const iframe        = document.getElementById('stream-iframe');

    if (!playerSection) return;

    playerSection.classList.remove('hidden');
    refreshDynamicAds();
    playerLoader.classList.remove('hidden');
    playerError.classList.add('hidden');
    iframe.src = 'about:blank';
    iframe.style.display = 'none';
    playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        let detail;

        // If the match object already carries sources (mock data or previously fetched detail)
        if (match.sources && Array.isArray(match.sources) && match.sources.length > 0) {
            detail = normalizeMatchObject(match, match.category);
        } else {
            // Real API fetch
            if (AppState.usingMockData) {
                // Grab from mock store
                const mockCategory = AppState.isCustomFilter ? 'fight' : match.category;
                const store = MOCK_MATCHES[mockCategory] || buildDefaultMockMatch(mockCategory);
                detail = store.find(m => m.id === match.id) || store[0];
            } else {
                try {
                    const apiData = await apiRequest(
                        `api/detail?category=${encodeURIComponent(match.category)}&id=${encodeURIComponent(match.id)}`,
                        `?data=detail&category=${encodeURIComponent(match.category)}&id=${encodeURIComponent(match.id)}`
                    );
                    detail = normalizeMatchObject(apiData, match.category) || match;
                } catch (e) {
                    // Fallback to mock streams
                    const store = MOCK_MATCHES[match.category] || buildDefaultMockMatch(match.category);
                    detail = store.find(m => m.id === match.id) || { ...match, sources: store[0]?.sources || [] };
                }
            }
        }

        if (!detail || !detail.sources || detail.sources.length === 0) {
            throw new Error('No stream sources are available for this match right now.');
        }

        AppState.currentMatch   = detail;
        AppState.currentSources = detail.sources;

        renderPlayerControls();
        playSource(0);
        addToRecentlyWatched(detail);
        generateEventSchema(detail);

    } catch (err) {
        console.error('Stream load failed:', err);
        playerLoader.classList.add('hidden');
        playerError.classList.remove('hidden');
        const msgEl = document.getElementById('player-error-message');
        if (msgEl) msgEl.textContent = err.message || 'This stream is currently unavailable. Please try another source.';
    }
}

function renderPlayerControls() {
    const titleEl    = document.getElementById('player-stream-title');
    const catBadge   = document.getElementById('player-category-badge');
    const sourcesGrid = document.getElementById('stream-sources-grid');
    const favBtn     = document.getElementById('player-fav-btn');
    const match      = AppState.currentMatch;
    if (!match) return;

    const home = match.teams?.home?.name || '';
    const away = match.teams?.away?.name || '';
    if (titleEl)  titleEl.textContent  = home && away ? `${home} vs ${away}` : (match.title || 'Live Stream');
    if (catBadge) catBadge.textContent = (match.category || '').toUpperCase().replace(/-/g,' ');

    const isFav = isMatchFavorited(match.id);
    if (favBtn) {
        favBtn.className = `icon-btn-text ${isFav ? 'active' : ''}`;
        favBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${isFav ? 'Favorited' : 'Favorite'}`;
        favBtn.onclick = () => {
            toggleFavoriteMatch(match);
            const a = isMatchFavorited(match.id);
            favBtn.classList.toggle('active', a);
            favBtn.innerHTML = `<i class="${a ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${a ? 'Favorited' : 'Favorite'}`;
        };
    }

    if (sourcesGrid) {
        sourcesGrid.innerHTML = '';
        AppState.currentSources.forEach((src, idx) => {
            const btn = document.createElement('button');
            btn.className = 'source-btn';
            btn.dataset.index = idx;
            const quality = src.hd
                ? '<span class="badge-hd">HD</span>'
                : '<span class="badge" style="background:var(--text-muted);color:#000;padding:1px 4px;font-size:.6rem;border-radius:3px">SD</span>';
            const lang = src.language || 'English';
            btn.innerHTML = `<i class="fa-solid fa-play"></i> Source ${src.streamNo || (idx+1)} <span class="source-lang">${escHtml(lang)}</span> ${quality}`;
            btn.addEventListener('click', () => playSource(idx));
            sourcesGrid.appendChild(btn);
        });
    }
}

function playSource(index) {
    const iframe     = document.getElementById('stream-iframe');
    const loader     = document.getElementById('player-loader');
    const errorEl    = document.getElementById('player-error');
    const sourcesGrid = document.getElementById('stream-sources-grid');
    const viewersEl  = document.getElementById('stream-viewers');
    const langEl     = document.getElementById('stream-lang');
    const qualityEl  = document.getElementById('stream-quality-badge');

    if (!iframe || !AppState.currentSources[index]) return;

    AppState.selectedSourceIndex = index;
    const src = AppState.currentSources[index];

    // Highlight active source button
    if (sourcesGrid) {
        sourcesGrid.querySelectorAll('.source-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
    }

    // Update info bar
    if (viewersEl) viewersEl.textContent = Number(src.viewers || 0).toLocaleString();
    if (langEl)    langEl.textContent    = src.language || 'English';
    if (qualityEl) qualityEl.innerHTML   = src.hd
        ? '<span class="badge badge-hd">HD 1080p</span>'
        : '<span class="badge" style="background:var(--text-muted);padding:2px 6px;border-radius:3px;font-size:.7rem">SD 480p</span>';

    // Show spinner, hide iframe
    loader.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    iframe.style.display = 'none';

    // Extract URL if it's raw iframe HTML
    let url = src.embedUrl || '';
    if (url.trim().startsWith('<iframe')) {
        const m = url.match(/src=["'](.*?)["']/);
        url = m ? m[1] : '';
    }

    if (!url) {
        loader.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
        const msgEl = document.getElementById('player-error-message');
        if (msgEl) msgEl.textContent = 'This source has no valid stream URL.';
        return;
    }

    iframe.src = url;
    iframe.onload = () => {
        loader.classList.add('hidden');
        iframe.style.display = 'block';
    };
    // Safety timeout — if load event never fires
    const safety = setTimeout(() => {
        loader.classList.add('hidden');
        iframe.style.display = 'block';
    }, 8000);
    iframe.onload = () => {
        clearTimeout(safety);
        loader.classList.add('hidden');
        iframe.style.display = 'block';
    };
}

// ─────────────────────────────────────────────
// Favorites & Recently Watched
// ─────────────────────────────────────────────
function addToRecentlyWatched(matchDetail) {
    AppState.recentlyWatched = AppState.recentlyWatched.filter(m => m.id !== matchDetail.id);
    AppState.recentlyWatched.unshift({
        id: matchDetail.id, title: matchDetail.title,
        category: matchDetail.category, date: matchDetail.date,
        poster: matchDetail.poster, teams: matchDetail.teams,
        sources: matchDetail.sources, // preserve sources for instant replay
    });
    if (AppState.recentlyWatched.length > 8) AppState.recentlyWatched.pop();
    saveRecentlyWatched();
}

function renderRecentlyWatched() {
    const section = document.getElementById('recent-section');
    const track   = document.getElementById('recent-track');
    if (!section || !track) return;
    if (!AppState.recentlyWatched.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    track.innerHTML = '';
    AppState.recentlyWatched.forEach(m => track.appendChild(createMatchCard(m)));
}

function toggleFavoriteMatch(match) {
    const idx = AppState.favorites.findIndex(m => m.id === match.id);
    if (idx === -1) {
        AppState.favorites.push({
            id: match.id, title: match.title, category: match.category,
            date: match.date, poster: match.poster, teams: match.teams,
            sources: match.sources,
        });
    } else {
        AppState.favorites.splice(idx, 1);
    }
    saveFavorites();
}

function renderFavorites() {
    const section = document.getElementById('favorites-section');
    const track   = document.getElementById('favorites-track');
    if (!section || !track) return;
    if (!AppState.favorites.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    track.innerHTML = '';
    AppState.favorites.forEach(m => track.appendChild(createMatchCard(m)));
}

function updateFavoritesBadge() {
    const badge = document.getElementById('favorites-badge');
    if (!badge) return;
    badge.textContent = AppState.favorites.length;
    badge.style.display = AppState.favorites.length > 0 ? 'flex' : 'none';
}

function isMatchFavorited(id) {
    return AppState.favorites.some(m => m.id === id);
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────
function isMatchLive(tsMs) {
    const n = Date.now();
    return n >= tsMs && n <= tsMs + LIVE_WINDOW;
}

function getCountdownString(tsMs) {
    const diff = tsMs - Date.now();
    if (diff <= 0) return '00:00:00';
    const s  = Math.floor(diff / 1000)    % 60;
    const m  = Math.floor(diff / 60000)   % 60;
    const h  = Math.floor(diff / 3600000) % 24;
    const d  = Math.floor(diff / 86400000);
    const dStr = d > 0 ? `${d}d ` : '';
    return `${dStr}${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatMatchDate(ts) {
    const d    = new Date(ts);
    const tod  = new Date();
    const tom  = new Date(tod); tom.setDate(tod.getDate() + 1);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (d.toDateString() === tod.toDateString()) return `Today, ${time}`;
    if (d.toDateString() === tom.toDateString()) return `Tomorrow, ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
}

function startCountdownTimer() {
    if (AppState.countdownInterval) clearInterval(AppState.countdownInterval);
    AppState.countdownInterval = setInterval(() => {
        let needRefresh = false;
        document.querySelectorAll('[data-countdown]').forEach(el => {
            const t = Number(el.getAttribute('data-countdown'));
            if (t - Date.now() <= 0) {
                el.removeAttribute('data-countdown');
                el.innerHTML = '<i class="fa-solid fa-circle-dot"></i> LIVE';
                el.style.color = 'var(--accent-red)';
                needRefresh = true;
            } else {
                el.textContent = getCountdownString(t);
            }
        });
        if (needRefresh) { applyFilters(); buildHeroBanner(); }
    }, 1000);
}

// ─────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────
function setupEventHandlers() {
    // Search
    const searchInput    = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    let debounce;
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            AppState.searchQuery = e.target.value;
            if (clearSearchBtn) clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
            clearTimeout(debounce);
            debounce = setTimeout(applyFilters, 200);
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            AppState.searchQuery = '';
            clearSearchBtn.style.display = 'none';
            applyFilters();
        });
    }

    // Clear filter badge
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            AppState.searchQuery = '';
            if (clearSearchBtn) clearSearchBtn.style.display = 'none';
            applyFilters();
        });
    }

    // Favorites nav button
    const toggleFavsBtn = document.getElementById('toggle-favorites-btn');
    if (toggleFavsBtn) {
        toggleFavsBtn.addEventListener('click', () => {
            renderFavorites();
            const favSection = document.getElementById('favorites-section');
            if (favSection && !favSection.classList.contains('hidden')) {
                favSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // Close player
    const closePlayerBtn = document.getElementById('close-player-btn');
    if (closePlayerBtn) {
        closePlayerBtn.addEventListener('click', () => {
            const ps = document.getElementById('player-section');
            const fr = document.getElementById('stream-iframe');
            if (ps) ps.classList.add('hidden');
            if (fr) fr.src = 'about:blank';
            AppState.currentMatch   = null;
            AppState.currentSources = [];
        });
    }

    // Retry player
    const retryBtn = document.getElementById('player-retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (AppState.currentMatch) loadMatchStream(AppState.currentMatch);
        });
    }

    // Logo resets
    const logoBtn = document.getElementById('logo-btn');
    if (logoBtn) {
        logoBtn.addEventListener('click', e => {
            e.preventDefault();
            if (searchInput) { searchInput.value = ''; if (clearSearchBtn) clearSearchBtn.style.display = 'none'; }
            AppState.searchQuery = '';
            switchCategory('football');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Carousel arrows
    setupCarouselArrows('fav-prev',    'fav-next',    'favorites-track');
    setupCarouselArrows('recent-prev', 'recent-next', 'recent-track');

    // Footer category links
    document.querySelectorAll('.footer-cat-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const cat = link.getAttribute('data-cat');
            cat === 'fight' ? switchCustomCategory('mma','mma') : switchCategory(cat);
            document.getElementById('matches-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function setupCarouselArrows(prevId, nextId, trackId) {
    const prev  = document.getElementById(prevId);
    const next  = document.getElementById(nextId);
    const track = document.getElementById(trackId);
    if (!prev || !next || !track) return;
    prev.addEventListener('click', () => track.scrollBy({ left: -320, behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left:  320, behavior: 'smooth' }));
}

// ─────────────────────────────────────────────
// Skeleton / empty state helpers
// ─────────────────────────────────────────────
function showMatchesSkeleton(show) {
    const grid = document.getElementById('matches-grid');
    if (!grid) return;
    if (show) {
        grid.innerHTML = Array.from({ length: 8 }, () => `
            <div class="card-skeleton">
                <div class="skeleton-image"></div>
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
            </div>`).join('');
    }
}

function showEmptyState(show, title = '', msg = '', retry = false) {
    const es    = document.getElementById('empty-state');
    const grid  = document.getElementById('matches-grid');
    const tEl   = document.getElementById('empty-title');
    const mEl   = document.getElementById('empty-text');
    const rBtn  = document.getElementById('empty-retry-btn');
    const icon  = document.getElementById('empty-icon');
    if (!es || !grid) return;
    if (show) {
        grid.classList.add('hidden');
        es.classList.remove('hidden');
        if (tEl)  tEl.textContent  = title;
        if (mEl)  mEl.textContent  = msg;
        if (icon) icon.className   = title.toLowerCase().includes('error')
            ? 'fa-solid fa-circle-exclamation empty-icon'
            : 'fa-solid fa-circle-question empty-icon';
        if (rBtn) {
            rBtn.classList.toggle('hidden', !retry);
            rBtn.onclick = () => location.reload();
        }
    } else {
        grid.classList.remove('hidden');
        es.classList.add('hidden');
    }
}

// ─────────────────────────────────────────────
// SEO Schema
// ─────────────────────────────────────────────
function generateEventSchema(detail) {
    const el = document.getElementById('sports-schema');
    if (!el) return;
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: detail.title || `${detail.teams?.home?.name} vs ${detail.teams?.away?.name}`,
        startDate: new Date(detail.date).toISOString(),
        endDate:   new Date(detail.date + LIVE_WINDOW).toISOString(),
        sport: detail.category,
        homeTeam: { '@type': 'SportsTeam', name: detail.teams?.home?.name || 'Home', logo: detail.teams?.home?.badge || '' },
        awayTeam: { '@type': 'SportsTeam', name: detail.teams?.away?.name || 'Away', logo: detail.teams?.away?.badge || '' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', url: location.href },
    };
    el.textContent = JSON.stringify(schema, null, 2);
}

// ─────────────────────────────────────────────
// Ad Management System
// ─────────────────────────────────────────────

/**
 * Map of slot key (from ads_config.json) → DOM element ID in index.html
 */
const AD_SLOT_MAP = {
    ad_slot_hero_bottom:   'ad-slot-hero-bottom',
    ad_slot_player_top:    'ad-slot-player-top',
    ad_slot_player_bottom: 'ad-slot-player-bottom',
    ad_slot_content_mid:   'ad-slot-content-mid',
};

/** Cached config fetched from /api/ads */
let _adsConfig = null;

/**
 * Load ad configuration from the server (or use in-memory cache).
 * Falls back gracefully if the API is unavailable.
 */
async function loadAdsConfig() {
    try {
        const res = await fetch('/api/ads', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && json.data) {
            _adsConfig = json.data;
        }
    } catch (e) {
        console.warn('[Ads] Could not fetch /api/ads — ads disabled for this session:', e.message);
        _adsConfig = null;
    }
    return _adsConfig;
}

/**
 * Safely execute an ad code string inside a target container element.
 * Handles:
 *   - Raw <script> tags (Adsterra, Adcash, Monetag inline codes)
 *   - <ins> tags (Google AdSense)
 *   - Plain HTML (banners, image ads)
 *   - document.write shim (some older networks use this)
 * @param {HTMLElement} container  - The slot element to inject into
 * @param {string}      rawCode    - The raw ad HTML/JS string from admin
 */
function injectAdCode(container, rawCode) {
    if (!container || !rawCode || !rawCode.trim()) return;

    // Clear the existing placeholder content
    container.innerHTML = '';

    const tmp = document.createElement('div');
    tmp.innerHTML = rawCode.trim();

    // Collect script elements before we flatten the DOM
    const scripts = Array.from(tmp.querySelectorAll('script'));
    const nonScriptHtml = rawCode.replace(/<script[\s\S]*?<\/script>/gi, '').trim();

    // Inject non-script HTML first (ins tags, divs, iframes, etc.)
    if (nonScriptHtml) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ad-injected-content';
        wrapper.innerHTML = nonScriptHtml;
        container.appendChild(wrapper);
    }

    // Now re-create and append each script to actually run it
    scripts.forEach(originalScript => {
        const script = document.createElement('script');

        // Copy all attributes (type, async, data-*, etc.)
        Array.from(originalScript.attributes).forEach(attr => {
            script.setAttribute(attr.name, attr.value);
        });

        if (originalScript.src) {
            // External script (e.g. Adsterra //www.effectivegatetocontent.com/...)
            script.src = originalScript.src;
            script.async = true;
            script.onerror = () => console.warn('[Ads] External script failed to load:', script.src);
        } else {
            // Inline script — shim document.write to avoid page wipe
            const code = originalScript.textContent || originalScript.innerText || '';
            const shimmedCode = code.replace(/document\.write\s*\(/g, '__adDocWrite(container,');
            script.textContent = `
                (function(container) {
                    function __adDocWrite(c, html) {
                        var d = document.createElement('div');
                        d.innerHTML = html;
                        (c || document.currentScript.parentElement).appendChild(d);
                    }
                    ${shimmedCode}
                })(document.getElementById(${JSON.stringify(container.id)}));
            `;
        }

        container.appendChild(script);
    });

    // Trigger Google AdSense push if <ins> tags were injected
    const insEls = container.querySelectorAll('.adsbygoogle:not([data-ad-status])');
    if (insEls.length) {
        insEls.forEach(() => {
            try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (_) {}
        });
    }
}

/**
 * Inject a global script into the document <head> or <body>.
 * Avoids duplicate injection by checking a data attribute marker.
 * @param {'head'|'body'} target
 * @param {string}        rawCode
 * @param {string}        markerKey  - Unique marker to prevent re-injection
 */
function injectGlobalScript(target, rawCode, markerKey) {
    if (!rawCode || !rawCode.trim()) return;
    // Prevent double injection across navigation/refresh calls
    if (document.querySelector(`[data-ad-injected="${markerKey}"]`)) return;

    const container = target === 'head' ? document.head : document.body;
    const tmp = document.createElement('div');
    tmp.innerHTML = rawCode.trim();

    const scripts = Array.from(tmp.querySelectorAll('script'));

    scripts.forEach(originalScript => {
        const script = document.createElement('script');
        Array.from(originalScript.attributes).forEach(attr => {
            script.setAttribute(attr.name, attr.value);
        });
        if (originalScript.src) {
            script.src = originalScript.src;
            script.async = true;
        } else {
            script.textContent = originalScript.textContent;
        }
        script.dataset.adInjected = markerKey;
        container.appendChild(script);
    });

    // Inject any non-script HTML (e.g. noscript tags) into body
    const nonScriptHtml = rawCode.replace(/<script[\s\S]*?<\/script>/gi, '').trim();
    if (nonScriptHtml && target === 'body') {
        const div = document.createElement('div');
        div.dataset.adInjected = markerKey;
        div.innerHTML = nonScriptHtml;
        document.body.appendChild(div);
    }
}

/**
 * Apply network-specific optimisations based on the stored flags.
 * @param {object} opts - network_optimizations from ads_config.json
 */
function applyNetworkOptimizations(opts) {
    if (!opts) return;

    // Adsterra lazy-load: observe slots and load ads only when near viewport
    if (opts.adsterra_lazy_load) {
        const slots = document.querySelectorAll('.ad-slot');
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        window.dispatchEvent(new Event('resize'));
                        io.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '200px' });
            slots.forEach(s => io.observe(s));
        }
    }

    // Monetag anti-adblock: ensure their script re-initialises
    if (opts.monetag_anti_block && window.__monetag) {
        try { window.__monetag.recheck && window.__monetag.recheck(); } catch (_) {}
    }

    // Adcash: dispatch a custom event some Adcash autotag scripts listen for
    if (opts.adcash_bypass) {
        try { window.dispatchEvent(new CustomEvent('adcash:init')); } catch (_) {}
    }
}

/**
 * Main ad refresh entry point.
 * Fetches config (if not cached), injects ads into every configured slot,
 * injects global scripts, and applies network optimizations.
 * Safe to call multiple times (config cached, global scripts guarded by markers).
 */
async function refreshDynamicAds() {
    try {
        // Use cached config or fetch fresh
        const config = _adsConfig || await loadAdsConfig();
        if (!config) return; // API unavailable

        // ── Per-slot injection ──────────────────────────────────────
        Object.entries(AD_SLOT_MAP).forEach(([key, elId]) => {
            const slotEl  = document.getElementById(elId);
            const wrapper = slotEl?.parentElement;  // the .ad-slot-widget-wrapper
            const cfg     = config[key];
            if (!slotEl) return;

            if (!cfg || !cfg.enabled || !cfg.code?.trim()) {
                // Disabled or no code: keep native placeholder, hide outer wrapper if desired
                if (wrapper && wrapper.classList.contains('ad-slot-widget-wrapper')) {
                    wrapper.style.display = (!cfg || !cfg.enabled) ? 'none' : '';
                }
                return;
            }

            // Show the wrapper
            if (wrapper && wrapper.classList.contains('ad-slot-widget-wrapper')) {
                wrapper.style.display = '';
            }

            // Only inject once per slot (guard against multiple calls)
            if (slotEl.dataset.adLoaded === '1') return;
            slotEl.dataset.adLoaded = '1';

            injectAdCode(slotEl, cfg.code);
        });

        // ── Global <head> inject (Monetag Smart Tag, etc.) ─────────
        if (config.global_head_inject?.enabled && config.global_head_inject?.code?.trim()) {
            injectGlobalScript('head', config.global_head_inject.code, 'global-head');
        }

        // ── Global <body> inject (Adsterra Popunder, Adcash Autotag) ─
        if (config.global_body_inject?.enabled && config.global_body_inject?.code?.trim()) {
            injectGlobalScript('body', config.global_body_inject.code, 'global-body');
        }

        // ── Network-specific optimizations ─────────────────────────
        applyNetworkOptimizations(config.network_optimizations);

        // Generic resize dispatch for any remaining ad scripts
        window.dispatchEvent(new Event('resize'));

    } catch (e) {
        console.warn('[Ads] Error during ad refresh:', e.message);
    }
}

