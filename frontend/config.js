(() => {
    const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
    const LOCAL_STORAGE_KEY = "policyApp.apiBaseUrl";

    const normalize = (value) => {
        if (typeof value !== "string") {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        try {
            const url = new URL(trimmed);
            if (!["http:", "https:"].includes(url.protocol)) {
                return null;
            }
            return `${url.origin}${url.pathname.replace(/\/+$/, "")}` || url.origin;
        } catch (error) {
            return null;
        }
    };

    const readFromQuery = () => {
        const params = new URLSearchParams(window.location.search);
        const override = params.get("apiBaseUrl");
        return normalize(override);
    };

    const readFromMeta = () => {
        const meta = document.querySelector('meta[name="api-base-url"]');
        if (!meta) {
            return null;
        }
        return normalize(meta.getAttribute("content") || "");
    };

    const readFromGlobal = () => {
        const candidates = [
            window.__APP_CONFIG__?.apiBaseUrl,
            window.__APP_CONFIG__?.api_base_url,
            window.__APP_ENV__?.API_BASE_URL,
            window.__API_BASE_URL__,
        ];
        for (const candidate of candidates) {
            const normalized = normalize(candidate);
            if (normalized) {
                return normalized;
            }
        }
        return null;
    };

    const readFromStorage = () => {
        try {
            const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
            return normalize(stored);
        } catch (error) {
            return null;
        }
    };

    const persistToStorage = (value) => {
        try {
            if (value) {
                window.localStorage.setItem(LOCAL_STORAGE_KEY, value);
            } else {
                window.localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        } catch (error) {
            // no-op
        }
    };

    const resolve = () => {
        const fromQuery = readFromQuery();
        if (fromQuery) {
            persistToStorage(fromQuery);
            return fromQuery;
        }

        const fromGlobal = readFromGlobal();
        if (fromGlobal) {
            persistToStorage(fromGlobal);
            return fromGlobal;
        }

        const fromStorage = readFromStorage();
        if (fromStorage) {
            return fromStorage;
        }

        const fromMeta = readFromMeta();
        if (fromMeta) {
            persistToStorage(fromMeta);
            return fromMeta;
        }

        persistToStorage(DEFAULT_API_BASE_URL);
        return DEFAULT_API_BASE_URL;
    };

    const apiBaseUrl = resolve();

    window.__APP_RUNTIME_CONFIG__ = Object.freeze({
        apiBaseUrl,
        defaults: {
            apiBaseUrl: DEFAULT_API_BASE_URL,
        },
    });

    window.getApiBaseUrl = () => window.__APP_RUNTIME_CONFIG__.apiBaseUrl;
})();
