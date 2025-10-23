window.app = window.app || null;

// アプリケーションのメインクラス
class PolicyBudgetSimulator {
    constructor() {
        const fallbackBaseUrl = "http://127.0.0.1:8000";
        const resolveBaseUrl =
            typeof window !== "undefined" && typeof window.getApiBaseUrl === "function"
                ? window.getApiBaseUrl
                : () => fallbackBaseUrl;
        const resolvedBaseUrl = resolveBaseUrl() || fallbackBaseUrl;

        this.authManager = typeof AuthManager === "function" ? new AuthManager(resolvedBaseUrl) : null;
        this.currentInput = null;
        this.similarProjects = [];
        this.latestAnalysis = null;
        this.currentTab = 'all';
        // バックエンドのベースURL（分析・保存・ケース管理を統合）
        this.apiBaseUrl = resolvedBaseUrl;
        this.newApiBaseUrl = resolvedBaseUrl;
        if (this.authManager) {
            this.authManager.setApiBaseUrl(this.apiBaseUrl);
        }
        console.info(`[app] Using API base URL: ${this.apiBaseUrl}`);
        // ログイン後に付与される組織・ユーザーID
        this.defaultOrgId = null;
        this.defaultUserId = null;
        this.budgetInsights = null;
        this.serverEstimatedBudget = null;
        this.proposedBudget = null;
        this.currentOptionDetail = null;
        this.currentOptionId = null;
        this.currentOptionVersionId = null;
        this.currentCaseId = null;
        this.criteria = [];
        this.allowedTransitions = {
            draft: ['in_review'],
            in_review: ['approved', 'draft'],
            approved: ['published', 'archived'],
            published: ['archived'],
            archived: [],
        };
        this.init();
    }

    init() {
        this.bindEvents();
        if (this.authManager) {
            this.initializeAuthState();
        }
        this.renderProjectsList();
        this.updateAnalysisSummary();
        this.updateKpiSection();
        this.showToast('初期化が完了しました', 'info');
        this.initializeFromQuery();
    }

