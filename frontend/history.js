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
        this.apiBaseUrl = 'http://127.0.0.1:8001';
        this.historyListEl = document.getElementById('historyList');
        this.statusEl = document.getElementById('historyStatus');
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadHistory();
    }

    bindEvents() {
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }
    }

    async loadHistory() {
        this.setStatus('読み込み中...');
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/v1/history`);
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
            this.historyListEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>保存されたログはまだありません</p>
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
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/v1/history/${historyId}`, {
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
