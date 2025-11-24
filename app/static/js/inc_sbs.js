/**
 * ServiceDesk Incident Management System
 * Optimized and restructured version
 */

// Configuration and Constants
const CONFIG = {
    API: {
        search: '/inc/api/search',
        subscriptions: '/inc/api/subscriptions',
        generateMessage: '/inc/api/message/generate',
        sendSMSAsync: '/inc/api/sms/send_async',
        sendEmailAsync: '/inc/api/email/send_async',
        taskStatus: '/inc/api/task/status/',
        allTasks: '/inc/api/tasks'
    },
    POLLING: {
        interval: 2000,
        maxDuration: 300000
    },
    TEAMS_CHAT_URL: 'http://172.28.83.219:5005/create_chat_endpoint'
};

/**
 * Application State Management
 */
class AppStateManager {
    constructor() {
        this.subscriptions = [];
        this.currentIncident = null;
        this.isLoading = false;
    }

    setSubscriptions(subscriptions) {
        this.subscriptions = subscriptions;
    }

    setCurrentIncident(incident) {
        this.currentIncident = incident;
    }

    getSubscriptions() {
        return this.subscriptions;
    }

    getCurrentIncident() {
        return this.currentIncident;
    }
}

/**
 * Task Monitoring Service
 */
class TaskMonitor {
    constructor() {
        this.activePolls = new Map();
    }

    startPolling(taskId, onUpdate, onComplete) {
        if (this.activePolls.has(taskId)) {
            this.stopPolling(taskId);
        }

        const startTime = Date.now();
        const pollFunction = () => {
            if (Date.now() - startTime > CONFIG.POLLING.maxDuration) {
                this.stopPolling(taskId);
                onComplete({
                    status: 'timeout',
                    message: 'Превышено время ожидания статуса задачи'
                });
                return;
            }

            $.ajax({
                url: CONFIG.API.taskStatus + taskId,
                method: 'GET'
            })
            .done(response => {
                if (response.status === 'success' && response.task) {
                    const task = response.task;
                    onUpdate(task);

                    if (['completed', 'failed', 'partial'].includes(task.status)) {
                        this.stopPolling(taskId);
                        onComplete(task);
                    }
                } else {
                    this.stopPolling(taskId);
                    onComplete({
                        status: 'error',
                        message: response.message || 'Ошибка получения статуса задачи'
                    });
                }
            })
            .fail(() => {
                this.stopPolling(taskId);
                onComplete({
                    status: 'error',
                    message: 'Ошибка связи с сервером'
                });
            });
        };

        pollFunction();
        const intervalId = setInterval(pollFunction, CONFIG.POLLING.interval);
        this.activePolls.set(taskId, intervalId);
    }

    stopPolling(taskId) {
        const intervalId = this.activePolls.get(taskId);
        if (intervalId) {
            clearInterval(intervalId);
            this.activePolls.delete(taskId);
        }
    }

    stopAllPolling() {
        this.activePolls.forEach(intervalId => clearInterval(intervalId));
        this.activePolls.clear();
    }
}

/**
 * Progress Display Manager
 */