    bindEvents() {
        this.optionDetailSection = document.getElementById('optionDetailSection');
        this.optionStatusLabel = document.getElementById('optionStatusLabel');
        this.workflowHistoryList = document.getElementById('workflowHistoryList');
        this.reviewHistoryList = document.getElementById('reviewHistoryList');
        this.evidenceListEl = document.getElementById('evidenceList');
        this.assessmentListEl = document.getElementById('assessmentList');
        this.optionDetailTitleEl = document.getElementById('optionDetailTitle');
        this.optionDetailSummaryEl = document.getElementById('optionDetailSummary');
        this.optionVersionLabelEl = document.getElementById('optionVersionLabel');
        this.optionCreatedAtEl = document.getElementById('optionCreatedAt');
        this.optionUpdatedAtEl = document.getElementById('optionUpdatedAt');

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

        const workflowButtons = [
            { id: 'requestReviewBtn', status: 'in_review' },
            { id: 'approveBtn', status: 'approved' },
            { id: 'requestChangesBtn', status: 'draft' },
            { id: 'publishBtn', status: 'published' },
            { id: 'archiveBtn', status: 'archived' },
        ];

        workflowButtons.forEach(({ id, status }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => {
                    this.handleWorkflowTransition(status);
                });
            }
        });

        const reviewForm = document.getElementById('reviewForm');
        if (reviewForm) {
            reviewForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.submitReview();
            });
        }

        const evidenceForm = document.getElementById('evidenceForm');
        if (evidenceForm) {
            evidenceForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.submitEvidence();
            });
        }

        const criterionForm = document.getElementById('criterionForm');
        if (criterionForm) {
            criterionForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.submitCriterion();
            });
        }

        const assessmentList = document.getElementById('assessmentList');
        if (assessmentList) {
            assessmentList.addEventListener('click', (event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.dataset.action === 'save-assessment') {
                    const criterionId = Number(target.dataset.criterionId);
                    if (Number.isFinite(criterionId)) {
                        this.submitAssessment(criterionId);
                    }
                }
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

        this.loginModalBackdrop = document.getElementById('loginModalBackdrop');
        this.loginForm = document.getElementById('loginForm');
        this.loginBtn = document.getElementById('loginBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.registerBtn = document.getElementById('registerBtn');
        this.loginStatusLabel = document.getElementById('loginStatus');
        this.loginModalCloseBtn = document.getElementById('loginModalClose');
        this.registerModalBackdrop = document.getElementById('registerModalBackdrop');
        this.registerModalCloseBtn = document.getElementById('registerModalClose');
        this.registerForm = document.getElementById('registerForm');
        this.openRegisterModalBtn = document.getElementById('openRegisterModalBtn');
        this.openLoginModalBtn = document.getElementById('openLoginModalBtn');

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

        if (this.authManager && this.registerBtn) {
            this.registerBtn.addEventListener('click', () => {
                this.openRegisterModal();
            });
        }

        if (this.loginModalCloseBtn) {
            this.loginModalCloseBtn.addEventListener('click', () => {
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

        if (this.registerModalCloseBtn) {
            this.registerModalCloseBtn.addEventListener('click', () => {
                this.closeRegisterModal();
            });
        }

        if (this.openRegisterModalBtn) {
            this.openRegisterModalBtn.addEventListener('click', () => {
                this.closeLoginModal();
                this.openRegisterModal();
            });
        }

        if (this.openLoginModalBtn) {
            this.openLoginModalBtn.addEventListener('click', () => {
                this.closeRegisterModal();
                this.openLoginModal();
            });
        }

        if (this.registerModalBackdrop) {
            this.registerModalBackdrop.addEventListener('click', (event) => {
                if (event.target === this.registerModalBackdrop) {
                    this.closeRegisterModal();
                }
            });
        }

        if (this.authManager && this.registerForm) {
            this.registerForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleRegisterSubmit();
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
            });
        }
    }

    async initializeAuthState() {
        if (!this.authManager) {
            return;
        }
        try {
            const user = await this.authManager.fetchCurrentUser();
            this.applyAuthState(user);
        } catch (error) {
            console.warn("[auth] Failed to initialize auth state", error);
            this.applyAuthState(null);
        }
    }

    applyAuthState(user) {
        if (user && Number.isInteger(user.org_id)) {
            this.defaultOrgId = user.org_id;
            this.defaultUserId = user.id;
            if (this.loginStatusLabel) {
                this.loginStatusLabel.textContent = `${user.email} (${user.role})`;
            }
            if (this.loginBtn) {
                this.loginBtn.style.display = "none";
            }
            if (this.registerBtn) {
                this.registerBtn.style.display = "none";
            }
            if (this.logoutBtn) {
                this.logoutBtn.style.display = "inline-flex";
            }
        } else {
            this.defaultOrgId = null;
            this.defaultUserId = null;
            if (this.loginStatusLabel) {
                this.loginStatusLabel.textContent = "未ログイン";
            }
            if (this.loginBtn) {
                this.loginBtn.style.display = "inline-flex";
            }
            if (this.registerBtn) {
                this.registerBtn.style.display = "inline-flex";
            }
            if (this.logoutBtn) {
                this.logoutBtn.style.display = "none";
            }
        }
    }

    openLoginModal() {
        if (!this.loginModalBackdrop) {
            return;
        }
        this.closeRegisterModal();
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

    openRegisterModal() {
        if (!this.registerModalBackdrop) {
            return;
        }
        this.closeLoginModal();
        this.registerModalBackdrop.classList.remove('hidden');
        this.registerModalBackdrop.setAttribute('aria-hidden', 'false');
        const orgInput = document.getElementById('registerOrg');
        if (orgInput) {
            setTimeout(() => orgInput.focus(), 50);
        }
    }

    closeRegisterModal() {
        if (!this.registerModalBackdrop) {
            return;
        }
        this.registerModalBackdrop.classList.add('hidden');
        this.registerModalBackdrop.setAttribute('aria-hidden', 'true');
        if (this.registerForm) {
            this.registerForm.reset();
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
        } catch (error) {
            console.error('[auth] login error', error);
            this.showToast('ログインに失敗しました。入力内容をご確認ください。', 'error');
        }
    }

    async handleRegisterSubmit() {
        if (!this.authManager || !this.registerForm) {
            return;
        }
        const formData = new FormData(this.registerForm);
        const orgName = String(formData.get('org_name') || '').trim();
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '');
        const passwordConfirm = String(formData.get('passwordConfirm') || '');
        const role = String(formData.get('role') || 'analyst');

        if (!orgName || !email || !password || !passwordConfirm) {
            this.showToast('すべての項目を入力してください', 'error');
            return;
        }

        if (password !== passwordConfirm) {
            this.showToast('パスワードが一致しません', 'error');
            return;
        }

        const payload = {
            org_name: orgName,
            email,
            password,
            role,
        };

        try {
            const user = await this.authManager.register(payload);
            this.applyAuthState(user);
            this.showToast('アカウントを作成しログインしました', 'success');
            this.closeRegisterModal();
        } catch (error) {
            console.error('[auth] register error', error);
            let message = '登録に失敗しました。入力内容をご確認ください。';
            if (error instanceof Error && error.message) {
                try {
                    const parsed = JSON.parse(error.message);
                    if (parsed && parsed.detail) {
                        message = `登録に失敗しました: ${parsed.detail}`;
                    } else {
                        message = `登録に失敗しました: ${error.message}`;
                    }
                } catch (parseError) {
                    message = `登録に失敗しました: ${error.message}`;
                }
            }
            this.showToast(message, 'error');
        }
    }

    handleLogout() {
        if (!this.authManager) {
            return;
        }
        this.authManager.logout();
        this.applyAuthState(null);
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

    // ===== 新API 連携（ケース/案/版） =====
    async saveAsOption() {
        if (!this.currentInput) {
            this.showToast('まず分析を実行してください', 'error');
            return;
        }
        if (!Number.isInteger(this.defaultOrgId)) {
            this.showToast('Org ID が未設定です。ログインしてください。', 'error');
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
            const caseRes = await this.authFetch(`${this.newApiBaseUrl}/api/v1/cases`, {
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
                analysis_history_id: this.latestAnalysis?.history_id || null,
            };
            const optRes = await this.authFetch(`${this.newApiBaseUrl}/api/v1/options`, {
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
            this.updateCurrentOption(option);
            if (option.policy_case_id) {
                await this.loadCriteria(option.policy_case_id);
            }
            this.renderOptionDetail(this.currentOptionDetail);
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

    formatDateTime(value) {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return this.sanitizeHTML(String(value));
        }
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mi = String(date.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }

    formatDateTime(value) {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return this.sanitizeHTML(String(value));
        }
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ` +
            `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/analyses`, {
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
        this.currentOptionDetail = null;
        this.currentOptionId = null;
        this.currentOptionVersionId = null;
        this.toggleOptionDetail(false);
        this.resetOptionDetail();
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
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/save_analysis`, {
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

    toggleOptionDetail(visible) {
        if (!this.optionDetailSection) {
            return;
        }
        this.optionDetailSection.style.display = visible ? 'block' : 'none';
        if (!visible) {
            this.resetOptionDetail();
        }
    }

    getLatestVersionDetail(optionDetail = this.currentOptionDetail) {
        if (!optionDetail || !Array.isArray(optionDetail.versions) || optionDetail.versions.length === 0) {
            return null;
        }
        return optionDetail.versions.reduce((acc, cur) => (cur.version_number > acc.version_number ? cur : acc));
    }

    updateCurrentOption(optionDetail) {
        this.currentOptionDetail = optionDetail;
        this.currentOptionId = optionDetail?.id ?? null;
        this.currentCaseId = optionDetail?.policy_case_id ?? null;
        const latestVersion = this.getLatestVersionDetail(optionDetail);
        this.currentOptionVersionId = latestVersion?.id ?? null;
        this.toggleOptionDetail(true);
        this.renderOptionDetail(optionDetail);
    }

    renderOptionDetail(optionDetail) {
        if (!optionDetail || !this.optionStatusLabel) {
            return;
        }

        const status = optionDetail.status || 'draft';
        const statusTextMap = {
            draft: 'ドラフト',
            in_review: 'レビュー中',
            approved: '承認済み',
            published: '公開済み',
            archived: 'アーカイブ済み',
        };

        const latestVersion = this.getLatestVersionDetail(optionDetail);
        if (this.optionDetailTitleEl) {
            this.optionDetailTitleEl.textContent = optionDetail.title || '案件タイトル未設定';
        }
        if (this.optionDetailSummaryEl) {
            const summaryText = optionDetail.summary || '保存した案の概要がここに表示されます。';
            this.optionDetailSummaryEl.innerHTML = this.formatMultiline(summaryText);
        }
        if (this.optionVersionLabelEl) {
            const versionNumber = latestVersion?.version_number || 1;
            this.optionVersionLabelEl.textContent = `v${versionNumber}`;
        }
        if (this.optionCreatedAtEl) {
            this.optionCreatedAtEl.textContent = this.formatDateTime(optionDetail.created_at);
        }
        if (this.optionUpdatedAtEl) {
            this.optionUpdatedAtEl.textContent = this.formatDateTime(optionDetail.updated_at);
        }

        this.optionStatusLabel.textContent = statusTextMap[status] || status;
        this.optionStatusLabel.className = `status-badge status-${status}`;

        if (this.workflowHistoryList) {
            if (Array.isArray(optionDetail.workflow_history) && optionDetail.workflow_history.length > 0) {
                this.workflowHistoryList.innerHTML = optionDetail.workflow_history
                    .map((item) => {
                        const dateLabel = new Date(item.changed_at).toLocaleString();
                        const stateLabel = `${item.from_status} → ${item.to_status}`;
                        const note = item.note ? this.sanitizeHTML(item.note) : '（メモなし）';
                        return `<li><strong>${stateLabel}</strong><span>${dateLabel}</span><span>${note}</span></li>`;
                    })
                    .join('');
            } else {
                this.workflowHistoryList.innerHTML = '<li>まだステータス変更はありません</li>';
            }
        }

        if (this.reviewHistoryList) {
            if (Array.isArray(optionDetail.reviews) && optionDetail.reviews.length > 0) {
                this.reviewHistoryList.innerHTML = optionDetail.reviews
                    .map((review) => {
                        const dateLabel = new Date(review.created_at).toLocaleString();
                        const outcomeLabel = {
                            comment: 'コメント',
                            approve: '承認',
                            request_changes: '差戻',
                        }[review.outcome] || review.outcome;
                        const comment = review.comment ? this.formatMultiline(review.comment) : '（コメントなし）';
                        return `<li><strong>${outcomeLabel}</strong><span>${dateLabel}</span><span>${comment}</span></li>`;
                    })
                    .join('');
            } else {
                this.reviewHistoryList.innerHTML = '<li>まだレビューは登録されていません</li>';
            }
        }

        if (this.evidenceListEl) {
            if (latestVersion && Array.isArray(latestVersion.evidences) && latestVersion.evidences.length > 0) {
                this.evidenceListEl.innerHTML = latestVersion.evidences
                    .map((ev) => {
                        const sourceLink = ev.source_url
                            ? `<a href="${this.sanitizeHTML(ev.source_url)}" target="_blank" rel="noopener">${this.sanitizeHTML(ev.source_title || '出典リンク')}</a>`
                            : '<span>出典リンクなし</span>';
                        const snippet = ev.snippet ? this.formatMultiline(ev.snippet) : '（抜粋なし）';
                        const note = ev.note ? this.formatMultiline(ev.note) : '';
                        return `
                            <li>
                                <div><strong>${sourceLink}</strong></div>
                                <div>${snippet}</div>
                                ${note ? `<div class="muted">${note}</div>` : ''}
                            </li>
                        `;
                    })
                    .join('');
            } else {
                this.evidenceListEl.innerHTML = '<li>根拠がまだ登録されていません</li>';
            }
        }

        this.updateWorkflowButtons(status);
        this.renderAssessmentList();
    }

    resetOptionDetail() {
        if (this.optionDetailTitleEl) {
            this.optionDetailTitleEl.textContent = '案が保存されていません';
        }
        if (this.optionDetailSummaryEl) {
            this.optionDetailSummaryEl.textContent = '分析を保存すると、ここに案の概要と作業状況が表示されます。';
        }
        if (this.optionVersionLabelEl) {
            this.optionVersionLabelEl.textContent = 'v1';
        }
        if (this.optionCreatedAtEl) {
            this.optionCreatedAtEl.textContent = '--';
        }
        if (this.optionUpdatedAtEl) {
            this.optionUpdatedAtEl.textContent = '--';
        }
        if (this.optionStatusLabel) {
            this.optionStatusLabel.textContent = '未保存';
            this.optionStatusLabel.className = 'status-badge status-draft';
        }
        if (this.workflowHistoryList) {
            this.workflowHistoryList.innerHTML = '';
        }
        if (this.reviewHistoryList) {
            this.reviewHistoryList.innerHTML = '';
        }
        if (this.evidenceListEl) {
            this.evidenceListEl.innerHTML = '';
        }
        if (this.assessmentListEl) {
            this.assessmentListEl.innerHTML = '';
        }
        this.criteria = [];
    }

    async initializeFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const optionIdParam = params.get('optionId');
        if (!optionIdParam) {
            return;
        }
        const optionId = Number(optionIdParam);
        if (!Number.isFinite(optionId)) {
            return;
        }
        await this.fetchAndDisplayOption(optionId);
    }

    async fetchAndDisplayOption(optionId) {
        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/options/${optionId}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || '案の取得に失敗しました');
            }
            const option = await response.json();
            this.updateCurrentOption(option);
            if (option.policy_case_id) {
                await this.loadCriteria(option.policy_case_id);
            }
            this.renderOptionDetail(this.currentOptionDetail);
            if (this.optionDetailSection) {
                this.optionDetailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            this.showToast(`案 #${optionId} を読み込みました`, 'success');
        } catch (error) {
            console.error('Failed to load option from query:', error);
            this.showToast(error.message || '案の読み込みに失敗しました', 'error');
        }
    }

    updateWorkflowButtons(status) {
        const transitions = this.allowedTransitions[status] || [];
        const buttons = {
            in_review: document.getElementById('requestReviewBtn'),
            approved: document.getElementById('approveBtn'),
            draft: document.getElementById('requestChangesBtn'),
            published: document.getElementById('publishBtn'),
            archived: document.getElementById('archiveBtn'),
        };

        Object.entries(buttons).forEach(([targetStatus, button]) => {
            if (!button) {
                return;
            }
            button.disabled = !transitions.includes(targetStatus);
        });
    }

    async handleWorkflowTransition(toStatus) {
        if (!this.currentOptionId) {
            this.showToast('先に案として保存してください', 'error');
            return;
        }
        const payload = {
            to_status: toStatus,
            note: null,
            changed_by: this.defaultUserId,
        };

        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/options/${this.currentOptionId}/workflow/transition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const option = await response.json();
            this.showToast('ステータスを更新しました', 'success');
            this.updateCurrentOption(option);
        } catch (error) {
            console.error('ステータス変更に失敗しました:', error);
            this.showToast(error.message || 'ステータス変更に失敗しました', 'error');
        }
    }

    async submitReview() {
        if (!this.currentOptionId || !this.currentOptionVersionId) {
            this.showToast('案データがありません', 'error');
            return;
        }

        const outcomeEl = document.getElementById('reviewOutcome');
        const commentEl = document.getElementById('reviewComment');
        const outcome = outcomeEl?.value || 'comment';
        const comment = commentEl?.value || '';

        const payload = {
            option_version_id: this.currentOptionVersionId,
            reviewer_id: this.defaultUserId,
            outcome,
            comment,
        };

        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/options/${this.currentOptionId}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const option = await response.json();
            this.showToast('レビューを登録しました', 'success');
            if (commentEl) {
                commentEl.value = '';
            }
            this.updateCurrentOption(option);
        } catch (error) {
            console.error('レビュー登録に失敗しました:', error);
            this.showToast(error.message || 'レビュー登録に失敗しました', 'error');
        }
    }

    async submitEvidence() {
        if (!this.currentOptionId || !this.currentOptionVersionId) {
            this.showToast('案データがありません', 'error');
            return;
        }

        const urlEl = document.getElementById('evidenceUrl');
        const snippetEl = document.getElementById('evidenceSnippet');
        const noteEl = document.getElementById('evidenceNote');

        const payload = {
            source_url: urlEl?.value || null,
            snippet: snippetEl?.value || null,
            note: noteEl?.value || null,
            created_by: this.defaultUserId,
        };

        if (!payload.source_url && !payload.snippet) {
            this.showToast('出典URLまたは抜粋を入力してください', 'error');
            return;
        }

        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/options/${this.currentOptionId}/versions/${this.currentOptionVersionId}/evidence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const option = await response.json();
            this.showToast('根拠を追加しました', 'success');
            if (urlEl) urlEl.value = '';
            if (snippetEl) snippetEl.value = '';
            if (noteEl) noteEl.value = '';
            this.updateCurrentOption(option);
        } catch (error) {
            console.error('根拠の追加に失敗しました:', error);
            this.showToast(error.message || '根拠の追加に失敗しました', 'error');
        }
    }

    async submitCriterion() {
        if (!this.currentCaseId) {
            this.showToast('先にケースを作成してください', 'error');
            return;
        }

        const nameInput = document.getElementById('criterionName');
        const weightInput = document.getElementById('criterionWeight');

        const name = nameInput?.value?.trim() || '';
        const weightValue = weightInput?.value ? Number(weightInput.value) : null;

        if (!name) {
            this.showToast('評価基準名を入力してください', 'error');
            return;
        }

        const payload = {
            name,
            weight: Number.isFinite(weightValue) ? weightValue : null,
        };

        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/cases/${this.currentCaseId}/criteria`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const criterion = await response.json();
            this.criteria.push(criterion);
            if (nameInput) nameInput.value = '';
            if (weightInput) weightInput.value = '';
            this.renderAssessmentList();
            this.showToast('評価基準を追加しました', 'success');
        } catch (error) {
            console.error('評価基準の追加に失敗しました:', error);
            this.showToast(error.message || '評価基準の追加に失敗しました', 'error');
        }
    }

    async loadCriteria(caseId) {
        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/cases/${caseId}/criteria`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }
            const items = await response.json();
            this.criteria = Array.isArray(items) ? items : [];
            this.renderAssessmentList();
        } catch (error) {
            console.error('評価基準の取得に失敗しました:', error);
            this.showToast(error.message || '評価基準の取得に失敗しました', 'error');
        }
    }

    renderAssessmentList() {
        if (!this.assessmentListEl) {
            return;
        }

        const latestVersion = this.getLatestVersionDetail();
        const assessments = latestVersion && Array.isArray(latestVersion.assessments)
            ? latestVersion.assessments
            : [];

        if (!this.criteria.length) {
            this.assessmentListEl.innerHTML = '<p class="muted">評価基準がまだ登録されていません。新しく追加してください。</p>';
            return;
        }

        this.assessmentListEl.innerHTML = this.criteria
            .map((criterion) => {
                const current = assessments.find((item) => item.criterion_id === criterion.id);
                const score = current?.score ?? '';
                const note = current?.note ?? '';
                const weightLabel = typeof criterion.weight === 'number' ? `（重み: ${criterion.weight}）` : '';
                return `
                    <div class="assessment-item" data-criterion-id="${criterion.id}">
                        <header>
                            <span>${this.sanitizeHTML(criterion.name)}${weightLabel}</span>
                            <span>最新評価: ${score === '' ? '―' : score}</span>
                        </header>
                        <div class="score-input">
                            <label for="criterion-score-${criterion.id}">スコア</label>
                            <input type="number" step="0.1" id="criterion-score-${criterion.id}" value="${score}" />
                        </div>
                        <div class="score-input">
                            <label for="criterion-note-${criterion.id}">メモ</label>
                            <textarea id="criterion-note-${criterion.id}" rows="2">${this.sanitizeHTML(note)}</textarea>
                        </div>
                        <button type="button" class="btn btn-outline" data-action="save-assessment" data-criterion-id="${criterion.id}">
                            <i class="fas fa-save"></i> 評価を保存
                        </button>
                    </div>
                `;
            })
            .join('');
    }

    async submitAssessment(criterionId) {
        if (!this.currentOptionId || !this.currentOptionVersionId) {
            this.showToast('案データがありません', 'error');
            return;
        }

        const scoreInput = document.getElementById(`criterion-score-${criterionId}`);
        const noteInput = document.getElementById(`criterion-note-${criterionId}`);
        const scoreValue = scoreInput?.value ? Number(scoreInput.value) : null;
        const noteValue = noteInput?.value || null;

        if (scoreInput && scoreInput.value && !Number.isFinite(scoreValue)) {
            this.showToast('スコアは数値で入力してください', 'error');
            return;
        }

        const payload = {
            criterion_id: criterionId,
            score: Number.isFinite(scoreValue) ? scoreValue : null,
            note: noteValue,
            assessed_by: this.defaultUserId,
        };

        try {
            const response = await this.authFetch(`${this.apiBaseUrl}/api/v1/options/${this.currentOptionId}/versions/${this.currentOptionVersionId}/assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || response.statusText);
            }

            const option = await response.json();
            this.showToast('評価を更新しました', 'success');
            this.updateCurrentOption(option);
        } catch (error) {
            console.error('評価の更新に失敗しました:', error);
            this.showToast(error.message || '評価の更新に失敗しました', 'error');
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
