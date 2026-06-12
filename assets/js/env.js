/**
 * Runtime environment adapter
 * Detects the app base path and proxy path when hosted under a subfolder.
 */
(function () {
    const pathname = location.pathname;
    const hasFilename = /\.[a-zA-Z0-9]+$/.test(pathname);
    const basePath = hasFilename ? pathname.replace(/\/[^\/]*$/, '/') : pathname;
    const normalizedBase = basePath === '' ? '/' : basePath;

    window.APP_BASE_PATH = normalizedBase;
    window.API_PROXY_PREFIX = `${normalizedBase}api`.replace(/\/\/+/, '/');
    window.DIRECT_API_BASE = 'https://api.sportsrc.org/';
    window.IS_HOSTED = location.protocol.startsWith('http');
})();