class ProgressDisplayManager {
    createProgressModal(taskType, totalRecipients) {
        const modalHtml = `
            <div class="modal fade" id="progressModal" tabindex="-1" role="dialog" data-backdrop="static" data-keyboard="false">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Отправка ${taskType === 'sms' ? 'SMS' : 'Email'} уведомлений</h5>
                        </div>
                        <div class="modal-body">
                            <div class="progress mb-3">
                                <div class="progress-bar progress-bar-striped progress-bar-animated"
                                     role="progressbar" style="width: 0%" id="taskProgress">0%</div>
                            </div>
                            <div class="row">
                                <div class="col-md-4">
                                    <small class="text-muted">Всего получателей:</small>
                                    <div><strong id="totalRecipients">${totalRecipients}</strong></div>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">Отправлено:</small>
                                    <div><strong id="successfulSends" class="text-success">0</strong></div>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">Ошибок:</small>
                                    <div><strong id="failedSends" class="text-danger">0</strong></div>
                                </div>
                            </div>
                            <div class="row mt-2">
                                <div class="col-md-6">
                                    <small class="text-muted">Отложено:</small>
                                    <div><strong id="deferredSends" class="text-warning">0</strong></div>
                                </div>
                                <div class="col-md-6">
                                    <small class="text-muted">Статус:</small>
                                    <div><span id="taskStatus" class="badge badge-info">Обработка...</span></div>
                                </div>
                            </div>
                            <div class="mt-3">
                                <small class="text-muted">ID задачи:</small>
                                <div><code id="taskId" style="font-size: 0.8em;"></code></div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="minimizeProgress">Свернуть</button>
                            <button type="button" class="btn btn-primary d-none" id="closeProgress">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        $('#progressModal').remove();
        $('body').append(modalHtml);
        $('#progressModal').modal('show');

        $('#minimizeProgress').on('click', () => {
            $('#progressModal').modal('hide');
            this.createMinimizedNotification();
        });

        $('#closeProgress').on('click', () => $('#progressModal').modal('hide'));
    }

    updateProgress(task) {
        const total = task.total_recipients;
        const completed = task.successful_sends + task.failed_sends + task.deferred_sends;
        const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

        $('#taskProgress').css('width', progressPercent + '%').text(progressPercent + '%');
        $('#successfulSends').text(task.successful_sends);
        $('#failedSends').text(task.failed_sends);
        $('#deferredSends').text(task.deferred_sends);
        $('#taskId').text(task.task_id);

        const statusBadgeConfig = {
            pending: { class: 'badge-secondary', text: 'Ожидание' },
            running: { class: 'badge-info', text: 'Выполняется' },
            completed: { class: 'badge-success', text: 'Завершено' },
            failed: { class: 'badge-danger', text: 'Ошибка' },
            partial: { class: 'badge-warning', text: 'Частично' }
        };

        const config = statusBadgeConfig[task.status] || statusBadgeConfig.pending;
        $('#taskStatus').removeClass().addClass(`badge ${config.class}`).text(config.text);

        if (['completed', 'failed', 'partial'].includes(task.status)) {
            $('#closeProgress').removeClass('d-none');
            $('#minimizeProgress').addClass('d-none');
            $('#taskProgress').removeClass('progress-bar-animated');
        }
    }

    createMinimizedNotification() {
        const notificationHtml = `
            <div id="minimizedProgress" class="alert alert-info alert-dismissible"
                 style="position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 300px;">
                <button type="button" class="close" id="expandProgress">
                    <span>&times;</span>
                </button>
                <strong>Отправка уведомлений</strong><br>
                <small>Задача выполняется в фоновом режиме. Нажмите для просмотра прогресса.</small>
            </div>
        `;

        $('#minimizedProgress').remove();
        $('body').append(notificationHtml);

        $('#expandProgress').on('click', () => {
            $('#minimizedProgress').remove();
            $('#progressModal').modal('show');
        });

        setTimeout(() => $('#minimizedProgress').fadeOut(), 5000);
    }

    showFinalResult(task) {
        const resultConfig = {
            completed: {
                type: 'success',
                message: `Уведомления успешно отправлены. Отправлено: ${task.successful_sends}`
            },
            partial: {
                type: 'warning',
                message: `Уведомления отправлены частично. Успешно: ${task.successful_sends}, ошибок: ${task.failed_sends}`
            },
            failed: {
                type: 'danger',
                message: `Ошибка отправки уведомлений: ${task.error_message || 'Неизвестная ошибка'}`
            },
            timeout: {
                type: 'warning',
                message: task.message || 'Превышено время ожидания'
            }
        };

        const config = resultConfig[task.status] || resultConfig.failed;
        if (task.deferred_sends > 0 && ['completed', 'partial'].includes(task.status)) {
            config.message += `, отложено: ${task.deferred_sends}`;
        }

        UIUtils.showAlert(config.message, config.type);
    }
}

/**
 * Field Management
 */
class FieldManager {
    constructor() {
        this.formFields = {
            priority: '#priorityField',
            incidentStatus: '#incidentStatusField',
            requestCreated: '#incRequestCreatedField',
            incidentDetails: '#incidentDetailsField',
            incImpactStartDate: '#incImpactStartDateField',
            incEndDate: '#incEndDateField',
            incSolutionTime: '#incSolutionTimeField',
            incResumedTime: '#incResumedTimeField',
            priorityin: '#priorityinField',
            incIncreaseTime: '#incIncreaseTimeField'
        };

        this.statusFieldConfig = {
            "": ["priority", "incidentStatus", "requestCreated", "incidentDetails"],
            "Зарегистрирован": ["priority", "incidentStatus", "requestCreated", "incidentDetails"],
            "Устранено влияние": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incImpactStartDate", "incSolutionTime", "incEndDate"],
            "Зарегистрирован/устранено влияние": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incImpactStartDate", "incSolutionTime", "incEndDate"],
            "Возобновлено/устранено влияние": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incResumedTime"],
            "Дополнение/повышен приоритет": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incIncreaseTime", "priorityin"],
            "Возобновлено влияние": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incResumedTime"],
            "Зарегистрирован/повышен приоритет": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incIncreaseTime", "priorityin"],
            "Решен": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incImpactStartDate", "incSolutionTime", "incEndDate"],
            "Дополнение/понижен приоритет": ["priority", "incidentStatus", "requestCreated", "incidentDetails", "incIncreaseTime", "priorityin"],
            "Дополнение": ["priority", "incidentStatus", "requestCreated", "incidentDetails"]
        };
    }

    showOnlyFields(fieldNames) {
        Object.entries(this.formFields).forEach(([fieldName, selector]) => {
            const element = $(selector);
            if (fieldNames.includes(fieldName)) {
                element.addClass('show').show();
            } else {
                element.removeClass('show').hide();
            }
        });
    }

    updateFieldsForStatus(status) {
        const visibleFields = this.statusFieldConfig[status] || this.statusFieldConfig[""];
        this.showOnlyFields(visibleFields);
    }
}

/**
 * API Service
 */
class ApiService {
    static searchIncident(incNumber) {
        return $.ajax({
            url: CONFIG.API.search,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ inc_number: incNumber })
        });
    }

    static loadSubscriptions() {
        return $.ajax({
            url: CONFIG.API.subscriptions,
            method: 'GET'
        });
    }

    static generateMessage(formData) {
        return $.ajax({
            url: CONFIG.API.generateMessage,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(formData)
        });
    }

    static sendSMSAsync(smsData) {
        return $.ajax({
            url: CONFIG.API.sendSMSAsync,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(smsData)
        });
    }

    static sendEmailAsync(emailData) {
        return $.ajax({
            url: CONFIG.API.sendEmailAsync,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(emailData)
        });
    }

    static createTeamsChat(chatData) {
        return $.ajax({
            url: CONFIG.TEAMS_CHAT_URL,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(chatData)
        });
    }

    static getAllTasks() {
        return $.ajax({
            url: CONFIG.API.allTasks,
            method: 'GET'
        });
    }
}

/**
 * Task Dashboard Manager
 */
class TaskDashboard {
    show() {
        const dashboardHtml = `
            <div class="modal fade" id="taskDashboard" tabindex="-1" role="dialog">
                <div class="modal-dialog modal-lg" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Статус задач уведомлений</h5>
                            <button type="button" class="close" data-dismiss="modal">
                                <span>&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div id="taskList">
                                <div class="text-center">
                                    <div class="spinner-border" role="status">
                                        <span class="sr-only">Загрузка...</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Закрыть</button>
                            <button type="button" class="btn btn-info" id="refreshTasks">Обновить</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        $('#taskDashboard').remove();
        $('body').append(dashboardHtml);
        $('#taskDashboard').modal('show');

        this.loadTasks();
        $('#refreshTasks').on('click', () => this.loadTasks());
    }

