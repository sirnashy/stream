const fs = require('fs');
const path = require('path');

/**
 * A robust, zero-dependency, pure JavaScript file-backed database layer.
 * Uses atomic writes (temp file + rename) to prevent file corruption
 * and maintains automatic backup files.
 */
class JsonDatabase {
    constructor(filePath, defaults = {}) {
        this.filePath = path.resolve(filePath);
        this.backupPath = this.filePath.replace(/\.json$/, '.backup.json');
        this.defaults = defaults;
        this.cache = {};
        
        this.init();
    }

    /**
     * Initializes the database connection and loads configurations.
     */
    init() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                this.cache = JSON.parse(raw);
                console.log('[JsonDatabase] Loaded configurations from file.');
            } else if (fs.existsSync(this.backupPath)) {
                console.warn('[JsonDatabase] Primary file missing, restoring from backup...');
                const raw = fs.readFileSync(this.backupPath, 'utf8');
                this.cache = JSON.parse(raw);
                this.saveSync(this.cache); // Restore primary file
            } else {
                console.log('[JsonDatabase] No database files found. Seeding defaults...');
                this.cache = { ...this.defaults };
                this.saveSync(this.cache);
            }
        } catch (e) {
            console.error('[JsonDatabase] Failed to read database, attempting fallback:', e.message);
            try {
                if (fs.existsSync(this.backupPath)) {
                    const raw = fs.readFileSync(this.backupPath, 'utf8');
                    this.cache = JSON.parse(raw);
                    console.log('[JsonDatabase] Successfully recovered config from backup.');
                } else {
                    this.cache = { ...this.defaults };
                }
            } catch (_) {
                this.cache = { ...this.defaults };
            }
        }
    }

    /**
     * Retrieves the entire cached database object.
     */
    getAll() {
        // Deep clone to prevent direct modification of database cache outside
        return JSON.parse(JSON.stringify({ ...this.defaults, ...this.cache }));
    }

    /**
     * Synchronously commits the updated configuration to disk atomically.
     * @param {object} config - Entire database configuration payload
     */
    saveSync(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid database payload');
        }

        const cleanConfig = JSON.parse(JSON.stringify(config));
        const dataStr = JSON.stringify(cleanConfig, null, 2);
        const tempPath = `${this.filePath}.tmp`;

        try {
            // Write to temporary file
            fs.writeFileSync(tempPath, dataStr, 'utf8');
            
            // Atomically rename temporary file to primary file
            fs.renameSync(tempPath, this.filePath);
            
            // Update cache in memory
            this.cache = cleanConfig;

            // Update backup file
            try {
                fs.writeFileSync(this.backupPath, dataStr, 'utf8');
            } catch (backupError) {
                console.error('[JsonDatabase] Failed to write backup file:', backupError.message);
            }

            console.log('[JsonDatabase] Configuration saved and synchronized successfully.');
            return true;
        } catch (e) {
            console.error('[JsonDatabase] Atomic write failed:', e.message);
            // Clean up temporary file
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (_) {}
            }
            throw e;
        }
    }
}

module.exports = JsonDatabase;
