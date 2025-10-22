(() => {
    const detectDefaultBaseUrl = () => {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const hostname = window.location.hostname || "127.0.0.1";
        const defaultPort =
            protocol === "https:"
                ? window.location.port || ""
                : "8000";
        try {
            const url = new URL(`${protocol}//${hostname || "127.0.0.1"}`);
            if (defaultPort) {
                url.port = defaultPort;
            }
            return url.toString().replace(/\/$/, "");
        } catch (error) {
            return "http://127.0.0.1:8000";
        }
    };

    const DEFAULT_API_BASE_URL = detectDefaultBaseUrl();
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
            const normalizedPath = url.pathname.replace(/\/+$/, "");
            return normalizedPath ? `${url.origin}${normalizedPath}` : url.origin;
        } catch (error) {
            return null;
        }
    };

    const readFromQuery = () => {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get("apiBaseUrl");
        if (!raw) {
            return { action: "none" };
        }
        const lowered = raw.toLowerCase();
        if (["reset", "clear", "default"].includes(lowered)) {
            return { action: "reset" };
        }
        const normalized = normalize(raw);
        if (!normalized) {
            return { action: "none" };
        }
        return { action: "set", value: normalized };
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

    const cleanupQueryParam = () => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has("apiBaseUrl")) {
                url.searchParams.delete("apiBaseUrl");
                const cleaned = url.search ? url.toString() : `${url.origin}${url.pathname}${url.hash}`;
                window.history.replaceState({}, document.title, cleaned);
            }
        } catch (error) {
            // no-op
        }
    };

    const resolve = () => {
        const query = readFromQuery();
        if (query.action === "reset") {
            persistToStorage(null);
            cleanupQueryParam();
        } else if (query.action === "set" && query.value) {
            persistToStorage(query.value);
            cleanupQueryParam();
            return query.value;
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

    const runtimeConfig = {
        apiBaseUrl: resolve(),
        defaults: {
            apiBaseUrl: DEFAULT_API_BASE_URL,
        },
        set(newValue) {
            const normalized = normalize(newValue);
            if (!normalized) {
                return null;
            }
            persistToStorage(normalized);
            this.apiBaseUrl = normalized;
            console.info(`[config] API base URL updated to ${normalized}`);
            return normalized;
        },
        reset() {
            persistToStorage(null);
            this.apiBaseUrl = DEFAULT_API_BASE_URL;
            console.info("[config] API base URL reset to default");
            return this.apiBaseUrl;
        },
    };

    window.__APP_RUNTIME_CONFIG__ = runtimeConfig;

    window.getApiBaseUrl = () => runtimeConfig.apiBaseUrl;
    window.setApiBaseUrl = (value) => runtimeConfig.set(value);
    window.resetApiBaseUrl = () => runtimeConfig.reset();

    console.info(`[config] API base URL resolved to ${runtimeConfig.apiBaseUrl}`);
})();