    loadTasks() {
        ApiService.getAllTasks()
            .done(response => {
                if (response.status === 'success') {
                    this.renderTasks(response.tasks);
                } else {
                    $('#taskList').html('<div class="alert alert-warning">Ошибка загрузки задач</div>');
                }
            })
            .fail(() => {
                $('#taskList').html('<div class="alert alert-danger">Ошибка связи с сервером</div>');
            });
    }

    renderTasks(tasks) {
        if (tasks.length === 0) {
            $('#taskList').html('<div class="alert alert-info">Нет активных задач</div>');
            return;
        }

        let html = '<div class="table-responsive"><table class="table table-sm">';
        html += '<thead><tr><th>ID</th><th>Инцидент</th><th>Тип</th><th>Статус</th><th>Прогресс</th><th>Создана</th></tr></thead><tbody>';

        tasks.forEach(task => {
            const progress = task.total_recipients > 0 ?
                Math.round(((task.successful_sends + task.failed_sends + task.deferred_sends) / task.total_recipients) * 100) : 0;

            const statusBadges = {
                pending: '<span class="badge badge-secondary">Ожидание</span>',
                running: '<span class="badge badge-info">Выполняется</span>',
                completed: '<span class="badge badge-success">Завершено</span>',
                failed: '<span class="badge badge-danger">Ошибка</span>',
                partial: '<span class="badge badge-warning">Частично</span>'
            };

            const statusBadge = statusBadges[task.status] || statusBadges.pending;
            const createdAt = new Date(task.created_at).toLocaleString('ru-RU');

            html += `
                <tr>
                    <td><code style="font-size: 0.7em;">${task.task_id.substring(0, 8)}...</code></td>
                    <td>${task.inc_number}</td>
                    <td>${task.notification_type.toUpperCase()}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="progress" style="height: 15px;">
                            <div class="progress-bar" style="width: ${progress}%">${progress}%</div>
                        </div>
                        <small>${task.successful_sends}/${task.total_recipients}</small>
                    </td>
                    <td><small>${createdAt}</small></td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        $('#taskList').html(html);
    }
}

/**
 * Form Validator
 */
class FormValidator {
    static validateFields(incState) {
        const fields = {
            inc_number: $('#incidentNumber').val(),
            inc_priority: $('#priority').val(),
            inc_creation_time: $('#incRequestCreated').val(),
            inc_impact_start_time: $('#incImpactStartDate').val(),
            inc_impact_end_time: $('#incEndDate').val(),
            inc_impact: $('#Influence').val(),
            inc_reason: $('#сause').val(),
            inc_resolution_time: $('#incSolutionTime').val(),
            inc_resumed_time: $('#incResumedTime').val(),
            inc_priority_increase_time: $('#incIncreaseTime').val(),
            inc_priority_after: $('#priorityin').val()
        };

        if (!fields.inc_number || !incState) {
            return { valid: false, message: "Введите номер инцидента и выберите статус!" };
        }

        const missingFields = this.getMissingFields(incState, fields);

        return {
            valid: missingFields.length === 0,
            message: missingFields.length > 0 ? `Пожалуйста, заполните следующие поля: ${missingFields.join(", ")}` : "",
            fields: fields
        };
    }

    static getMissingFields(incState, fields) {
        const missingFields = [];
        const requiredFieldsMap = {
            "Зарегистрирован": ['inc_creation_time', 'inc_priority', 'inc_impact'],
            "Устранено влияние": ['inc_impact_start_time', 'inc_impact_end_time', 'inc_priority', 'inc_impact', 'inc_reason'],
            "Зарегистрирован/устранено влияние": ['inc_impact_start_time', 'inc_impact_end_time', 'inc_priority', 'inc_impact', 'inc_reason'],
            "Решен": ['inc_impact_start_time', 'inc_impact_end_time', 'inc_priority', 'inc_impact', 'inc_reason', 'inc_resolution_time'],
            "Дополнение": ['inc_priority', 'inc_impact', 'inc_reason']
        };

        const fieldLabels = {
            inc_creation_time: 'время создания инцидента',
            inc_priority: 'приоритет',
            inc_impact: 'влияние',
            inc_impact_start_time: 'время начала влияния',
            inc_impact_end_time: 'время окончания влияния',
            inc_reason: 'причина',
            inc_resolution_time: 'время решения',
            inc_resumed_time: 'время возобновления влияния',
            inc_priority_increase_time: 'время изменения приоритета',
            inc_priority_after: 'новый приоритет'
        };

        const requiredFields = requiredFieldsMap[incState] || [];
        
        if (incState.includes("Возобновлено")) {
            requiredFields.push('inc_resumed_time', 'inc_priority', 'inc_impact', 'inc_reason');
        }
        
        if (incState.includes("приоритет")) {
            requiredFields.push('inc_priority', 'inc_priority_increase_time', 'inc_priority_after', 'inc_impact', 'inc_reason');
        }

        requiredFields.forEach(field => {
            if (!fields[field]) {
                missingFields.push(fieldLabels[field] || field);
            }
        });

        return missingFields;
    }
}

/**
 * UI Utilities
 */
class UIUtils {
    static showLoading(buttonElement = null) {
        $('#loadingOverlay').show();
        if (buttonElement) {
            $(buttonElement).addClass('loading');
            $(buttonElement).find('.spinner-border').removeClass('d-none');
        }
    }

    static hideLoading(buttonElement = null) {
        $('#loadingOverlay').hide();
        if (buttonElement) {
            $(buttonElement).removeClass('loading');
            $(buttonElement).find('.spinner-border').addClass('d-none');
        }
    }

    static showAlert(message, type = 'info', container = '#searchAlerts') {
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="close" data-dismiss="alert">
                    <span>&times;</span>
                </button>
            </div>
        `;
        $(container).html(alertHtml);
    }

    static formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', '');
    }

    static calculateDowntime(startTime, endTime) {
        if (!startTime || !endTime) return '';
        
        const start = new Date(startTime);
        const end = new Date(endTime);
        const totalMinutes = Math.abs(end - start) / 1000 / 60;
        
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = Math.floor(totalMinutes % 60);
        
        const parts = [];
        
        if (days > 0) {
            parts.push(`${days} д.`);
        }
        if (hours > 0) {
            parts.push(`${hours} ч.`);
        }
        if (minutes > 0) {
            parts.push(`${minutes} мин.`);
        }
        
        if (parts.length === 0) {
            const seconds = Math.floor((totalMinutes % 1) * 60);
            parts.push(`${seconds} сек.`);
        }
        
        return parts.join(' ');
    }
}

/**
 * Email Template Generator
 */
class EmailTemplateGenerator {
    static generate(incState, fields, formattedDates, downtime) {
        let emailContent = `
            <table style="width: 100%; border-collapse: collapse; text-align: center;">
                <tr>
                    <td>
                        <table style="max-width: 900px; margin: auto; border-collapse: collapse;background-color: #ffffff ">
                            <tr>
                                <td colspan="3" style="text-align: center; padding: 15px; font-size: 24px; border-bottom: 1px solid #ffd036; font-family: Arial, sans-serif; font-weight: bold;">Коллеги, примите к сведению!</td>
                            </tr>
                            <tr>
                                <td style="width: 250px; padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Статус</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${incState}</td>
                            </tr>
                            <tr>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Номер инцидента</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${fields.inc_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Приоритет</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>`;

        if (incState === "Дополнение/повышен приоритет" || incState === "Зарегистрирован/повышен приоритет") {
            emailContent += `<td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${formattedDates.priority_increase_time} повышен с ${fields.inc_priority_after} до ${fields.inc_priority}</td>`;
        } else if (incState === "Дополнение/понижен приоритет") {
            emailContent += `<td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${formattedDates.priority_increase_time} понижен с ${fields.inc_priority_after} до ${fields.inc_priority}</td>`;
        } else {
            emailContent += `<td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${fields.inc_priority}</td>`;
        }

        emailContent += `
                            </tr>
                            <tr>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Дата и время регистрации</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${formattedDates.creation_time}</td>
                            </tr>`;

        if (incState === "Возобновлено влияние" || incState === "Возобновлено/устранено влияние") {
            emailContent += `
                            <tr>
                                <td style="width: 250px; padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Дата и время возобновления влияния</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${formattedDates.resumed_time}</td>
                            </tr>`;
        }

        if (["Устранено влияние", "Зарегистрирован/устранено влияние", "Решен", "Возобновлено/устранено влияние"].includes(incState)) {
            emailContent += `
                            <tr>
                                <td style="width: 250px; padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Длительность отсутствия сервиса</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">С ${formattedDates.impact_start_time} по ${formattedDates.impact_end_time} (${downtime})</td>
                            </tr>`;
        }

        if (incState === "Решен") {
            emailContent += `
                            <tr>
                                <td style="width: 250px; padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Дата и время решения</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${formattedDates.resolution_time}</td>
                            </tr>`;
        }

        emailContent += `
                            <tr>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Влияние</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${fields.inc_impact}</td>
                            </tr>`;

        if (fields.inc_reason) {
            emailContent += `
                            <tr>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: right;"><strong>Причина</strong></td>
                                <td style="width: 1px; background-color: #ffd036; padding: 0; margin: 0;"></td>
                                <td style="padding: 15px; border-bottom: 1px solid #ffd036; text-align: left;">${fields.inc_reason}</td>
                            </tr>`;
        }

        emailContent += `
                            <tr>
                                <td colspan="3" style="text-align: center; padding: 20px 0; font-size: 14px; color: #8b8b8b;">По всем вопросам можете обращаться в Servicedesk по номеру телефона:</td>
                            </tr>
                            <tr>
                                <td colspan="3" style="text-align: center; padding: 0; font-size: 14px; color: #8b8b8b;"><span style="color: #0563c1;">+7 727 350 0636</span> или <span style="color: #0563c1;">10-111</span></td>
                            </tr>
                            <tr>
                                <td colspan="3" style="text-align: center; padding: 20px 0; font-size: 30px; color: #8b8b8b; font-weight: bold;">Service<span style="color: #ffd036; font-weight: bold;">Desk</span></td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>`;
        
        return emailContent;
    }
}

/**
 * Main Application Controller
 */
class IncidentManagementApp {
    constructor() {
        this.state = new AppStateManager();
        this.taskMonitor = new TaskMonitor();
        this.progressDisplay = new ProgressDisplayManager();
        this.fieldManager = new FieldManager();
        this.taskDashboard = new TaskDashboard();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
        this.setupPageVisibilityHandlers();
    }

