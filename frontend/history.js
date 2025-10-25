function buildRsSystemUrl(project) {
    if (!project || typeof project !== 'object') {
        return null;
    }

    const rawId = Object.prototype.hasOwnProperty.call(project, 'project_id')
        ? project.project_id
        : project.projectId;

    if (rawId === undefined || rawId === null) {
        return null;
    }

    const idText = String(rawId).trim();
    if (!idText || idText.toLowerCase() === 'nan') {
        return null;
    }

    return `https://rssystem.go.jp/project?projectNumbers=${encodeURIComponent(idText)}`;
}

class HistoryPage {
    constructor() {
        const fallbackBaseUrl = "http://127.0.0.1:8000";
        const resolveBaseUrl =
            typeof window !== "undefined" && typeof window.getApiBaseUrl === "function"
                ? window.getApiBaseUrl
                : () => fallbackBaseUrl;
        const resolvedBaseUrl = resolveBaseUrl() || fallbackBaseUrl;

        this.authManager = typeof AuthManager === "function" ? new AuthManager(resolvedBaseUrl) : null;
        this.apiBaseUrl = resolvedBaseUrl;
        if (this.authManager) {
            this.authManager.setApiBaseUrl(this.apiBaseUrl);
        }
        console.info(`[history] Using API base URL: ${this.apiBaseUrl}`);
        this.historyListEl = document.getElementById('historyList');
        this.statusEl = document.getElementById('historyStatus');
        this.detailEl = document.getElementById('historyDetail');
        this.detailPlaceholderEl = document.getElementById('historyDetailPlaceholder');
        this.items = [];
        this.visibleCount = 5;
        this.loadMoreStep = 5;
        this.selectedId = null;
        this.loginModalBackdrop = null;
        this.loginForm = null;
        this.loginBtn = null;
        this.logoutBtn = null;
        this.loginStatusLabel = null;
        this.currentUser = null;
        this.loadMoreBtn = null;
        this.init();
    }

    init() {
        this.bindEvents();
        if (this.authManager) {
            this.initializeAuthState();
        } else {
            this.loadHistory();
        }
    }

    bindEvents() {
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }

