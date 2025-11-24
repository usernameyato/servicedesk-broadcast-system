class SubscriptionManager {
    constructor() {
        this.subscriptions = [];
        this.filteredSubscriptions = [];
        this.currentView = 'grid';
        this.currentFilter = 'all';
        this.searchTerm = '';

        this.saveBtn = document.getElementById('save-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.offHoursCheckbox = document.getElementById('off-hours');
        this.subscriptionsContainer = document.getElementById('subscriptions-container');
        this.alertContainer = document.getElementById('alert-container');
        this.searchInput = document.getElementById('subscription-search');
        this.filterSelect = document.getElementById('subscription-filter');
        this.emptyState = document.getElementById('empty-state');
        this.loadingState = document.getElementById('loading-state');

        this.totalSubscriptionsEl = document.getElementById('total-subscriptions');
        this.activeIncidentsEl = document.getElementById('active-incidents');
        this.activeMaintenanceEl = document.getElementById('active-maintenance');
        this.highPriorityEl = document.getElementById('high-priority');

        this.originalBtnText = this.saveBtn ? this.saveBtn.innerHTML : '<i class="fas fa-save mr-2" aria-hidden="true"></i>Сохранить изменения';
        this.originalState = null;

        this.init();
    }

    async init() {
        try {
            this.showLoadingState(true);
            await this.loadSubscriptions();
            this.setupEventListeners();
            this.updateStatistics();
            this.hideLoadingState();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showNotification('Ошибка при инициализации', 'error');
            this.hideLoadingState();
        }
    }

    async loadSubscriptions() {
        try {
            const response = await fetch('/api/subscriptions', {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.subscriptions = data.subscriptions || [];

            if (this.offHoursCheckbox) {
                this.offHoursCheckbox.checked = data.off_hours === "1";
            }

            this.originalState = JSON.parse(JSON.stringify({
                off_hours: data.off_hours === "1",
                subscriptions: this.subscriptions
            }));

            this.applyFilters();
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            this.loadSampleData();
            this.showNotification('Загружены демонстрационные данные', 'error');
        }
    }

    loadSampleData() {
        this.subscriptions = [
            {
                id: 1,
                name: 'Критические системные события',
                description: 'Получайте уведомления о критических системных событиях, включая отказы серверов и сетевые проблемы',
                incidents_checked: true,
                maintenance_checked: false,
                priorities: [1, 2]
            },
            {
                id: 2,
                name: 'Плановые работы и обслуживание',
                description: 'Информация о запланированных работах по обслуживанию систем и инфраструктуры',
                incidents_checked: false,
                maintenance_checked: true,
                priorities: []
            },
            {
                id: 3,
                name: 'Инциденты безопасности',
                description: 'Уведомления о потенциальных угрозах безопасности и нарушениях в системе',
                incidents_checked: true,
                maintenance_checked: true,
                priorities: [1, 3]
            },
            {
                id: 4,
                name: 'Обновления программного обеспечения',
                description: 'Информация об обновлениях ПО, установке патчей и новых версий систем',
                incidents_checked: false,
                maintenance_checked: true,
                priorities: []
            },
            {
                id: 5,
                name: 'Мониторинг производительности',
                description: 'Уведомления о снижении производительности системы и превышении пороговых значений',
                incidents_checked: true,
                maintenance_checked: false,
                priorities: [2, 3]
            },
            {
                id: 6,
                name: 'Резервное копирование',
                description: 'Статус выполнения резервного копирования и восстановления данных',
                incidents_checked: false,
                maintenance_checked: true,
                priorities: []
            }
        ];

        this.originalState = JSON.parse(JSON.stringify({
            off_hours: false,
            subscriptions: this.subscriptions
        }));

        this.applyFilters();
    }

    applyFilters() {
        let filtered = [...this.subscriptions];

        if (this.searchTerm) {
            filtered = filtered.filter(sub =>
                sub.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                sub.description.toLowerCase().includes(this.searchTerm.toLowerCase())
            );
        }

        switch (this.currentFilter) {
            case 'active':
                filtered = filtered.filter(sub => sub.incidents_checked || sub.maintenance_checked);
                break;
            case 'inactive':
                filtered = filtered.filter(sub => !sub.incidents_checked && !sub.maintenance_checked);
                break;
            case 'incidents':
                filtered = filtered.filter(sub => sub.incidents_checked);
                break;
            case 'maintenance':
                filtered = filtered.filter(sub => sub.maintenance_checked);
                break;
        }

        this.filteredSubscriptions = filtered;
        this.renderSubscriptions();
        this.updateStatistics();
    }

    renderSubscriptions() {
        if (!this.subscriptionsContainer) {
            console.error('Subscriptions container not found');
            return;
        }

        this.subscriptionsContainer.className = `subscriptions-grid ${this.currentView === 'list' ? 'list-view' : ''}`;

        if (this.filteredSubscriptions.length === 0) {
            this.showEmptyState(true);
            return;
        }

        this.showEmptyState(false);
        this.subscriptionsContainer.innerHTML = '';

        this.filteredSubscriptions.forEach(subscription => {
            const subscriptionCard = this.createSubscriptionCard(subscription);
            this.subscriptionsContainer.appendChild(subscriptionCard);
        });
    }

    createSubscriptionCard(subscription) {
        const card = document.createElement('div');
        card.className = `subscription-card ${this.getCardClasses(subscription)}`;
        card.setAttribute('data-subscription-id', subscription.id);

        card.innerHTML = `
            <div class="card-status">
                <div class="status-dot incidents ${subscription.incidents_checked ? 'active' : ''}"></div>
                <div class="status-dot maintenance ${subscription.maintenance_checked ? 'active' : ''}"></div>
            </div>

            <div class="card-header">
                <h3 class="subscription-title">${this.escapeHtml(subscription.name)}</h3>
                <p class="subscription-description">${this.escapeHtml(subscription.description)}</p>
            </div>

            <div class="card-body">
                <div class="subscription-controls">
                    <!-- Incidents Control -->
                    <div class="control-group">
                        <div class="control-header">
                            <div class="control-label">
                                <div class="control-icon incidents">
                                    <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                                </div>
                                Высокоприоритетные инциденты
                            </div>
                            <label class="switch">
                                <input type="checkbox"
                                       class="inc-subs-checkbox"
                                       data-subscription-id="${subscription.id}"
                                       ${subscription.incidents_checked ? 'checked' : ''}
                                       aria-label="Подписка на инциденты для ${this.escapeHtml(subscription.name)}">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="priority-options ${!subscription.incidents_checked ? 'hidden' : ''}"
                             data-subscription-id="${subscription.id}">
                            <div class="priority-header">
                                <i class="fas fa-filter" aria-hidden="true"></i>
                                Приоритеты уведомлений
                            </div>
                            <div class="priority-list">
                                ${this.createPriorityOptions(subscription)}
                            </div>
                        </div>
                    </div>

                    <!-- Maintenance Control -->
                    <div class="control-group">
                        <div class="control-header">
                            <div class="control-label">
                                <div class="control-icon maintenance">
                                    <i class="fas fa-tools" aria-hidden="true"></i>
                                </div>
                                Плановые работы
                            </div>
                            <label class="switch">
                                <input type="checkbox"
                                       class="mntntc-subs-checkbox"
                                       data-subscription-id="${subscription.id}"
                                       ${subscription.maintenance_checked ? 'checked' : ''}
                                       aria-label="Подписка на плановые работы для ${this.escapeHtml(subscription.name)}">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return card;
    }

    createPriorityOptions(subscription) {
        const priorities = [
            { value: 1, label: '', class: 'priority-1' },
            { value: 2, label: '', class: 'priority-2' },
            { value: 3, label: '', class: 'priority-3' }
        ];

        return priorities.map(priority => `
            <div class="priority-option">
                <input type="checkbox"
                       id="priority${priority.value}-${subscription.id}"
                       data-subscription-id="${subscription.id}"
                       data-priority="${priority.value}"
                       class="priority-checkbox inc-priority-checkbox"
                       ${subscription.priorities.includes(priority.value) ? 'checked' : ''}
                       aria-label="Приоритет ${priority.value} для ${this.escapeHtml(subscription.name)}">
                <label for="priority${priority.value}-${subscription.id}" class="priority-label">
                    <span class="priority-badge ${priority.class}">${priority.value}</span>
                    ${priority.label} приоритет
                </label>
            </div>
        `).join('');
    }

    getCardClasses(subscription) {
        const classes = [];
        if (subscription.incidents_checked && subscription.maintenance_checked) {
            classes.push('has-both');
        } else if (subscription.incidents_checked) {
            classes.push('has-incidents');
        } else if (subscription.maintenance_checked) {
            classes.push('has-maintenance');
        }
        return classes.join(' ');
    }

    setupEventListeners() {
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('inc-subs-checkbox')) {
                this.handleIncidentSubscriptionChange(e);
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('inc-priority-checkbox')) {
                this.handlePriorityChange(e);
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('mntntc-subs-checkbox')) {
                this.handleMaintenanceSubscriptionChange(e);
            }
        });

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.trim();
                this.applyFilters();
            });
        }

        if (this.filterSelect) {
            this.filterSelect.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.applyFilters();
            });
        }

        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-view')) {
                this.handleViewToggle(e);
            }
        });

        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => {
                this.saveSubscriptions();
            });
        }

        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => {
                this.resetToOriginalState();
            });
        }

        document.addEventListener('click', (e) => this.handleNotificationClose(e));
    }

    handleViewToggle(event) {
        const button = event.target.closest('.btn-view');
        const view = button.dataset.view;

        if (view === this.currentView) return;

        document.querySelectorAll('.btn-view').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        this.currentView = view;
        this.renderSubscriptions();
    }

    handleIncidentSubscriptionChange(event) {
        const subscriptionId = parseInt(event.target.dataset.subscriptionId);
        const isChecked = event.target.checked;

        const subscription = this.subscriptions.find(s => s.id === subscriptionId);
        if (!subscription) {
            console.error(`Subscription with ID ${subscriptionId} not found`);
            return;
        }

        subscription.incidents_checked = isChecked;

        const priorityContainer = document.querySelector(`.priority-options[data-subscription-id="${subscriptionId}"]`);
        if (priorityContainer) {
            if (isChecked) {
                priorityContainer.classList.remove('hidden');
            } else {
                priorityContainer.classList.add('hidden');
                subscription.priorities = [];
                priorityContainer.querySelectorAll('.inc-priority-checkbox').forEach(cb => {
                    cb.checked = false;
                });
            }
        }

        this.updateCardStyling(subscriptionId);
        this.updateStatistics();
    }

    handlePriorityChange(event) {
        const subscriptionId = parseInt(event.target.dataset.subscriptionId);
        const priority = parseInt(event.target.dataset.priority);
        const isChecked = event.target.checked;

        const subscription = this.subscriptions.find(s => s.id === subscriptionId);
        if (!subscription) {
            console.error(`Subscription with ID ${subscriptionId} not found`);
            return;
        }

        if (isChecked) {
            if (!subscription.priorities.includes(priority)) {
                subscription.priorities.push(priority);
            }
        } else {
            subscription.priorities = subscription.priorities.filter(p => p !== priority);
        }

        subscription.priorities.sort((a, b) => a - b);
        this.updateStatistics();
    }

    handleMaintenanceSubscriptionChange(event) {
        const subscriptionId = parseInt(event.target.dataset.subscriptionId);
        const isChecked = event.target.checked;

        const subscription = this.subscriptions.find(s => s.id === subscriptionId);
        if (!subscription) {
            console.error(`Subscription with ID ${subscriptionId} not found`);
            return;
        }

        subscription.maintenance_checked = isChecked;

        this.updateCardStyling(subscriptionId);
        this.updateStatistics();
    }

    updateCardStyling(subscriptionId) {
        const card = document.querySelector(`[data-subscription-id="${subscriptionId}"]`);
        const subscription = this.subscriptions.find(s => s.id === subscriptionId);

        if (!card || !subscription) return;

        card.classList.remove('has-incidents', 'has-maintenance', 'has-both');

        const newClasses = this.getCardClasses(subscription);
        if (newClasses) {
            card.classList.add(...newClasses.split(' '));
        }

        const incidentDot = card.querySelector('.status-dot.incidents');
        const maintenanceDot = card.querySelector('.status-dot.maintenance');

        if (incidentDot) {
            incidentDot.classList.toggle('active', subscription.incidents_checked);
        }
        if (maintenanceDot) {
            maintenanceDot.classList.toggle('active', subscription.maintenance_checked);
        }
    }

    updateStatistics() {
        const stats = {
            total: this.subscriptions.length,
            activeIncidents: this.subscriptions.filter(s => s.incidents_checked).length,
            activeMaintenance: this.subscriptions.filter(s => s.maintenance_checked).length,
            highPriority: this.subscriptions.filter(s => s.priorities.includes(1)).length
        };

        if (this.totalSubscriptionsEl) this.totalSubscriptionsEl.textContent = stats.total;
        if (this.activeIncidentsEl) this.activeIncidentsEl.textContent = stats.activeIncidents;
        if (this.activeMaintenanceEl) this.activeMaintenanceEl.textContent = stats.activeMaintenance;
        if (this.highPriorityEl) this.highPriorityEl.textContent = stats.highPriority;
    }

    showLoadingState(show) {
        if (this.loadingState) {
            this.loadingState.classList.toggle('hidden', !show);
        }
        if (this.subscriptionsContainer) {
            this.subscriptionsContainer.style.display = show ? 'none' : '';
        }
    }

    hideLoadingState() {
        this.showLoadingState(false);
    }

    showEmptyState(show) {
        if (this.emptyState) {
            this.emptyState.classList.toggle('hidden', !show);
        }
    }

    resetToOriginalState() {
        if (!this.originalState) {
            this.showNotification('Нет данных для сброса', 'error');
            return;
        }

        if (this.offHoursCheckbox) {
            this.offHoursCheckbox.checked = this.originalState.off_hours;
        }

        this.subscriptions = JSON.parse(JSON.stringify(this.originalState.subscriptions));

        this.searchTerm = '';
        this.currentFilter = 'all';

        if (this.searchInput) this.searchInput.value = '';
        if (this.filterSelect) this.filterSelect.value = 'all';

        this.applyFilters();
        this.showNotification('Настройки сброшены к исходному состоянию', 'success');
    }

    async saveSubscriptions() {
        if (!this.saveBtn) return;

        this.setLoadingState(true);

        try {
            const payload = {
                off_hours: this.offHoursCheckbox ? (this.offHoursCheckbox.checked ? "1" : "0") : "0",
                subscriptions: this.subscriptions.map(sub => ({
                    id: sub.id,
                    incidents_checked: sub.incidents_checked,
                    maintenance_checked: sub.maintenance_checked,
                    priorities: sub.priorities
                }))
            };

            const response = await fetch('/api/subscriptions/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success !== false) {
                this.originalState = JSON.parse(JSON.stringify({
                    off_hours: this.offHoursCheckbox ? this.offHoursCheckbox.checked : false,
                    subscriptions: this.subscriptions
                }));

                this.showNotification('Подписки успешно сохранены!', 'success');
            } else {
                this.showNotification(result.error || 'Произошла ошибка при сохранении', 'error');
            }
        } catch (error) {
            console.error('Error saving subscriptions:', error);
            this.showNotification('Произошла ошибка при сохранении подписок', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    setLoadingState(isLoading) {
        if (!this.saveBtn) return;

        this.saveBtn.disabled = isLoading;

        if (isLoading) {
            this.saveBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Сохранение...
            `;
        } else {
            this.saveBtn.innerHTML = this.originalBtnText;
        }
    }

    showNotification(message, type = 'success') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => {
            this.hideNotification(notification);
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-message">${this.escapeHtml(message)}</span>
            <button type="button" class="notification-close" aria-label="Закрыть">&times;</button>
        `;

        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        if (type === 'success') {
            setTimeout(() => {
                this.hideNotification(notification);
            }, 5000);
        }

        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideNotification(notification));
        }
    }

    hideNotification(notification) {
        if (!notification || !notification.parentNode) return;

        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }

    handleNotificationClose(event) {
        if (event.target.classList.contains('notification-close')) {
            const notification = event.target.closest('.notification');
            if (notification) {
                this.hideNotification(notification);
            }
        }
    }

    escapeHtml(text) {
        if (typeof text !== 'string') return '';

        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    getSubscriptionState() {
        return {
            off_hours: this.offHoursCheckbox ? this.offHoursCheckbox.checked : false,
            subscriptions: this.subscriptions,
            currentFilter: this.currentFilter,
            searchTerm: this.searchTerm,
            currentView: this.currentView
        };
    }

    updateSubscription(subscriptionId, updates) {
        const subscription = this.subscriptions.find(s => s.id === subscriptionId);
        if (!subscription) {
            console.error(`Subscription with ID ${subscriptionId} not found`);
            return false;
        }

        Object.assign(subscription, updates);
        this.applyFilters();
        return true;
    }

    setFilter(filter) {
        this.currentFilter = filter;
        if (this.filterSelect) this.filterSelect.value = filter;
        this.applyFilters();
    }

    setSearch(searchTerm) {
        this.searchTerm = searchTerm;
        if (this.searchInput) this.searchInput.value = searchTerm;
        this.applyFilters();
    }

    debug(message, data = null) {
        if (console && console.log) {
            console.log(`[SubscriptionManager] ${message}`, data);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const manager = new SubscriptionManager();

    if (window.console) {
        window.subscriptionManager = manager;
    }
});