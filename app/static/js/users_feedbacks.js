class FeedbackResponseManager {
    constructor() {
        this.table = document.querySelector('.table');
        this.responseForm = document.getElementById('response-form');
        this.feedbackIdInput = document.getElementById('feedback-id');
        this.responseTextInput = document.getElementById('response-text');
        this.submitBtn = document.getElementById('submit-response');
        this.responseModal = $('#responseModal');
        this.alertContainer = document.getElementById('alert-container');

        this.originalBtnText = this.submitBtn ? this.submitBtn.textContent : 'Отправить';

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        if (this.table) {
            this.table.addEventListener('click', (e) => this.handleTableClick(e));
        }

        if (this.responseForm) {
            this.responseForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        if (this.responseModal.length) {
            this.responseModal.on('hidden.bs.modal', () => this.resetForm());
        }

        document.addEventListener('click', (e) => this.handleNotificationClose(e));
    }

    handleTableClick(event) {
        const target = event.target;

        if (target.classList.contains('response-btn') || target.classList.contains('edit-btn')) {
            event.preventDefault();
            const feedbackId = target.dataset.feedbackId;
            const response = target.dataset.response || '';

            this.openResponseModal(feedbackId, response);
        }
    }

    openResponseModal(feedbackId, response = '') {
        if (this.feedbackIdInput) {
            this.feedbackIdInput.value = feedbackId;
        }

        if (this.responseTextInput) {
            this.responseTextInput.value = response;
            this.responseTextInput.focus();
        }

        if (this.responseModal.length) {
            this.responseModal.modal('show');
        }
    }

    async handleSubmit(event) {
        event.preventDefault();

        const formData = {
            feedback_id: this.feedbackIdInput?.value,
            response: this.responseTextInput?.value.trim()
        };

        if (!this.validateForm(formData)) {
            return;
        }

        this.setLoadingState(true);

        try {
            const response = await this.submitResponse(formData);

            if (response.success) {
                this.updateFeedbackRow(formData.feedback_id, formData.response);
                this.closeModal();
                this.showNotification('Ответ успешно сохранен!', 'success');
            } else {
                this.showNotification(response.error || 'Произошла ошибка при сохранении ответа', 'error');
            }
        } catch (error) {
            console.error('Response submission error:', error);
            this.showNotification('Произошла ошибка при отправке запроса', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    async submitResponse(formData) {
        const formDataObj = new FormData();
        formDataObj.append('feedback_id', formData.feedback_id);
        formDataObj.append('response', formData.response);

        const response = await fetch('/admin/api/feedbacks/reply', {
            method: 'POST',
            body: formDataObj,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    validateForm(formData) {
        if (!formData.feedback_id) {
            this.showNotification('Ошибка: ID отзыва не найден', 'error');
            return false;
        }

        if (!formData.response) {
            this.showNotification('Пожалуйста, введите ответ', 'error');
            if (this.responseTextInput) {
                this.responseTextInput.focus();
            }
            return false;
        }

        if (formData.response.length > 1000) {
            this.showNotification('Ответ слишком длинный. Максимум 1000 символов', 'error');
            return false;
        }

        return true;
    }

    updateFeedbackRow(feedbackId, responseText) {
        const row = document.getElementById(`feedback-row-${feedbackId}`);
        if (!row) {
            console.error(`Row with ID feedback-row-${feedbackId} not found`);
            return;
        }

        const responseCell = document.getElementById(`response-cell-${feedbackId}`);
        const actionCell = row.querySelector('td:last-child');

        if (responseCell) {
            responseCell.innerHTML = this.escapeHtml(responseText);
            responseCell.classList.remove('text-muted', 'font-italic');
        }

        if (actionCell) {
            actionCell.innerHTML = `
                <button id="edit-btn-${feedbackId}"
                        class="btn btn-secondary edit-btn"
                        data-feedback-id="${feedbackId}"
                        data-response="${this.escapeHtml(responseText)}"
                        title="Редактировать ответ">
                    Редактировать
                </button>
            `;
        }
    }

    closeModal() {
        if (this.responseModal.length) {
            this.responseModal.modal('hide');
        }
    }

    resetForm() {
        if (this.responseForm) {
            this.responseForm.reset();
        }

        if (this.responseTextInput) {
            this.responseTextInput.classList.remove('is-invalid');
        }
    }

    setLoadingState(isLoading) {
        if (!this.submitBtn) return;

        this.submitBtn.disabled = isLoading;

        if (isLoading) {
            this.submitBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Отправка...
            `;
        } else {
            this.submitBtn.textContent = this.originalBtnText;
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

    debug(message, data = null) {
        if (console && console.log) {
            console.log(`[FeedbackResponseManager] ${message}`, data);
        }
    }
}

$(document).ready(function() {
    const manager = new FeedbackResponseManager();

    if (window.console) {
        window.feedbackManager = manager;
    }
});