    setupEventListeners() {
        // Form submission
        $('#incidentSearchForm').on('submit', (e) => this.handleIncidentSearch(e));
        
        // Field status changes
        $('#incidentStatusFilter').on('change', (e) => {
            this.fieldManager.updateFieldsForStatus($(e.target).val());
        });
        
        // Edit mode toggle
        $('#editRequestCreated').on('change', (e) => {
            const isChecked = $(e.target).is(':checked');
            $('.editable-field').prop('readonly', !isChecked);
        });
        
        // Dropdown management
        $(document).on('change', '.email-checkbox', () => this.updateDropdownText());
        $(document).on('click', (event) => {
            if (!$(event.target).closest('.dropdown').length) {
                $('.dropdown-menu').removeClass('show');
            }
        });
        $('#dropdownMenuButton').on('click', () => {
            $('.dropdown-menu').toggleClass('show');
        });
        
        // Button handlers
        $('#generateMessageButton').on('click', () => this.handleGenerateMessage());
        $('#preview-email-button').on('click', () => this.handlePreviewEmail());
        $('#send-notification-btn').on('click', () => this.handleSendNotificationAsync());
        $('#sendEmailButton').on('click', () => this.handleSendEmailAsync());
        $('#startIncSupportProcess').on('click', () => this.handleCreateTeamsChat());
        
        // Task dashboard
        this.setupTaskDashboardButton();
    }

