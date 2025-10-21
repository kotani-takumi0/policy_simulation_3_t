// アプリケーションのメインクラス
class PolicyBudgetSimulator {
    constructor() {
        this.currentInput = null;
        this.similarProjects = [];
        this.latestAnalysis = null;
        this.currentTab = 'all';
        // 旧API（分析・履歴）
        this.apiBaseUrl = 'http://127.0.0.1:8000';
        // 新API（ケース/案/版）
        this.newApiBaseUrl = 'http://127.0.0.1:8001';
        // デモ用に Org/User を固定する（本番はログイン情報から取得）
        this.defaultOrgId = 1; // 必要に応じて変更
        this.defaultUserId = null; // 未ログイン環境では null のまま
        this.budgetInsights = null;
        this.serverEstimatedBudget = null;
        this.proposedBudget = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderProjectsList();
        this.updateAnalysisSummary();
        this.updateKpiSection();
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

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveAnalysis();
            });
        }

        const saveAsOptionBtn = document.getElementById('saveAsOptionBtn');
        if (saveAsOptionBtn) {
            saveAsOptionBtn.addEventListener('click', () => {
                this.saveAsOption();
            });
        }

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

    // ===== 新API 連携（ケース/案/版） =====
    async saveAsOption() {
        if (!this.currentInput) {
            this.showToast('まず分析を実行してください', 'error');
            return;
        }
        if (!Number.isInteger(this.defaultOrgId)) {
            this.showToast('Org ID が未設定です（frontend/script.js 内 defaultOrgId）', 'error');
            return;
        }

        try {
            // 1) ケース作成（最小項目）
            const casePayload = {
                org_id: this.defaultOrgId,
                title: this.currentInput.projectName || '無題のケース',
                purpose: this.currentInput.currentSituation || '',
                visibility: 'org',
                created_by: this.defaultUserId,
            };
            const caseRes = await fetch(`${this.newApiBaseUrl}/api/v1/cases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(casePayload),
            });
            if (!caseRes.ok) {
                const err = await caseRes.json().catch(() => ({}));
                throw new Error(`ケース作成に失敗: ${err.detail || caseRes.statusText}`);
            }
            const policyCase = await caseRes.json();

            // 2) 案（Option）を v1 として作成
            const summary = (this.currentInput.projectOverview || '').trim();
            const bodyParts = [
                `【現状・目的】\n${this.currentInput.currentSituation || ''}`,
                `\n\n【事業概要】\n${this.currentInput.projectOverview || ''}`,
            ];
            if (Array.isArray(this.similarProjects) && this.similarProjects.length > 0) {
                const lines = this.similarProjects.slice(0, 5).map((p, i) => {
                    const name = p?.project_name || '名称不明';
                    const sim = typeof p?.similarity === 'number' ? p.similarity.toFixed(3) : '---';
                    return `${i + 1}. ${name} (sim=${sim})`;
                });
                bodyParts.push(`\n\n【参考・類似事業（上位）】\n${lines.join('\n')}`);
            }
            const optionPayload = {
                policy_case_id: policyCase.id,
                candidate_id: null,
                title: this.currentInput.projectName || '無題の案',
                summary: summary.slice(0, 200) || null,
                body: bodyParts.join(''),
                change_note: '初回ドラフト',
                created_by: this.defaultUserId,
                visibility: 'org',
            };
            const optRes = await fetch(`${this.newApiBaseUrl}/api/v1/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(optionPayload),
            });
            if (!optRes.ok) {
                const err = await optRes.json().catch(() => ({}));
                throw new Error(`案の作成に失敗: ${err.detail || optRes.statusText}`);
            }
            const option = await optRes.json();

            this.showToast(`ケース#${policyCase.id} に案#${option.id} (v${option.latest_version_number}) を保存しました`, 'success');
        } catch (e) {
            console.error(e);
            this.showToast(e.message || '新APIへの保存に失敗しました', 'error');
        }
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

    formatCurrency(value, { signed = false } = {}) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '--';
        }
        const rounded = Math.round(value);
        const formatted = `¥${rounded.toLocaleString('ja-JP')}`;
        if (!signed) {
            return formatted;
        }
        const sign = rounded > 0 ? '+' : '';
        return `${sign}${formatted}`;
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
        const rawInitialBudget = formData.get('initialBudget');
        const parsedInitialBudget =
            rawInitialBudget !== null && rawInitialBudget !== ''
                ? Number(rawInitialBudget)
                : null;
        if (Number.isFinite(parsedInitialBudget) && parsedInitialBudget >= 0) {
            projectData.initialBudget = parsedInitialBudget;
            this.proposedBudget = parsedInitialBudget;
        } else {
            projectData.initialBudget = null;
            this.proposedBudget = null;
        }

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
            this.proposedBudget =
                typeof this.currentInput.initialBudget === 'number' &&
                Number.isFinite(this.currentInput.initialBudget)
                    ? this.currentInput.initialBudget
                    : null;
            if (
                this.proposedBudget === null &&
                typeof analysisResult.initial_budget === 'number' &&
                Number.isFinite(analysisResult.initial_budget)
            ) {
                this.proposedBudget = analysisResult.initial_budget;
            }
            const references = Array.isArray(analysisResult.references) ? analysisResult.references : [];
            const { enhancedProjects, missingProjectNames } = this.enhanceReferences(references);
            this.similarProjects = enhancedProjects;
            this.notifyMissingProjectIds(missingProjectNames);
            this.latestAnalysis = analysisResult;
            this.serverEstimatedBudget =
                typeof analysisResult.estimated_budget === 'number' &&
                Number.isFinite(analysisResult.estimated_budget)
                    ? analysisResult.estimated_budget
                    : null;
            this.budgetInsights = this.calculateBudgetInsights(this.serverEstimatedBudget);

            this.renderProjectsList();
            this.updateAnalysisSummary();
            this.updateKpiSection();

            const successMessage = analysisResult.history_id
                ? `分析を完了し、ログID ${analysisResult.history_id} に保存しました`
                : '分析が完了しました';
            this.showToast(successMessage, 'success');
        } catch (error) {
            console.error('分析中にエラーが発生しました:', error);
            this.showToast(error.message, 'error');
            this.serverEstimatedBudget = null;
            this.budgetInsights = this.calculateBudgetInsights();
            this.updateKpiSection();
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> 比較分析を実行';
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

    calculateBudgetInsights(serverEstimate = null) {
        const validProjects = Array.isArray(this.similarProjects)
            ? this.similarProjects.filter(
                  (project) =>
                      project &&
                      typeof project.budget === 'number' &&
                      Number.isFinite(project.budget)
            )
            : [];
        const totalProjects = Array.isArray(this.similarProjects)
            ? this.similarProjects.length
            : 0;
        const normalizedServerEstimate =
            typeof serverEstimate === 'number' && Number.isFinite(serverEstimate)
                ? serverEstimate
                : null;

        if (validProjects.length === 0) {
            if (normalizedServerEstimate === null) {
                return null;
            }
            return {
                estimate: normalizedServerEstimate,
                fallbackEstimate: null,
                useServerEstimate: true,
                averageBudget: null,
                median: null,
                min: null,
                max: null,
                sampleCount: 0,
                missingCount: Math.max(totalProjects, 0),
                usedWeights: false,
            };
        }

        const budgets = validProjects.map((project) => project.budget);
        const sortedBudgets = [...budgets].sort((a, b) => a - b);
        const totalItems = budgets.length;
        const weightCandidates = validProjects
            .map((project) =>
                typeof project.similarity === 'number' && project.similarity > 0
                    ? project.similarity
                    : 0
            )
            .filter((weight) => weight > 0);
        const weightSum = weightCandidates.reduce((sum, weight) => sum + weight, 0);
        const arithmeticMean =
            totalItems > 0 ? budgets.reduce((sum, budget) => sum + budget, 0) / totalItems : null;

        const weightedEstimate =
            weightSum > 0
                ? validProjects.reduce((sum, project) => {
                      const weight =
                          typeof project.similarity === 'number' && project.similarity > 0
                              ? project.similarity
                              : 0;
                      return sum + project.budget * weight;
                  }, 0) / weightSum
                : arithmeticMean;

        const medianIndex = Math.floor(sortedBudgets.length / 2);
        const medianValue =
            sortedBudgets.length % 2 === 0
                ? (sortedBudgets[medianIndex - 1] + sortedBudgets[medianIndex]) / 2
                : sortedBudgets[medianIndex];

        const finalEstimate = normalizedServerEstimate ?? weightedEstimate;

        return {
            estimate: Number.isFinite(finalEstimate) ? finalEstimate : null,
            fallbackEstimate: Number.isFinite(weightedEstimate) ? weightedEstimate : null,
            useServerEstimate: normalizedServerEstimate !== null,
            averageBudget: Number.isFinite(arithmeticMean) ? arithmeticMean : null,
            median: medianValue,
            min: sortedBudgets[0],
            max: sortedBudgets[sortedBudgets.length - 1],
            sampleCount: totalItems,
            missingCount: Math.max(totalProjects - totalItems, 0),
            usedWeights: weightSum > 0,
        };
    }

    updateKpiSection() {
        const proposedEl = document.getElementById('proposedBudgetValue');
        const averageEl = document.getElementById('averageBudgetValue');
        const comparisonEl = document.getElementById('budgetComparisonValue');
        const countEl = document.getElementById('similarProjectsValue');
        const comparisonCard = document.getElementById('budgetComparisonCard');

        if (!proposedEl || !averageEl || !comparisonEl || !countEl || !comparisonCard) {
            return;
        }

        const proposedValue =
            typeof this.proposedBudget === 'number' && Number.isFinite(this.proposedBudget)
                ? this.proposedBudget
                : null;
        proposedEl.textContent = proposedValue !== null ? this.formatCurrency(proposedValue) : '¥0';

        const estimateValue = this.budgetInsights
            ? this.budgetInsights.estimate ?? this.budgetInsights.fallbackEstimate
            : null;
        const averageValue =
            this.budgetInsights && this.budgetInsights.averageBudget !== null
                ? this.budgetInsights.averageBudget
                : estimateValue;

        averageEl.textContent =
            averageValue !== null ? this.formatCurrency(averageValue) : '--';

        let diffValue = null;
        if (proposedValue !== null && estimateValue !== null) {
            diffValue = proposedValue - estimateValue;
            comparisonEl.textContent = this.formatCurrency(diffValue, { signed: true });
        } else {
            comparisonEl.textContent = '--';
        }

        if (diffValue !== null && diffValue > 0) {
            comparisonCard.classList.add('warning');
        } else {
            comparisonCard.classList.remove('warning');
        }

        const projectCount = Array.isArray(this.similarProjects)
            ? this.similarProjects.length
            : 0;
        countEl.textContent = `${projectCount}件`;
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
        const summaryContainer = document.getElementById('analysisSummary');
        if (!summaryContainer) {
            return;
        }

        if (!this.currentInput) {
            summaryContainer.classList.add('report-placeholder');
            summaryContainer.innerHTML = `
                <i class="fas fa-chart-area"></i>
                <p>分析を実行すると、入力内容と類似事業のサマリーが表示されます</p>
            `;
            return;
        }

        summaryContainer.classList.remove('report-placeholder');

        const similarCount = Array.isArray(this.similarProjects)
            ? this.similarProjects.length
            : 0;
        const topProject =
            Array.isArray(this.similarProjects) && this.similarProjects.length > 0
                ? this.similarProjects[0]
                : null;
        const topProjectName = topProject
            ? this.sanitizeHTML(topProject.project_name || '情報なし')
            : '情報なし';
        const estimatedValue = this.budgetInsights
            ? this.budgetInsights.estimate ?? this.budgetInsights.fallbackEstimate
            : null;
        const proposedValue =
            typeof this.proposedBudget === 'number' && Number.isFinite(this.proposedBudget)
                ? this.proposedBudget
                : null;

        summaryContainer.innerHTML = `
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
                <strong>入力された当初予算:</strong>
                <p>${this.formatCurrency(proposedValue)}</p>
            </div>
            <div class="detail-row">
                <strong>推定予算:</strong>
                <p>${this.formatCurrency(estimatedValue)}</p>
            </div>
            <div class="detail-row">
                <strong>類似事業件数:</strong>
                <p>${similarCount}件</p>
            </div>
            ${topProject ? `<div class="detail-row"><strong>最も類似:</strong><p>${topProjectName}</p></div>` : ''}
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
        this.budgetInsights = null;
        this.serverEstimatedBudget = null;
        this.proposedBudget = null;
        this.renderProjectsList();
        this.updateAnalysisSummary();
        this.updateKpiSection();
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
            estimatedBudget: this.serverEstimatedBudget ?? (this.budgetInsights?.estimate ?? null),
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

    async saveAnalysis() {
        if (!this.currentInput || !Array.isArray(this.similarProjects)) {
            this.showToast('保存できる分析がありません', 'error');
            return;
        }

        const payload = {
            projectName: this.currentInput.projectName || '',
            projectOverview: this.currentInput.projectOverview || '',
            currentSituation: this.currentInput.currentSituation || '',
            initialBudget:
                typeof this.proposedBudget === 'number' && Number.isFinite(this.proposedBudget)
                    ? this.proposedBudget
                    : null,
            references: this.similarProjects,
            estimatedBudget:
                this.serverEstimatedBudget ??
                (this.budgetInsights && this.budgetInsights.estimate !== null
                    ? this.budgetInsights.estimate
                    : null),
        };

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/v1/save_analysis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const result = await response.json();
            this.showToast(`分析を保存しました (ID: ${result.id})`, 'success');
        } catch (error) {
            console.error('保存処理でエラーが発生しました:', error);
            this.showToast(error.message || '分析の保存に失敗しました', 'error');
        }
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