        this.loginModalBackdrop = document.getElementById('loginModalBackdrop');
        this.loginForm = document.getElementById('loginForm');
        this.loginBtn = document.getElementById('loginBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.loginStatusLabel = document.getElementById('loginStatus');
        this.loadMoreBtn = document.getElementById('historyLoadMoreBtn');

        const loginModalClose = document.getElementById('loginModalClose');

        if (this.authManager && this.loginBtn) {
            this.loginBtn.addEventListener('click', () => {
                this.openLoginModal();
            });
        }

        if (this.authManager && this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }

        if (loginModalClose) {
            loginModalClose.addEventListener('click', () => {
                this.closeLoginModal();
            });
        }

        if (this.loginModalBackdrop) {
            this.loginModalBackdrop.addEventListener('click', (event) => {
                if (event.target === this.loginModalBackdrop) {
                    this.closeLoginModal();
                }
            });
        }

        if (this.authManager && this.loginForm) {
            this.loginForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleLoginSubmit();
            });
        }

        if (this.loadMoreBtn) {
            this.loadMoreBtn.addEventListener('click', () => {
                this.visibleCount += this.loadMoreStep;
                this.renderHistory(this.items);
            });
        }

        if (this.authManager) {
            window.addEventListener('auth:change', (event) => {
                const detail = event.detail || {};
                this.applyAuthState(detail.user || null);
                if (detail.user) {
                    this.loadHistory();
                } else {
                    this.renderHistory([]);
                    this.setStatus('ログインすると分析ログを表示できます');
                }
            });
        }
    }

    async initializeAuthState() {
        if (!this.authManager) {
            return;
        }
        try {
            const user = await this.authManager.fetchCurrentUser();
            if (user) {
                this.applyAuthState(user);
                await this.loadHistory();
            } else {
                this.applyAuthState(null);
                this.renderHistory([]);
                this.setStatus('ログインすると分析ログを表示できます');
            }
        } catch (error) {
            console.warn('[history] Failed to initialize auth', error);
            this.applyAuthState(null);
            this.renderHistory([]);
            this.setStatus('ログインすると分析ログを表示できます');
        }
    }

    applyAuthState(user) {
        this.currentUser = user;
        if (user) {
            if (this.loginStatusLabel) {
                this.loginStatusLabel.textContent = `${user.email} (${user.role})`;
            }
            if (this.loginBtn) {
                this.loginBtn.style.display = 'none';
            }
            if (this.logoutBtn) {
                this.logoutBtn.style.display = 'inline-flex';
            }
        } else {
            if (this.loginStatusLabel) {
                this.loginStatusLabel.textContent = '未ログイン';
            }
            if (this.loginBtn) {
                this.loginBtn.style.display = 'inline-flex';
            }
            if (this.logoutBtn) {
                this.logoutBtn.style.display = 'none';
            }
        }
    }

    openLoginModal() {
        if (!this.loginModalBackdrop) {
            return;
        }
        this.loginModalBackdrop.classList.remove('hidden');
        this.loginModalBackdrop.setAttribute('aria-hidden', 'false');
        const emailInput = document.getElementById('loginEmail');
        if (emailInput) {
            setTimeout(() => emailInput.focus(), 50);
        }
    }

    closeLoginModal() {
        if (!this.loginModalBackdrop) {
            return;
        }
        this.loginModalBackdrop.classList.add('hidden');
        this.loginModalBackdrop.setAttribute('aria-hidden', 'true');
        if (this.loginForm) {
            this.loginForm.reset();
        }
    }

    async handleLoginSubmit() {
        if (!this.authManager || !this.loginForm) {
            return;
        }
        const formData = new FormData(this.loginForm);
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '');
        if (!email || !password) {
            this.showToast('メールアドレスとパスワードを入力してください', 'error');
            return;
        }
        try {
            const user = await this.authManager.login(email, password);
            this.applyAuthState(user);
            this.showToast('ログインしました', 'success');
            this.closeLoginModal();
            await this.loadHistory();
        } catch (error) {
            console.error('[history] login error', error);
            this.showToast('ログインに失敗しました。入力内容をご確認ください。', 'error');
        }
    }

    handleLogout() {
        if (!this.authManager) {
            return;
        }
        this.authManager.logout();
        this.applyAuthState(null);
        this.renderHistory([]);
        this.setStatus('ログインすると分析ログを表示できます');
        this.showToast('ログアウトしました', 'info');
    }

    async authFetch(url, options = {}) {
        if (!this.authManager) {
            return fetch(url, options);
        }
        const response = await this.authManager.authorizedFetch(url, options);
        if (response.status === 401) {
            this.showToast('ログインが必要です', 'error');
            this.openLoginModal();
            throw new Error('Unauthorized');
        }
        return response;
    }

    async loadHistory() {
        if (this.authManager && !this.currentUser) {
            this.renderHistory([]);
            this.setStatus('ログインすると分析ログを表示できます');
            return;
        }
        this.setStatus('読み込み中...');
        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/history`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const historyItems = await response.json();
            this.items = Array.isArray(historyItems) ? historyItems : [];
            this.visibleCount = 5; // 初期表示は5件
            this.renderHistory(this.items);
            this.setStatus('');
            if (this.items.length) {
                this.selectHistory(this.items[0].id);
            } else {
                this.setStatus('保存されたログはまだありません');
                this.showDetailPlaceholder(true);
            }
        } catch (error) {
            console.error('ログの取得に失敗しました:', error);
            this.setStatus('ログの取得に失敗しました。時間を置いて再試行してください。');
            this.showToast(error.message || 'ログの取得に失敗しました', 'error');
        }
    }

    setStatus(message) {
        if (!this.statusEl) {
            return;
        }
        if (message) {
            this.statusEl.textContent = message;
            this.statusEl.style.display = 'block';
        } else {
            this.statusEl.textContent = '';
            this.statusEl.style.display = 'none';
        }
    }

    renderHistory(items) {
        if (!this.historyListEl) {
            return;
        }

        if (!Array.isArray(items) || items.length === 0) {
            this.historyListEl.innerHTML = '';
            this.updateLoadMoreVisibility();
            return;
        }

        const visibleItems = items.slice(0, Math.max(0, this.visibleCount || 0));
        this.historyListEl.innerHTML = visibleItems
            .map((item) => {
                const title = this.sanitize(item.projectName) || '名称未設定';
                const date = this.formatDate(item.createdAt);
                const selected = item.id === this.selectedId ? 'is-selected' : '';
                return `
                    <li class="history-item ${selected}" data-id="${item.id}">
                        <span class="title" title="${title}">${title}</span>
                        <span class="date">${date}</span>
                    </li>
                `;
            })
            .join('');

        this.historyListEl.querySelectorAll('.history-item').forEach((el) => {
            el.addEventListener('click', () => {
                const id = Number(el.dataset.id);
                if (Number.isFinite(id)) this.selectHistory(id);
            });
        });

        this.updateLoadMoreVisibility();
    }

    updateLoadMoreVisibility() {
        if (!this.loadMoreBtn) return;
        const total = Array.isArray(this.items) ? this.items.length : 0;
        const visible = Math.max(0, this.visibleCount || 0);
        const remaining = Math.max(0, total - visible);
        if (remaining > 0) {
            this.loadMoreBtn.style.display = 'inline-flex';
            this.loadMoreBtn.textContent = `もっと見る（残り${remaining}件）`;
        } else {
            this.loadMoreBtn.style.display = 'none';
        }
    }

    showDetailPlaceholder(visible) {
        if (!this.detailEl || !this.detailPlaceholderEl) return;
        this.detailPlaceholderEl.style.display = visible ? 'block' : 'none';
        this.detailEl.style.display = visible ? 'none' : 'block';
        if (visible) this.detailEl.innerHTML = '';
    }

    selectHistory(id) {
        this.selectedId = id;
        if (this.historyListEl) {
            this.historyListEl.querySelectorAll('.history-item').forEach((el) => {
                el.classList.toggle('is-selected', Number(el.dataset.id) === id);
            });
        }
        const item = (this.items || []).find((x) => x.id === id);
        if (item) {
            this.renderHistoryDetail(item);
            this.showDetailPlaceholder(false);
        } else {
            this.showDetailPlaceholder(true);
        }
    }

    renderHistoryDetail(item) {
        if (!this.detailEl) return;
        const projectName = this.sanitize(item.projectName) || '名称未設定';
        const createdAt = this.formatDate(item.createdAt);
        const currentSituation = this.formatMultiline(item.currentSituation || '---');
        const projectOverview = this.formatMultiline(item.projectOverview || '---');
        const initialBudget = this.formatCurrency(item.initialBudget);
        const estimatedBudget = this.formatCurrency(item.estimatedBudget);
        const references = Array.isArray(item.references) ? item.references : [];
        const referenceList = references
            .map((ref, index) => {
                const name = this.sanitize(ref.project_name || `類似事業 ${index + 1}`);
                const ministry = this.sanitize(ref.ministry_name || '所属不明');
                const similarity = typeof ref.similarity === 'number' ? ref.similarity.toFixed(3) : '---';
                const rsSystemUrl = buildRsSystemUrl(ref);
                const rsLink = rsSystemUrl
                    ? this.createLink(rsSystemUrl, 'RSシステム')
                    : '<span class="link-unavailable">RSリンクなし</span>';
                return `
                    <li>
                        <div class="reference-header">
                            <span class="reference-name">${name}</span>
                            <span class="reference-meta">類似度: ${similarity}</span>
                        </div>
                        <div class="reference-body">
                            <span>府省庁: ${ministry}</span>
                            <span>RS: ${rsLink}</span>
                        </div>
                    </li>
                `;
            })
            .join('');
        const linkedOptionId = Number(item.linkedOptionId);
        const openOptionBtn = Number.isFinite(linkedOptionId) && linkedOptionId > 0
            ? `<button class="btn btn-secondary" id="openLinkedOption"><i class="fas fa-external-link-alt"></i> 案を開く</button>`
            : '';
        const deleteBtn = `<button class="btn btn-outline" id="deleteHistory"><i class="fas fa-trash"></i> このログを削除</button>`;

        this.detailEl.innerHTML = `
            <header class="detail-row">
                <h3 style="margin:0">${projectName}</h3>
                <p class="muted">作成日時: ${createdAt}</p>
            </header>
            <div class="detail-row"><strong>入力当初予算:</strong><p>${initialBudget}</p></div>
            <div class="detail-row"><strong>推定予算:</strong><p>${estimatedBudget}</p></div>
            <div class="detail-row"><strong>現状・目的:</strong><p>${currentSituation}</p></div>
            <div class="detail-row"><strong>事業概要:</strong><p>${projectOverview}</p></div>
            <div class="detail-row"><strong>類似事業:</strong>${references.length ? `<ul class="reference-list">${referenceList}</ul>` : '<p>ログに類似事業情報はありません</p>'}</div>
            <div class="detail-row" style="display:flex; gap:.5rem">${openOptionBtn}${deleteBtn}</div>
        `;

        const del = document.getElementById('deleteHistory');
        if (del) {
            del.addEventListener('click', async () => {
                const ok = window.confirm('このログを削除します。よろしいですか？');
                if (!ok) return;
                const listItem = this.historyListEl?.querySelector(`.history-item[data-id="${item.id}"]`);
                await this.deleteHistory(item.id, listItem?.parentElement);
                this.items = (this.items || []).filter((x) => x.id !== item.id);
                this.renderHistory(this.items);
                if (this.items.length) this.selectHistory(this.items[0].id);
                else this.showDetailPlaceholder(true);
            });
        }
        const openBtn = document.getElementById('openLinkedOption');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                window.location.href = `index.html?optionId=${linkedOptionId}`;
            });
        }
    }

    renderHistoryCard(item) {
        const projectName = this.sanitize(item.projectName) || '名称未設定';
        const linkedOptionId = Number(item.linkedOptionId);
        const hasLinkedOption = Number.isFinite(linkedOptionId) && linkedOptionId > 0;
        const createdAt = this.formatDate(item.createdAt);
        const currentSituation = this.formatMultiline(item.currentSituation || '---');
        const projectOverview = this.formatMultiline(item.projectOverview || '---');
        const initialBudget = this.formatCurrency(item.initialBudget);
        const estimatedBudget = this.formatCurrency(item.estimatedBudget);
        const references = Array.isArray(item.references) ? item.references : [];
        const referenceCount = references.length;
        const referenceList = references
            .map((ref, index) => {
                const name = this.sanitize(ref.project_name || `類似事業 ${index + 1}`);
                const ministry = this.sanitize(ref.ministry_name || '所属不明');
                const similarity = typeof ref.similarity === 'number' ? ref.similarity.toFixed(3) : '---';
                const url = this.createLink(ref.project_url);
                const rsSystemUrl = buildRsSystemUrl(ref);
                const rsLink = rsSystemUrl
                    ? this.createLink(rsSystemUrl, 'RSシステム')
                    : '<span class="link-unavailable">RSリンクなし</span>';
                return `
                    <li>
                        <div class="reference-header">
                            <span class="reference-name">${name}</span>
                            <span class="reference-meta">類似度: ${similarity}</span>
                        </div>
                        <div class="reference-body">
                            <span>府省庁: ${ministry}</span>
                            <span>URL: ${url}</span>
                            <span>RS: ${rsLink}</span>
                        </div>
                    </li>
                `;
            })
            .join('');

        const optionBadge = hasLinkedOption ? '<span class="history-badge">案の検討あり</span>' : '';
        const openButton = hasLinkedOption
            ? `<button class="history-open-option" type="button" data-option-id="${linkedOptionId}" aria-label="検討状況を開く">
                    <i class="fas fa-external-link-alt"></i>
               </button>`
            : '';

        return `
            <div class="history-card" data-history-id="${item.id}" ${hasLinkedOption ? `data-option-id="${linkedOptionId}"` : ''}>
                <div class="history-card-header">
                    <div>
                        <h3>${projectName} ${optionBadge}</h3>
                        <p class="history-meta">作成日時: ${createdAt} / 類似事業: ${referenceCount}件</p>
                    </div>
                    <div class="history-header-actions">
                        ${openButton}
                        <button class="history-delete" type="button" aria-label="ログを削除">
                            <i class="fas fa-trash"></i>
                        </button>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                <div class="history-card-body">
                    <div class="detail-row">
                        <strong>入力当初予算:</strong>
                        <p>${initialBudget}</p>
                    </div>
                    <div class="detail-row">
                        <strong>推定予算:</strong>
                        <p>${estimatedBudget}</p>
                    </div>
                    <div class="detail-row">
                        <strong>現状・目的:</strong>
                        <p>${currentSituation}</p>
                    </div>
                    <div class="detail-row">
                        <strong>事業概要:</strong>
                        <p>${projectOverview}</p>
                    </div>
                    <div class="detail-row">
                        <strong>類似事業:</strong>
                        ${referenceCount ? `<ul class="reference-list">${referenceList}</ul>` : '<p>ログに類似事業情報はありません</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    sanitize(value) {
        if (typeof value !== 'string') {
            return '';
        }
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return value.replace(/[&<>"']/g, (char) => map[char]);
    }

    formatMultiline(text) {
        return this.sanitize(text).replace(/\n/g, '<br>');
    }

    formatDate(value) {
        if (!value) {
            return '---';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return this.sanitize(value);
        }
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ` +
            `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    formatCurrency(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '---';
        }
        return `¥${Math.round(value).toLocaleString('ja-JP')}`;
    }

    createLink(url, label = null) {
        if (!url || typeof url !== 'string') {
            return 'リンクなし';
        }
        const trimmed = url.trim();
        if (!trimmed || trimmed.toLowerCase() === 'nan') {
            return 'リンクなし';
        }
        const escaped = this.sanitize(trimmed);
        const linkText = label !== null ? this.sanitize(label) : escaped;
        if (/^https?:\/\//i.test(trimmed)) {
            return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        }
        return label !== null ? linkText : escaped;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) {
            console.warn('Toastコンテナが見つかりません:', message);
            return;
        }
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    async deleteHistory(historyId, cardElement) {
        if (this.authManager && !this.currentUser) {
            this.showToast('ログインが必要です', 'error');
            this.openLoginModal();
            return;
        }
        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/history/${historyId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            cardElement?.remove();
            this.showToast(`ログID ${historyId} を削除しました`, 'success');

            if (!this.historyListEl || this.historyListEl.children.length === 0) {
                this.renderHistory([]);
            }
        } catch (error) {
            console.error('ログの削除に失敗しました:', error);
            this.showToast(error.message || 'ログの削除に失敗しました', 'error');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HistoryPage();
});
