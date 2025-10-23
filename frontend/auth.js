(() => {
    class AuthManager {
        constructor(apiBaseUrl) {
            this.apiBaseUrl = apiBaseUrl;
            this.tokenStorageKey = "policyApp.accessToken";
            this.userStorageKey = "policyApp.currentUser";
            this.token = this._loadFromStorage(this.tokenStorageKey);
            this.user = this._loadUserFromStorage();
        }

        setApiBaseUrl(apiBaseUrl) {
            this.apiBaseUrl = apiBaseUrl;
        }

        _loadFromStorage(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (error) {
                console.warn("[auth] Failed to read localStorage", error);
                return null;
            }
        }

        _loadUserFromStorage() {
            const raw = this._loadFromStorage(this.userStorageKey);
            if (!raw) {
                return null;
            }
            try {
                return JSON.parse(raw);
            } catch (error) {
                console.warn("[auth] Failed to parse stored user", error);
                return null;
            }
        }

        _saveToStorage(key, value) {
            try {
                if (value === null || value === undefined) {
                    window.localStorage.removeItem(key);
                } else {
                    window.localStorage.setItem(key, value);
                }
            } catch (error) {
                console.warn("[auth] Failed to write localStorage", error);
            }
        }

        _persistAuthState() {
            this._saveToStorage(this.tokenStorageKey, this.token);
            this._saveToStorage(
                this.userStorageKey,
                this.user ? JSON.stringify(this.user) : null,
            );
        }

        _notifyAuthChange() {
            window.dispatchEvent(
                new CustomEvent("auth:change", {
                    detail: { token: this.token, user: this.user },
                }),
            );
        }

        isAuthenticated() {
            return Boolean(this.token && this.user);
        }

        getToken() {
            return this.token;
        }

        getUser() {
            return this.user;
        }

        async register(payload) {
            const response = await fetch(`${this.apiBaseUrl}/api/v1/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "Failed to register");
            }
            const data = await response.json();
            this._setAuthData(data.access_token, data.user);
            return data.user;
        }

        async login(email, password) {
            const response = await fetch(`${this.apiBaseUrl}/api/v1/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "ログインに失敗しました");
            }
            const data = await response.json();
            this._setAuthData(data.access_token, data.user);
            return data.user;
        }

        async fetchCurrentUser() {
            if (!this.token) {
                return null;
            }
            const response = await this.authorizedFetch(
                `${this.apiBaseUrl}/api/v1/auth/me`,
            );
            if (!response.ok) {
                this.clearAuth();
                return null;
            }
            const user = await response.json();
            this._setAuthData(this.token, user);
            return user;
        }

        async authorizedFetch(input, init = {}) {
            const config = { ...init };
            config.headers = new Headers(init.headers || {});

            if (this.token) {
                config.headers.set("Authorization", `Bearer ${this.token}`);
            }

            const response = await fetch(input, config);
            if (response.status === 401) {
                this.clearAuth();
            }
            return response;
        }

        logout() {
            this.clearAuth();
        }

        clearAuth() {
            this.token = null;
            this.user = null;
            this._persistAuthState();
            this._notifyAuthChange();
        }

        _setAuthData(token, user) {
            this.token = token;
            this.user = user;
            this._persistAuthState();
            this._notifyAuthChange();
        }
    }

    window.AuthManager = AuthManager;
})();