    setupTaskDashboardButton() {
        if ($('#taskDashboardBtn').length === 0) {
            $('.form-group:has(#send-notification-btn)').append(
                '<button type="button" class="btn btn-info ml-2" id="taskDashboardBtn">Статус задач</button>'
            );
            $('#taskDashboardBtn').on('click', () => this.taskDashboard.show());
        }
    }

    setupPageVisibilityHandlers() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('Page hidden - continuing background polling');
            } else {
                console.log('Page visible - normal polling');
            }
        });

        window.addEventListener('beforeunload', () => {
            this.taskMonitor.stopAllPolling();
        });
    }

    loadInitialData() {
        this.fieldManager.updateFieldsForStatus('');
        
        ApiService.loadSubscriptions()
            .done((subscriptions) => {
                this.state.setSubscriptions(subscriptions);
                this.populateSubscriptionsDropdown(subscriptions);
            })
            .fail(() => {
                UIUtils.showAlert('Ошибка загрузки подписок', 'warning');
            });
    }

    handleIncidentSearch(e) {
        e.preventDefault();
        
        const incNumber = $('#incidentNumber').val().trim();
        if (!incNumber) {
            UIUtils.showAlert('Введите номер инцидента', 'warning');
            return;
        }

        const submitBtn = '#searchBtn';
        UIUtils.showLoading(submitBtn);

        ApiService.searchIncident(incNumber)
            .done((result) => {
                if (result.inc_details) {
                    this.populateIncidentDetails(result);
                    UIUtils.showAlert('Инцидент найден', 'success');
                    this.state.setCurrentIncident(result);
                } else {
                    UIUtils.showAlert('Инцидент не найден', 'warning');
                    this.clearIncidentDetails();
                }
            })
            .fail((xhr) => {
                const response = xhr.responseJSON;
                const message = response ? response.message : 'Ошибка поиска';
                UIUtils.showAlert('Ошибка поиска: ' + message, 'danger');
            })
            .always(() => {
                UIUtils.hideLoading(submitBtn);
            });
    }

    populateIncidentDetails(data) {
        const details = data.inc_details;

        $('#priority').val(details.incPriority || '');
        $('#incidentStatus').val(details.incStatus || '');
        $('#incRequestCreated').val(details.incRequestCreated || '');
        $('#incSolutionTime').val(details.incSolutionTime || '');
        $('#incImpactStartDate').val(details.incImpactStartDate || '');
        $('#incEndDate').val(details.incEndDate || '');
        $('#incidentDetails').val(details.incImpactDetails || '');
        $('#Influence').val(data.influence || '');
        $('#сause').val(data.reason || '');

        $('#incidentDetailsContainer').show();
        $('#textFields').show();
    }

    clearIncidentDetails() {
        $('.editable-field, .inctext').val('');
        $('#incidentDetailsContainer').hide();
    }

    populateSubscriptionsDropdown(subscriptions) {
        const dropdown = $('#subscriptionsDropdown');
        dropdown.empty();

        subscriptions.forEach((subscription) => {
            const item = `
                <div class="form-check dropdown-item">
                    <input type="checkbox" class="form-check-input email-checkbox subs-dropdown-list"
                           id="${subscription.id}" name="email_types[]" value="${subscription.name}">
                    <label class="form-check-label" for="${subscription.id}"
                           data-tooltip="${subscription.description}">${subscription.name}</label>
                </div>
            `;
            dropdown.append(item);
        });
    }

    updateDropdownText() {
        const selectedOptions = [];
        $('.email-checkbox:checked').each(function() {
            const optionText = $(this).next('label').text().trim();
            selectedOptions.push(optionText);
        });

        const newText = selectedOptions.length > 0
            ? selectedOptions.join(', ')
            : 'Выберите тип рассылки';

        $('#dropdownMenuButton').text(newText);
    }

    handleGenerateMessage() {
        const incState = $('#incidentStatusFilter').val();
        const validation = FormValidator.validateFields(incState);

        if (!validation.valid) {
            UIUtils.showAlert(validation.message, 'warning');
            return;
        }

        const button = '#generateMessageButton';
        UIUtils.showLoading(button);

        const messageData = {
            inc_state: incState,
            ...validation.fields
        };

        ApiService.generateMessage(messageData)
            .done((result) => {
                if (result.error) {
                    UIUtils.showAlert('Ошибка генерации сообщения: ' + (result.message || 'Неизвестная ошибка'), 'danger');
                } else {
                    $('#generatedMessage').val(result.message);
                    $('#emailSubject').val(result.email_subject);
                    UIUtils.showAlert('Сообщение сгенерировано успешно', 'success');
                }
            })
            .fail((xhr) => {
                const response = xhr.responseJSON;
                const message = response ? response.message : 'Неизвестная ошибка';
                UIUtils.showAlert('Не удалось сгенерировать сообщение: ' + message, 'danger');
            })
            .always(() => {
                UIUtils.hideLoading(button);
            });
    }

    handleSendNotificationAsync() {
        const selectedValues = [];
        $('.subs-dropdown-list:checked').each(function() {
            selectedValues.push($(this).val());
        });

        const smsNotifText = $('#generatedMessage').val();
        const incNumber = $('#incidentNumber').val();
        const priority = $('#priority').val();

        if (smsNotifText.length === 0) {
            UIUtils.showAlert('Сперва необходимо сгенерировать текст СМС.', 'warning');
            return;
        }

        const button = '#send-notification-btn';
        UIUtils.showLoading(button);

        const smsData = {
            subscriptions: selectedValues,
            sms_text: smsNotifText,
            inc_number: incNumber,
            inc_priority: priority
        };

        ApiService.sendSMSAsync(smsData)
            .done((response) => {
                UIUtils.hideLoading(button);

                if (response.status === 'accepted') {
                    UIUtils.showAlert(`Задача отправки SMS принята в обработку. Получателей: ${response.total_recipients}`, 'info');

                    this.progressDisplay.createProgressModal('sms', response.total_recipients);

                    this.taskMonitor.startPolling(
                        response.task_id,
                        (task) => this.progressDisplay.updateProgress(task),
                        (finalTask) => {
                            this.progressDisplay.updateProgress(finalTask);
                            this.progressDisplay.showFinalResult(finalTask);

                            if (finalTask.status === 'completed' || finalTask.status === 'partial') {
                                this.sendToTeamsChat(incNumber, smsNotifText);
                            }
                        }
                    );
                } else {
                    UIUtils.showAlert('Ошибка отправки SMS: ' + response.message, 'danger');
                }
            })
            .fail((xhr) => {
                UIUtils.hideLoading(button);
                const response = xhr.responseJSON;
                const message = response ? response.message : 'Неизвестная ошибка';
                UIUtils.showAlert('Произошла ошибка: ' + message, 'danger');
            });
    }

    handleSendEmailAsync() {
        const selectedValues = [];
        $('.subs-dropdown-list:checked').each(function() {
            selectedValues.push($(this).val());
        });

        const incState = $('#incidentStatusFilter').val();
        const mailSubject = $('#emailSubject').val();

        if (!incState || !$('#incidentNumber').val()) {
            UIUtils.showAlert('Необходимо выбрать статус и/или номер инцидента.', 'warning');
            return;
        }

        if (!mailSubject) {
            UIUtils.showAlert('Тема письма отсутствует. Нажмите "Сгенерировать сообщение" для формирования темы письма.', 'warning');
            return;
        }

        const validation = FormValidator.validateFields(incState);
        if (!validation.valid) {
            UIUtils.showAlert(validation.message, 'warning');
            return;
        }

        const button = '#sendEmailButton';
        UIUtils.showLoading(button);

        const emailData = {
            inc_state: incState,
            mail_subject: mailSubject,
            subscriptions: selectedValues,
            ...validation.fields
        };

        ApiService.sendEmailAsync(emailData)
            .done((response) => {
                UIUtils.hideLoading(button);

                if (response.status === 'accepted') {
                    UIUtils.showAlert(`Задача отправки Email принята в обработку. Получателей: ${response.total_recipients}`, 'info');
                    $('#previewModal').modal('hide');

                    this.progressDisplay.createProgressModal('email', response.total_recipients);

                    this.taskMonitor.startPolling(
                        response.task_id,
                        (task) => this.progressDisplay.updateProgress(task),
                        (finalTask) => {
                            this.progressDisplay.updateProgress(finalTask);
                            this.progressDisplay.showFinalResult(finalTask);
                        }
                    );
                } else {
                    UIUtils.showAlert('Ошибка отправки Email: ' + response.message, 'danger');
                }
            })
            .fail((xhr) => {
                UIUtils.hideLoading(button);
                const response = xhr.responseJSON;
                const message = response ? response.message : 'Неизвестная ошибка';
                UIUtils.showAlert('Не удалось отправить письмо: ' + message, 'danger');
            });
    }

    handleCreateTeamsChat() {
        const incNumber = $('#incidentNumber').val();
        const chatTopic = `Инцидент ${incNumber}`;
        const smsNotifText = $('#generatedMessage').val();

        if (smsNotifText.length === 0) {
            UIUtils.showAlert('Сперва необходимо сгенерировать текст СМС.', 'warning');
            return;
        }

        const button = '#startIncSupportProcess';
        UIUtils.showLoading(button);

        const chatData = {
            chat_topic: chatTopic,
            inc_id: incNumber,
            message: smsNotifText
        };

        ApiService.createTeamsChat(chatData)
            .done((data) => {
                if (data.status === "success") {
                    UIUtils.showAlert(data.message, 'success');
                } else {
                    UIUtils.showAlert('Ошибка создания чата: ' + (data.message || 'Неизвестная ошибка'), 'danger');
                }
            })
            .fail(() => {
                UIUtils.showAlert('Не удалось создать чат', 'danger');
            })
            .always(() => {
                UIUtils.hideLoading(button);
            });
    }

    handlePreviewEmail() {
        const incState = $('#incidentStatusFilter').val();
        const validation = FormValidator.validateFields(incState);

        if (!validation.valid) {
            UIUtils.showAlert(validation.message, 'warning');
            return;
        }

        const fields = validation.fields;
        const downtime = UIUtils.calculateDowntime(fields.inc_impact_start_time, fields.inc_impact_end_time);

        const formattedDates = {
            creation_time: UIUtils.formatDate(fields.inc_creation_time),
            impact_start_time: UIUtils.formatDate(fields.inc_impact_start_time),
            impact_end_time: UIUtils.formatDate(fields.inc_impact_end_time),
            resolution_time: UIUtils.formatDate(fields.inc_resolution_time),
            resumed_time: UIUtils.formatDate(fields.inc_resumed_time),
            priority_increase_time: UIUtils.formatDate(fields.inc_priority_increase_time)
        };

        const emailContent = EmailTemplateGenerator.generate(incState, fields, formattedDates, downtime);
        $('#email-preview-content').html(emailContent);
        $('#previewModal').modal('show');
    }

    sendToTeamsChat(incNumber, message) {
        const chatData = {
            chat_topic: `Инцидент ${incNumber}`,
            inc_id: incNumber,
            message: message
        };

        ApiService.createTeamsChat(chatData)
            .done((data) => {
                if (data.status === "success") {
                    console.log('Teams chat created successfully');
                } else {
                    console.log('Teams chat creation failed:', data.message);
                }
            })
            .fail(() => {
                console.log('Failed to create Teams chat');
            });
    }
}

// Initialize the application when DOM is ready
$(document).ready(() => {
    window.incidentApp = new IncidentManagementApp();
});