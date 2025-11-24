class FeedbackFormManager {
    constructor() {
        this.feedbackBtn = document.getElementById('feedbackBtn');
        this.feedbackForm = document.getElementById('feedbackForm');
        this.feedbackFormElement = document.getElementById('feedbackFormElement');
        this.successMessage = document.getElementById('successMessage');
        this.submitBtn = document.getElementById('submitBtn');
        this.messageTextarea = document.getElementById('feedbackMessage');
        
        this.isFormOpen = false;
        this.isSubmitting = false;
        this.originalBtnText = this.submitBtn ? this.submitBtn.textContent : 'Отправить отзыв';

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        if (!this.feedbackBtn || !this.feedbackForm) {
            console.warn('Feedback form elements not found');
            return;
        }

        this.feedbackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleForm();
        });

        document.addEventListener('click', (e) => this.handleOutsideClick(e));

        if (this.feedbackFormElement) {
            this.feedbackFormElement.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFormOpen) {
                this.closeForm();
            }
        });

        if (this.messageTextarea) {
            this.messageTextarea.addEventListener('input', () => this.updateCharacterCount());
        }
    }

    toggleForm() {
        if (this.isFormOpen) {
            this.closeForm();
        } else {
            this.openForm();
        }
    }

    openForm() {
        if (this.isSubmitting) return;

        this.feedbackForm.classList.add('show');
        this.feedbackBtn.classList.add('active');
        this.feedbackBtn.innerHTML = '✕';
        this.feedbackBtn.setAttribute('aria-label', 'Закрыть форму отзыва');
        this.feedbackForm.setAttribute('aria-hidden', 'false');

        this.isFormOpen = true;

        if (this.messageTextarea) {
            setTimeout(() => {
                this.messageTextarea.focus();
            }, 300);
        }

        this.debug('Form opened');
    }

    closeForm() {
        this.feedbackForm.classList.remove('show');
        this.feedbackBtn.classList.remove('active');
        this.feedbackBtn.innerHTML = '💬';
        this.feedbackBtn.setAttribute('aria-label', 'Открыть форму отзыва');
        this.feedbackForm.setAttribute('aria-hidden', 'true');

        this.isFormOpen = false;
        this.hideSuccessMessage();

        this.debug('Form closed');
    }

    handleOutsideClick(event) {
        if (this.isFormOpen &&
            !this.feedbackForm.contains(event.target) &&
            !this.feedbackBtn.contains(event.target)) {
            this.closeForm();
        }
    }

    async handleSubmit(event) {
        event.preventDefault();

        if (this.isSubmitting) return;

        const formData = new FormData(this.feedbackFormElement);
        const data = {
            feedback_type: formData.get('feedback_type') || 'general',
            message: formData.get('message')?.trim()
        };

        if (!this.validateForm(data)) {
            return;
        }

        this.setLoadingState(true);

        try {
            const result = await this.submitFeedback(data);

            if (result.success) {
                this.showSuccessMessage();
                this.debug('Feedback submitted successfully');
            } else {
                this.showError(result.error || 'Ошибка при отправке отзыва. Попробуйте еще раз.');
            }
        } catch (error) {
            console.error('Feedback submission error:', error);
            this.showError('Произошла ошибка при отправке запроса. Проверьте подключение к интернету.');
        } finally {
            this.setLoadingState(false);
        }
    }

    validateForm(data) {
        if (!data.message || data.message.length === 0) {
            this.showError('Пожалуйста, введите ваш отзыв');
            if (this.messageTextarea) {
                this.messageTextarea.focus();
                this.messageTextarea.classList.add('is-invalid');
            }
            return false;
        }

        if (data.message.length > 1000) {
            this.showError('Отзыв слишком длинный. Максимум 1000 символов');
            if (this.messageTextarea) {
                this.messageTextarea.focus();
                this.messageTextarea.classList.add('is-invalid');
            }
            return false;
        }

        if (this.messageTextarea) {
            this.messageTextarea.classList.remove('is-invalid');
        }

        return true;
    }

    async submitFeedback(data) {
        const response = await fetch('/api/feedback/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    showSuccessMessage() {
        this.successMessage.classList.add('show');
        this.successMessage.style.display = 'block';
        this.feedbackFormElement.style.display = 'none';

        setTimeout(() => {
            this.closeForm();
            setTimeout(() => {
                this.hideSuccessMessage();
                this.resetForm();
            }, 300);
        }, 3000);
    }

    hideSuccessMessage() {
        this.successMessage.classList.remove('show');
        this.successMessage.style.display = 'none';
        this.feedbackFormElement.style.display = 'block';
    }

    showError(message) {
        alert(message);
    }

    resetForm() {
        if (this.feedbackFormElement) {
            this.feedbackFormElement.reset();
        }

        if (this.messageTextarea) {
            this.messageTextarea.classList.remove('is-invalid');
        }

        this.setLoadingState(false);
        this.updateCharacterCount();
    }

    setLoadingState(isLoading) {
        if (!this.submitBtn) return;

        this.isSubmitting = isLoading;
        this.submitBtn.disabled = isLoading;

        if (isLoading) {
            this.submitBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm mr-1" role="status" aria-hidden="true"></span>
                Отправка...
            `;
        } else {
            this.submitBtn.innerHTML = `
                <i class="fas fa-paper-plane mr-1" aria-hidden="true"></i>
                ${this.originalBtnText}
            `;
        }
    }

    updateCharacterCount() {
        if (!this.messageTextarea) return;

        const currentLength = this.messageTextarea.value.length;
        const maxLength = 1000;

        let counter = document.getElementById('char-counter');
        if (!counter) {
            counter = document.createElement('small');
            counter.id = 'char-counter';
            counter.className = 'form-text text-muted d-block text-right mt-1';
            this.messageTextarea.parentNode.appendChild(counter);
        }

        counter.textContent = `${currentLength}/${maxLength}`;

        if (currentLength > maxLength * 0.9) {
            counter.className = 'form-text text-warning d-block text-right mt-1';
        } else if (currentLength > maxLength) {
            counter.className = 'form-text text-danger d-block text-right mt-1';
        } else {
            counter.className = 'form-text text-muted d-block text-right mt-1';
        }
    }

    debug(message, data = null) {
        if (console && console.log) {
            console.log(`[FeedbackFormManager] ${message}`, data);
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const feedbackManager = new FeedbackFormManager();

    if (window.console) {
        window.feedbackFormManager = feedbackManager;
    }
});