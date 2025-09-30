// アプリケーションのメインクラス
class PolicyBudgetSimulator {
    constructor() {
        this.currentInput = null;
        this.similarProjects = [];
        this.latestAnalysis = null;
        this.currentTab = 'all';
        this.apiBaseUrl = 'http://127.0.0.1:8000';
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderProjectsList();
        this.updateAnalysisSummary();
        this.showToast('初期化が完了しました', 'info');
    }

    bindEvents() {
        document.getElementById('projectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        document.getElementById('newProjectBtn').addEventListener('click', () => {
            this.newProject();
        });

        const historyBtn = document.getElementById('historyBtn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.navigateToHistory();
            });
        }

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const target = event.currentTarget;
                this.switchTab(target.dataset.tab);
            });
        });

        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('projectModal').addEventListener('click', (event) => {
            if (event.target.id === 'projectModal') {
                this.closeModal();
            }
        });
    }

    sanitizeHTML(text) {
        if (typeof text !== 'string') {
            return '';
        }
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return text.replace(/[&<>"']/g, (char) => map[char]);
    }

    formatMultiline(text) {
        return this.sanitizeHTML(text).replace(/\n/g, '<br>');
    }

    buildRsSystemUrl(project) {
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

    enhanceReferences(references) {
        const missingProjectNames = [];
        const enhancedProjects = references
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
                const rsSystemUrl = this.buildRsSystemUrl(item);
                if (!rsSystemUrl) {
                    const fallbackName = (item && item.project_name) || '名称不明の事業';
                    missingProjectNames.push(fallbackName);
                }
                return {
                    ...item,
                    rs_system_url: rsSystemUrl || null,
                };
            });

        return {
            enhancedProjects,
            missingProjectNames,
        };
    }

    notifyMissingProjectIds(projectNames) {
        if (!Array.isArray(projectNames) || projectNames.length === 0) {
            return;
        }

        const uniqueNames = Array.from(new Set(projectNames.filter(Boolean)));
        const summary = uniqueNames.slice(0, 3).join('、');
        const suffix = uniqueNames.length > 3 ? ' など' : '';
        this.showToast(
            `一部の類似事業に予算事業IDがありませんでした (${summary}${suffix})`,
            'warning'
        );
        console.warn('予算事業IDが確認できない類似事業:', uniqueNames);
    }

    async handleFormSubmit() {
        const form = document.getElementById('projectForm');
        const formData = new FormData(form);
        const projectData = {
            currentSituation: (formData.get('currentSituation') || '').trim(),
            projectName: (formData.get('projectName') || '').trim(),
            projectOverview: (formData.get('projectOverview') || '').trim(),
        };

        this.currentInput = projectData;

        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分析中...';

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/v1/analyses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(projectData),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`APIエラー: ${errorData.detail || response.statusText}`);
            }

            const analysisResult = await response.json();
            this.currentInput = analysisResult.request_data || projectData;
            const references = Array.isArray(analysisResult.references) ? analysisResult.references : [];
            const { enhancedProjects, missingProjectNames } = this.enhanceReferences(references);
            this.similarProjects = enhancedProjects;
            this.notifyMissingProjectIds(missingProjectNames);
            this.latestAnalysis = analysisResult;

            this.renderProjectsList();
            this.updateAnalysisSummary();

            const successMessage = analysisResult.history_id
                ? `分析を完了し、ログID ${analysisResult.history_id} に保存しました`
                : '分析が完了しました';
            this.showToast(successMessage, 'success');
        } catch (error) {
            console.error('分析中にエラーが発生しました:', error);
            this.showToast(error.message, 'error');
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> 過去事例と比較分析する';
        }
    }

    renderProjectsList() {
        const projectsList = document.getElementById('projectsList');
        const safeProjects = Array.isArray(this.similarProjects)
            ? this.similarProjects.filter((item) => item && typeof item === 'object')
            : [];

        if (safeProjects.length === 0) {
            projectsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>類似の過去事業が見つかりませんでした</p>
                </div>
            `;
            return;
        }

        projectsList.innerHTML = safeProjects
            .map((project, index) => {
                const projectName = this.sanitizeHTML(project.project_name || '名称不明');
                const ministry = this.sanitizeHTML(project.ministry_name || '所属不明');
                const similarity = typeof project.similarity === 'number' ? project.similarity.toFixed(3) : '---';
                const budgetLabel = typeof project.budget === 'number'
                    ? `¥${Math.round(project.budget).toLocaleString()}`
                    : '予算情報なし';
                const rsSystemLink = project.rs_system_url
                    ? this.createProjectLink(project.rs_system_url, 'RSシステム')
                    : '<span class="link-unavailable">RSリンクなし</span>';

                return `
                    <div class="project-item" data-project-index="${index}">
                        <div class="project-header">
                            <span class="project-name">${projectName}</span>
                            <span class="project-budget">${budgetLabel}</span>
                        </div>
                        <div class="project-rating">
                            <span>府省庁: ${ministry}</span>
                            <span class="rating-badge rating-b">類似度: ${similarity}</span>
                        </div>
                        <div class="project-links">
                            ${rsSystemLink}
                        </div>
                    </div>
                `;
            })
            .join('');

        projectsList.querySelectorAll('.project-item').forEach((item) => {
            item.addEventListener('click', () => {
                const index = Number(item.dataset.projectIndex);
                if (!Number.isNaN(index)) {
                    this.showProjectModal(index);
                }
            });
        });
    }

    showProjectModal(identifier) {
        let project = null;

        if (typeof identifier === 'number') {
            project = Array.isArray(this.similarProjects) ? this.similarProjects[identifier] : null;
        } else {
            project = Array.isArray(this.similarProjects)
                ? this.similarProjects.find((p) => p && p.project_id === identifier)
                : null;
        }

        if (!project) {
            return;
        }

        const budgetLabel = typeof project.budget === 'number'
            ? `¥${Math.round(project.budget).toLocaleString()}`
            : '情報なし';

        document.getElementById('modalProjectName').textContent = project.project_name || '事業詳細';

        const modalLinks = [];
        if (project.project_url) {
            modalLinks.push(this.createProjectLink(project.project_url));
        }
        if (project.rs_system_url) {
            modalLinks.push(this.createProjectLink(project.rs_system_url, 'RSシステムで詳細を見る'));
        }
        const urlMarkup = modalLinks.length > 0 ? modalLinks.join('<br>') : 'リンクなし';
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="project-details">
                <div class="detail-row">
                    <strong>事業内容:</strong>
                    <p>${this.formatMultiline(project.project_overview || '情報なし')}</p>
                </div>
                <div class="detail-row">
                    <strong>府省庁:</strong> ${this.sanitizeHTML(project.ministry_name || '情報なし')}
                </div>
                <div class="detail-row">
                    <strong>当初予算:</strong> ${budgetLabel}
                </div>
                <div class="detail-row">
                    <strong>類似度:</strong> ${typeof project.similarity === 'number' ? project.similarity.toFixed(4) : '---'}
                </div>
                <div class="detail-row">
                    <strong>予算事業ID:</strong> ${this.sanitizeHTML(project.project_id || '---')}
                </div>
                <div class="detail-row">
                    <strong>関連URL:</strong>
                    ${urlMarkup}
                </div>
            </div>
        `;

        document.getElementById('projectModal').style.display = 'block';
    }

    createProjectLink(url, label = null) {
        if (!url || typeof url !== 'string') {
            return 'リンクなし';
        }

        const trimmed = url.trim();
        if (!trimmed || trimmed.toLowerCase() === 'nan') {
            return 'リンクなし';
        }

        const escaped = this.sanitizeHTML(trimmed);
        const linkText = label !== null ? this.sanitizeHTML(label) : escaped;
        if (/^https?:\/\//i.test(trimmed)) {
            return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        }

        return label !== null ? linkText : escaped;
    }

    updateAnalysisSummary() {
        const reportContainer = document.querySelector('.data-analysis-report');
        if (!reportContainer) {
            return;
        }

        if (!this.currentInput) {
            reportContainer.innerHTML = `
                <h3>分析サマリー</h3>
                <div class="report-placeholder">
                    <i class="fas fa-chart-area"></i>
                    <p>分析を実行すると、入力内容と類似事業のサマリーが表示されます</p>
                </div>
            `;
            return;
        }

        const similarCount = this.similarProjects.length;
        const topProject = this.similarProjects[0];
        const topProjectName = topProject
            ? this.sanitizeHTML(topProject.project_name || '情報なし')
            : '情報なし';

        reportContainer.innerHTML = `
            <h3>分析サマリー</h3>
            <div class="report-content">
                <div class="detail-row">
                    <strong>事業名:</strong>
                    <p>${this.sanitizeHTML(this.currentInput.projectName)}</p>
                </div>
                <div class="detail-row">
                    <strong>現状・目的:</strong>
                    <p>${this.formatMultiline(this.currentInput.currentSituation)}</p>
                </div>
                <div class="detail-row">
                    <strong>事業概要:</strong>
                    <p>${this.formatMultiline(this.currentInput.projectOverview)}</p>
                </div>
                <div class="detail-row">
                    <strong>類似事業件数:</strong>
                    <span>${similarCount}件</span>
                </div>
                ${topProject ? `<div class="detail-row"><strong>最も類似:</strong><p>${topProjectName}</p></div>` : ''}
            </div>
        `;
    }

    closeModal() {
        document.getElementById('projectModal').style.display = 'none';
    }

    newProject() {
        document.getElementById('projectForm').reset();
        this.currentInput = null;
        this.latestAnalysis = null;
        this.similarProjects = [];
        this.renderProjectsList();
        this.updateAnalysisSummary();
        this.closeModal();
        this.showToast('入力項目を初期化しました', 'info');
    }

    navigateToHistory() {
        window.location.href = 'history.html';
    }

    exportData() {
        if (!this.latestAnalysis) {
            this.showToast('出力対象の分析がありません', 'error');
            return;
        }

        const exportData = {
            project: this.currentInput,
            references: this.similarProjects,
            analysisDate: new Date().toISOString(),
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `policy_analysis_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        this.showToast('現在の分析内容をJSONで書き出しました', 'success');
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

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        this.showToast('タブ切替機能は現在開発中です', 'info');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.info('PolicyBudgetSimulator initialized (v2)');
    const simulator = new PolicyBudgetSimulator();
    window.app = simulator;
});
