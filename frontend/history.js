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
        this.loginModalBackdrop = null;
        this.loginForm = null;
        this.loginBtn = null;
        this.logoutBtn = null;
        this.loginStatusLabel = null;
        this.currentUser = null;
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
            this.renderHistory(historyItems);
            this.setStatus('');
            if (!historyItems.length) {
                this.setStatus('保存されたログはまだありません');
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
            const message = this.currentUser
                ? '保存されたログはまだありません'
                : 'ログインすると分析ログが表示されます';
            this.historyListEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>${message}</p>
                </div>
            `;
            return;
        }

        this.historyListEl.innerHTML = items
            .map((item) => this.renderHistoryCard(item))
            .join('');

        const cards = Array.from(this.historyListEl.querySelectorAll('.history-card'));
        cards.forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('a, button')) {
                    return;
                }
                const wasExpanded = card.classList.contains('expanded');
                cards.forEach((other) => other.classList.remove('expanded'));
                if (!wasExpanded) {
                    card.classList.add('expanded');
                }
            });
        });

        this.historyListEl.querySelectorAll('.history-delete').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const card = button.closest('.history-card');
                const historyId = Number(card?.dataset.historyId);
                if (!historyId) {
                    this.showToast('ログIDの取得に失敗しました', 'error');
                    return;
                }
                const confirmed = window.confirm('選択したログを削除します。よろしいですか？');
                if (!confirmed) {
                    return;
                }
                this.deleteHistory(historyId, card);
            });
        });

        this.historyListEl.querySelectorAll('.history-open-option').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const optionId = Number(button.dataset.optionId);
                if (!Number.isFinite(optionId)) {
                    this.showToast('紐づく案の情報を取得できませんでした', 'error');
                    return;
                }
                window.location.href = `index.html?optionId=${optionId}`;
            });
        });

        const firstCard = this.historyListEl.querySelector('.history-card');
        if (firstCard) {
            firstCard.classList.add('expanded');
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
