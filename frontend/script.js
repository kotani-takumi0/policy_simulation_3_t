// アプリケーションのメインクラス
class PolicyBudgetSimulator {
    constructor() {
        this.currentProject = null;
        this.similarProjects = [];
        this.currentTab = 'all';
        // バックエンドAPIのベースURL
        this.apiBaseUrl = 'http://127.0.0.1:8000';
        this.init();
    }

    // 初期化
    init() {
        this.bindEvents();
        this.updateKPI();
        this.showToast('アプリケーションを初期化しました', 'info');
    }

    // イベントバインディング
    bindEvents() {
        document.getElementById('projectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        document.getElementById('newProjectBtn').addEventListener('click', () => {
            this.newProject();
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveProject(); // この機能はバックエンド連携により役割が変わります
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('projectModal').addEventListener('click', (e) => {
            if (e.target.id === 'projectModal') {
                this.closeModal();
            }
        });

        document.getElementById('initialBudget').addEventListener('input', (e) => {
            this.updateProposedBudget(e.target.value);
        });
    }

    // フォーム送信処理 (バックエンドAPI連携)
    async handleFormSubmit() {
        const form = document.getElementById('projectForm');
        const formData = new FormData(form);
        const projectData = {
            currentSituation: formData.get('currentSituation'),
            projectName: formData.get('projectName'),
            projectOverview: formData.get('projectOverview'),
            initialBudget: parseInt(formData.get('initialBudget')) || 0
        };

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
                const errorData = await response.json();
                throw new Error(`APIエラー: ${errorData.detail || response.statusText}`);
            }

            const analysisResult = await response.json();
            
            // レスポンスデータを画面に反映
            this.currentProject = analysisResult;
            this.similarProjects = analysisResult.references;
            
            this.renderProjectsList();
            this.updateKPI();
            this.updateAnalysisReport(analysisResult.result_data); // 分析レポートを更新

            this.showToast('分析が完了しました', 'success');

        } catch (error) {
            console.error('分析中にエラーが発生しました:', error);
            this.showToast(error.message, 'error');
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> 過去事例と比較分析する';
        }
    }

    // プロジェクトリストの表示
    renderProjectsList() {
        const projectsList = document.getElementById('projectsList');
        
        if (!this.similarProjects || this.similarProjects.length === 0) {
            projectsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>類似の過去事業が見つかりませんでした</p>
                </div>
            `;
            return;
        }

        // バックエンドから取得したデータに合わせて表示を調整
        projectsList.innerHTML = this.similarProjects.map(project => `
            <div class="project-item" onclick="app.showProjectModal('${project.project_id}')">
                <div class="project-header">
                    <span class="project-name">${project.project_name}</span>
                    <span class="project-budget">¥${Math.round(project.budget).toLocaleString()}</span>
                </div>
                <div class="project-rating">
                    <span>府省庁: ${project.ministry_name}</span>
                    <span class="rating-badge rating-b">類似度: ${project.similarity.toFixed(3)}</span>
                </div>
            </div>
        `).join('');
    }

    // プロジェクト詳細モーダル表示
   // プロジェクト詳細モーダル表示
    showProjectModal(projectId) {
        const project = this.similarProjects.find(p => p.project_id === projectId);
        if (!project) return;

        // URLが有効な場合にのみリンクとして表示し、無効な場合はテキストとして表示
        let urlElement = 'リンクなし';
        if (project.project_url && project.project_url !== 'nan' && project.project_url.startsWith('http')) {
            urlElement = `<a href="${project.project_url}" target="_blank" rel="noopener noreferrer">${project.project_url}</a>`;
        } else if (project.project_url && project.project_url !== 'nan') {
            urlElement = project.project_url;
        }

        document.getElementById('modalProjectName').textContent = project.project_name;
        document.getElementById('modalBody').innerHTML = `
            <div class="project-details">
                
                <div class="detail-row">
                    <strong>事業内容:</strong>
                    <p>${project.project_overview || '情報なし'}</p>
                </div>
                <div class="detail-row">
                    <strong>府省庁:</strong> ${project.ministry_name}
                </div>
                <div class="detail-row">
                    <strong>当初予算:</strong> ¥${Math.round(project.budget).toLocaleString()}
                </div>
                <div class="detail-row">
                    <strong>類似度:</strong> ${project.similarity.toFixed(4)}
                </div>
                <div class="detail-row">
                    <strong>予算事業ID:</strong> ${project.project_id}
                </div>

                <div class="detail-row">
                    <strong>関連URL:</strong>
                    ${urlElement}
                </div>
                </div>
        `;

        document.getElementById('projectModal').style.display = 'block';
    }

    // KPI更新
    updateKPI() {
        if (!this.currentProject) {
            this.resetKPI();
            return;
        }

        const proposedBudget = this.currentProject.request_data.initialBudget;
        const estimatedBudget = this.currentProject.result_data.estimated_budget;
        const budgetComparison = estimatedBudget ? proposedBudget - estimatedBudget : 0;
        const similarCount = this.similarProjects.length;

        document.getElementById('proposedBudgetValue').textContent = `¥${proposedBudget.toLocaleString()}`;
        document.getElementById('averageBudgetValue').textContent = estimatedBudget ? `¥${Math.round(estimatedBudget).toLocaleString()}` : 'N/A';
        
        const comparisonElement = document.getElementById('budgetComparisonValue');
        comparisonElement.textContent = estimatedBudget ? `¥${Math.round(budgetComparison).toLocaleString()}` : 'N/A';
        
        const comparisonCard = document.getElementById('budgetComparisonCard');
        comparisonCard.classList.toggle('warning', budgetComparison < 0);
        
        document.getElementById('similarProjectsValue').textContent = `${similarCount}件`;
    }
    
    // データ分析レポートの更新
    updateAnalysisReport(resultData) {
        const reportContainer = document.querySelector('.data-analysis-report');
        reportContainer.innerHTML = `
            <h3>データ分析レポート</h3>
            <div class="report-content">
                <div class="detail-row">
                    <strong>予算評価:</strong>
                    <p>${resultData.budget_assessment}</p>
                </div>
                <div class="detail-row">
                    <strong>評価できる点:</strong>
                    <ul>
                        ${resultData.positive_points.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                </div>
                <div class="detail-row">
                    <strong>懸念事項:</strong>
                    <ul>
                        ${resultData.concerns.map(c => `<li>${c}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    }
    
    // モーダルを閉じる
    closeModal() {
        document.getElementById('projectModal').style.display = 'none';
    }

    // KPIリセット
    resetKPI() {
        document.getElementById('proposedBudgetValue').textContent = '¥0';
        document.getElementById('averageBudgetValue').textContent = '¥0';
        document.getElementById('budgetComparisonValue').textContent = '¥0';
        document.getElementById('similarProjectsValue').textContent = '0件';
        document.getElementById('budgetComparisonCard').classList.remove('warning');
        
        const reportContainer = document.querySelector('.data-analysis-report');
        reportContainer.innerHTML = `
            <h3>データ分析レポート</h3>
            <div class="report-placeholder">
                <i class="fas fa-chart-area"></i>
                <p>分析を実行すると、AIによるレポートがここに表示されます</p>
            </div>
        `;
    }

    // 提案予算の更新
    updateProposedBudget(budget) {
        if (budget) {
            document.getElementById('proposedBudgetValue').textContent = `¥${parseInt(budget).toLocaleString()}`;
        } else {
            document.getElementById('proposedBudgetValue').textContent = '¥0';
        }
    }

    // 新規プロジェクト作成
    newProject() {
        document.getElementById('projectForm').reset();
        this.currentProject = null;
        this.similarProjects = [];
        this.resetKPI();
        this.renderProjectsList();
        this.showToast('新規プロジェクトを作成しました', 'info');
    }

    // プロジェクト保存
    async saveProject() {
        // まだ分析結果がない場合は、メッセージを出して処理を中断
        if (!this.currentProject) {
            this.showToast('分析を実行してから保存してください', 'error');
            return;
        }
        
        try {
            // バックエンドの新しい /api/v1/save_analysis 窓口にデータを送信
            const response = await fetch(`${this.apiBaseUrl}/api/v1/save_analysis`, {
                method: 'POST', // POSTメソッドで送信
                headers: {
                    'Content-Type': 'application/json', // データ形式はJSONです
                },
                // this.currentProjectに保存されている分析結果の全データをJSON文字列に変換して送信
                body: JSON.stringify(this.currentProject),
            });

            // サーバーからの返信がエラーでないか確認
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`保存エラー: ${errorData.detail || response.statusText}`);
            }

            // 成功した場合、サーバーから返されたIDを使って成功メッセージを表示
            const result = await response.json();
            this.showToast(`分析結果をID: ${result.id} として保存しました`, 'success');

        } catch (error) {
            // エラーが発生した場合、コンソールにログを出し、エラーメッセージを表示
            console.error('保存中にエラーが発生しました:', error);
            this.showToast(error.message, 'error');
        }
    }

    // データ出力
    exportData() {
        if (!this.currentProject) {
            this.showToast('出力するデータがありません', 'error');
            return;
        }

        const exportData = {
            ...this.currentProject,
            analysisDate: new Date().toISOString()
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `policy_budget_analysis_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        this.showToast('現在の分析データをJSONで出力しました', 'success');
    }

    // トーストメッセージ表示
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // タブ切り替え（現在、評価データがないため機能しないが骨格は残す）
    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        // this.renderProjectsList(); // 必要に応じてフィルタリング処理を実装
        this.showToast('タブ切り替え機能は現在ダミーです', 'info');
    }
}

// アプリケーションの初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PolicyBudgetSimulator();
});

// グローバル関数として公開（HTMLからの呼び出し用）
window.app = app;