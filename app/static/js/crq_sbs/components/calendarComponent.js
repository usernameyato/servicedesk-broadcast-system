// calendarComponent.js - Fixed version with unified tooltip system
import { NotificationManager } from '../utils/notificationManager.js';

export class CalendarComponent {
    constructor(container, stateManager, crqService, apiClient, lockManager) {
        this.container = container;
        this.state = stateManager;
        this.crqService = crqService;
        this.apiClient = apiClient;
        this.calendarBody = container.querySelector('#calendarBody');
        this.lockManager = lockManager;
        
        // Unified tooltip system
        this.tooltip = null;
        this.tooltipTimeout = null;
        this.isTooltipShowing = false;
        this.currentTooltipElement = null;
        
        this.init();
        this.bindEvents();
    }

    init() {
        // Set default service
        const currentState = this.state.getState();
        if (!currentState.currentService) {
            this.state.setCurrentService('td');
        }
        
        this.updateActiveTab();
        this.updateServiceTitle();
        
        // Track state changes
        this.state.addEventListener('stateChange', (event) => {
            this.handleStateChange(event.detail);
        });

        // Load initial data
        this.loadCalendarData();

        this.createTooltip();
    }

    bindEvents() {
        // Service tab buttons
        const tabButtons = this.container.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.handleServiceChange(e.target.getAttribute('data-service'));
            });
        });

        // Filter buttons
        const filterButtons = this.container.querySelectorAll('.filter-button[data-filter]');
        filterButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.handleFilterChange(e.target.getAttribute('data-filter'));
            });
        });

        const dateRangeButton = this.container.querySelector('.date-range-button');
        dateRangeButton.addEventListener('click', () => {
            this.handleDateRangeFilter();
        });

        // Unified CRQ element events handlers
        this.calendarBody.addEventListener('mouseenter', (e) => {
            if (e.target.classList.contains('view-crq-details')) {
                this.handleTooltipMouseEnter(e);
            }
        }, true);

        this.calendarBody.addEventListener('mouseleave', (e) => {
            if (e.target.classList.contains('view-crq-details')) {
                this.handleTooltipMouseLeave(e);
            }
        }, true);

        this.calendarBody.addEventListener('mousemove', (e) => {
            if (e.target.classList.contains('view-crq-details') && this.isTooltipShowing) {
                this.updateTooltipPosition(e);
            }
        });

        this.calendarBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('view-crq-details')) {
                const crqNumber = e.target.getAttribute('data-crq-number');
                this.handleCrqClick(crqNumber);
            }
        });
    }

    handleStateChange({ updates }) {
        if (updates.crqs) {
            this.renderCalendar();
        }
        
        if (updates.loading && updates.loading.calendar !== undefined) {
            this.toggleLoading(updates.loading.calendar);
        }
        
        if (updates.error) {
            this.showError(updates.error);
        }
        
        if (updates.currentService) {
            this.updateActiveTab();
            this.updateServiceTitle();
        }
    }

    async handleServiceChange(service) {
        this.state.setCurrentService(service);
        await this.loadCalendarData();
    }

    async handleFilterChange(filter) {
        const dateRange = this.convertFilterToDateRange(filter);
        this.state.setFilters({ 
            filter: null,
            startDate: dateRange.startDate, 
            endDate: dateRange.endDate 
        });
        await this.loadCalendarData();
    }

    async handleDateRangeFilter() {
        const startDate = this.container.querySelector('#filterStartDate').value;
        const endDate = this.container.querySelector('#filterEndDate').value;
        
        if (!startDate || !endDate) {
            NotificationManager.showWarning('Пожалуйста, выберите начальную и конечную даты');
            return;
        }

        this.state.setFilters({ 
            filter: null, 
            startDate, 
            endDate 
        });
        
        await this.loadCalendarData();
    }

    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'crq-tooltip unified-tooltip';
        this.tooltip.style.cssText = `
            position: absolute;
            background-color: #333;
            color: #fff;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            max-width: 300px;
            word-wrap: break-word;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            line-height: 1.4;
        `;
        document.body.appendChild(this.tooltip);
    }

    handleTooltipMouseEnter(event) {
        // Clear any pending hide timeout
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }

        // Store current element
        this.currentTooltipElement = event.target;

        // Small delay to prevent flickering
        this.tooltipTimeout = setTimeout(() => {
            this.showUnifiedTooltip(event);
        }, 150);
    }

    handleTooltipMouseLeave(event) {
        // Clear show timeout if mouse leaves quickly
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }

        // Clear current element
        this.currentTooltipElement = null;

        // Hide with small delay to prevent flickering
        this.tooltipTimeout = setTimeout(() => {
            this.hideTooltip();
        }, 100);
    }

    async showUnifiedTooltip(event) {
        const button = event.target;
        const crqNumber = button.getAttribute('data-crq-number');

        if (!crqNumber) return;

        // Preserve original title
        if (!button.hasAttribute('data-original-title')) {
            button.setAttribute('data-original-title', button.title || '');
            button.title = '';
        }

        // Get CRQ comment
        const comment = button.getAttribute('data-crq-comment') || '';
        const displayComment = comment.trim() || 'Комментарий отсутствует.';

        // Get lock status
        let lockStatusText = '';
        if (this.lockManager) {
            try {
                const lockStatus = await this.lockManager.getLockStatus(crqNumber);
                if (lockStatus.status === 'locked' && lockStatus.lock_info) {
                    if (lockStatus.lock_info.user_id === this.lockManager.userId) {
                        lockStatusText = '<div style="color: #4ade80; margin-top: 8px; padding-top: 8px; border-top: 1px solid #555;">🔒 Заблокировано вами</div>';
                    } else {
                        lockStatusText = `<div style="color: #f87171; margin-top: 8px; padding-top: 8px; border-top: 1px solid #555;">🔒 Заблокировано: ${lockStatus.lock_info.user_name}</div>`;
                    }
                } else {
                    lockStatusText = '<div style="color: #94a3b8; margin-top: 8px; padding-top: 8px; border-top: 1px solid #555;">🔓 Доступно для редактирования</div>';
                }
            } catch (error) {
                console.warn('Could not get lock status for tooltip:', error);
                lockStatusText = '<div style="color: #fbbf24; margin-top: 8px; padding-top: 8px; border-top: 1px solid #555;">⚠️ Статус блокировки недоступен</div>';
            }
        }

        // Create unified tooltip content
        const tooltipContent = `
            <div style="font-weight: bold; margin-bottom: 8px;">${crqNumber}</div>
            <div style="margin-bottom: 4px;">${displayComment}</div>
            ${lockStatusText}
        `;
        
        this.tooltip.innerHTML = tooltipContent;
        this.tooltip.classList.add('show');
        this.tooltip.style.opacity = '1';
        this.isTooltipShowing = true;
        this.updateTooltipPosition(event);
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('show');
            this.tooltip.style.opacity = '0';
            this.isTooltipShowing = false;
        }
    }

    updateTooltipPosition(event) {
        if (!this.tooltip || !this.isTooltipShowing) {
            return;
        }

        // Force layout calculation
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.display = 'block';
        
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = event.pageX + 15;
        let top = event.pageY - 10;

        // Adjust horizontal position
        if (left + tooltipRect.width > viewportWidth - 20) {
            left = event.pageX - tooltipRect.width - 15;
        }

        // Adjust vertical position
        if (top - tooltipRect.height < window.pageYOffset + 20) {
            top = event.pageY + 25;
        }

        // Ensure tooltip doesn't go off-screen
        if (top + tooltipRect.height > window.pageYOffset + viewportHeight - 20) {
            top = window.pageYOffset + viewportHeight - tooltipRect.height - 20;
        }

        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';
        this.tooltip.style.visibility = 'visible';
    }

    async handleCrqClick(crqNumber) {
        const crqButton = document.querySelector(`[data-crq-number="${crqNumber}"]`);
        
        // Prevent multiple clicks
        if (crqButton?.disabled) {
            return;
        }

        // Hide tooltip when clicking
        this.hideTooltip();

        try {
            // Disable button during operation
            if (crqButton) {
                crqButton.disabled = true;
                crqButton.classList.add('loading');
            }

            // Check if lockManager is available
            if (!this.lockManager) {
                await this.openModalDirectly(crqNumber);
                return;
            }

            // Check current lock status
            const lockStatus = await this.lockManager.getLockStatus(crqNumber);
            
            // If locked by someone else, show warning
            if (lockStatus.status === 'locked' && 
                lockStatus.lock_info && 
                lockStatus.lock_info.user_id !== this.lockManager.userId) {
                
                NotificationManager.showWarning(
                    `CRQ ${crqNumber} редактируется пользователем ${lockStatus.lock_info.user_name}.`
                );
                return;
            }

            // If we already have the lock, open modal directly
            if (lockStatus.status === 'locked' && 
                lockStatus.lock_info?.user_id === this.lockManager.userId) {
                await this.openModalWithLock(crqNumber);
                return;
            }

            // Try to acquire lock
            const lockResult = await this.lockManager.acquireLock(crqNumber);
            
            if (!lockResult.success) {
                const lockedBy = lockResult.lock_info?.user_name || 'другим пользователем';
                NotificationManager.showWarning(
                    `CRQ ${crqNumber} заблокирован пользователем ${lockedBy}.`
                );
                return;
            }

            // Successfully acquired lock
            await this.openModalWithLock(crqNumber);

        } catch (error) {
            console.error('Error handling CRQ click:', error);
            
            if (error.message.includes('Network') || error.message.includes('fetch')) {
                NotificationManager.showError('Ошибка сети. Проверьте подключение к интернету.');
            } else {
                NotificationManager.showWarning('Система блокировок недоступна. Открываем в режиме только для чтения.');
                await this.openModalDirectly(crqNumber);
            }
        } finally {
            // Always restore button state
            if (crqButton) {
                crqButton.disabled = false;
                crqButton.classList.remove('loading');
            }
        }
    }

    async openModalWithLock(crqNumber) {
        if (!window.app) {
            NotificationManager.showError('Приложение не инициализировано');
            return;
        }

        const editModal = window.app.getComponent('editCrqModal');
        if (!editModal) {
            NotificationManager.showError('Модальное окно редактирования недоступно');
            return;
        }

        editModal.hasLock = true;
        await editModal.open(crqNumber);
    }

    async openModalDirectly(crqNumber) {
        if (!window.app) {
            NotificationManager.showError('Приложение не инициализировано');
            return;
        }

        const editModal = window.app.getComponent('editCrqModal');
        if (!editModal) {
            NotificationManager.showError('Модальное окно редактирования недоступно');
            return;
        }

        editModal.hasLock = false;
        await editModal.open(crqNumber);
    }

    async loadCalendarData() {
        const { filters } = this.state.getState();
        await this.crqService.loadCrqs(filters);
    }

    renderCalendar() {
        const { crqs } = this.state.getState();
    
        const isEmpty = !crqs || 
                    (Array.isArray(crqs) && crqs.length === 0) || 
                    (typeof crqs === 'object' && !Array.isArray(crqs) && Object.keys(crqs).length === 0);
        
        if (isEmpty) {
            this.calendarBody.innerHTML = '<tr><td colspan="3" class="no-data">Нет данных для отображения</td></tr>';
            return;
        }

        let dates, crqsData;
        
        if (Array.isArray(crqs)) {
            crqsData = this.groupCrqsByDate(crqs);
            dates = Object.keys(crqsData).sort();
        } else if (typeof crqs === 'object') {
            crqsData = crqs;
            dates = Object.keys(crqs).sort();
        } else {
            console.error('Unexpected crqs format:', crqs);
            this.calendarBody.innerHTML = '<tr><td colspan="3" class="error">Ошибка формата данных</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        
        dates.forEach(date => {
            const row = this.createCalendarRow(date, crqsData[date]);
            fragment.appendChild(row);
        });

        this.calendarBody.innerHTML = '';
        this.calendarBody.appendChild(fragment);

        // Check lock statuses after rendering (removed visual updates to prevent conflicts)
        setTimeout(() => {
            this.checkAllCrqLocks();
        }, 100);
    }

    async checkAllCrqLocks() {
        if (!this.lockManager) return;
        
        const crqButtons = this.calendarBody.querySelectorAll('[data-crq-number]');
        
        // Create array of lock check promises
        const lockCheckPromises = Array.from(crqButtons).map(async (button) => {
            const crqNumber = button.getAttribute('data-crq-number');
            try {
                const lockStatus = await this.lockManager.getLockStatus(crqNumber);
                return { button, lockStatus, success: true };
            } catch (error) {
                console.error(`Error checking lock status for CRQ ${crqNumber}:`, error);
                return { button, error, success: false };
            }
        });

        // Execute all checks in parallel
        const results = await Promise.allSettled(lockCheckPromises);
        
        // Process results - only store lock status in data attributes for tooltip use
        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.success) {
                this.storeLockStatus(result.value.button, result.value.lockStatus);
            }
        });
    }

    storeLockStatus(button, lockStatus) {
        // Store lock status in data attributes for tooltip to use
        // Don't update visual appearance here to avoid conflicts with tooltip
        button.setAttribute('data-lock-status', lockStatus.status);
        
        if (lockStatus.status === 'locked' && lockStatus.lock_info) {
            button.setAttribute('data-lock-user-id', lockStatus.lock_info.user_id);
            button.setAttribute('data-lock-user-name', lockStatus.lock_info.user_name);
        } else {
            button.removeAttribute('data-lock-user-id');
            button.removeAttribute('data-lock-user-name');
        }
    }

    groupCrqsByDate(crqsArray) {
        const grouped = {};
        crqsArray.forEach(crq => {
            const date = crq.start_date ? crq.start_date.split('T')[0] : 'unknown';
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(crq);
        });
        return grouped;
    }

    convertFilterToDateRange(filter) {
        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        let startDate;

        switch (filter) {
            case 'one_day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                break;
            case 'two_days':
                startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                break;
            case 'two_weeks':
                startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                break;
            default:
                throw new Error(`Неизвестный фильтр: ${filter}`);
        }

        return { startDate, endDate };
    }

    createCalendarRow(date, crqs) {
        const row = document.createElement('tr');
        
        const dateObj = new Date(date);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const formattedDate = `${day}.${month}.${year}`;
        
        const dateCell = document.createElement('td');
        dateCell.textContent = formattedDate;
        dateCell.className = 'date-cell';
        
        const dayCell = document.createElement('td');
        const dayOfWeek = dateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
        dayCell.textContent = dayOfWeek;
        dayCell.className = 'day-cell';
        
        if (dayOfWeek === 'суббота' || dayOfWeek === 'воскресенье') {
            dateCell.classList.add(dayOfWeek.toLowerCase());
            dayCell.classList.add(dayOfWeek.toLowerCase());
        }
        
        const workCell = document.createElement('td');
        workCell.className = 'work-cell';
        if (dayOfWeek === 'суббота' || dayOfWeek === 'воскресенье') {
            workCell.classList.add(dayOfWeek.toLowerCase());
        }
        
        // Ensure crqs is an array
        const crqsArray = Array.isArray(crqs) ? crqs : [crqs];
        
        crqsArray.forEach(crq => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `work-button view-crq-details crq-status-${this.getStatusClass(crq.status)}`;
            button.setAttribute('data-crq-number', crq.crq_number);
            button.setAttribute('data-crq-comment', crq.comments || '');
            button.textContent = crq.crq_number;
            workCell.appendChild(button);
        });
        
        row.appendChild(dateCell);
        row.appendChild(dayCell);
        row.appendChild(workCell);
        
        return row;
    }

    getStatusClass(status) {
        const statusClasses = {
            'Новое': 'new',
            'Работы заведены': 'created',
            'Работы перенесены': 'rescheduled',
            'Работы отменены': 'cancelled',
            'Под вопросом есть взаимовлияние': 'questioned',
            'Пл. работы Без влияния': 'no-impact',
            'Работы неуспешны': 'unsuccessful',
            'Работы по MFS': 'mfs'
        };
        return statusClasses[status] || 'unknown';
    }

    toggleLoading(isLoading) {
        if (isLoading) {
            this.calendarBody.innerHTML = '<tr><td colspan="3" class="loading">Загрузка данных календаря...</td></tr>';
        }
    }

    showError(error) {
        this.calendarBody.innerHTML = `<tr><td colspan="3" class="error">Ошибка: ${error}</td></tr>`;
    }

    updateActiveTab() {
        const { currentService } = this.state.getState();
        const tabButtons = this.container.querySelectorAll('.tab-button');
        
        tabButtons.forEach(button => {
            button.classList.remove('active');
            if (button.getAttribute('data-service') === currentService) {
                button.classList.add('active');
            }
        });
    }

    updateServiceTitle() {
        const { currentService } = this.state.getState();
        const serviceTitle = this.container.querySelector('#serviceTitle');
        serviceTitle.textContent = currentService.toUpperCase() === 'TD' ? 'Оповещения ТД' : 'Оповещения ДИТ';
    }

    destroy() {
        // Clear any pending timeouts
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }

        // Remove tooltip from DOM
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
            this.tooltip = null;
        }

        // Clean up state
        this.isTooltipShowing = false;
        this.currentTooltipElement = null;
    }
}