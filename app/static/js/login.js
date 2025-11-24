class LoginManager {
    constructor() {
        this.form = document.getElementById('loginForm');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.loginBtn = document.getElementById('loginBtn');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.btnText = document.getElementById('btnText');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        this.usernameInput.addEventListener('input', () => this.clearFieldError('username'));
        this.passwordInput.addEventListener('input', () => this.clearFieldError('password'));
    }

    async handleSubmit(event) {
        event.preventDefault();
        
        this.clearAllErrors();
        
        const formData = {
            username: this.usernameInput.value.trim(),
            password: this.passwordInput.value
        };

        if (!this.validateForm(formData)) {
            return;
        }

        this.setLoadingState(true);

        try {
            const response = await this.submitLogin(formData);
            
            if (response.success) {
                this.showNotification('Вход выполнен успешно! Перенаправление...', 'success');
                setTimeout(() => {
                    window.location.href = response.redirect || '/dashboard';
                }, 1000);
            } else {
                this.handleLoginError(response);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Произошла ошибка. Попробуйте снова.', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    async submitLogin(formData) {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    }

    validateForm(formData) {
        let isValid = true;

        if (!formData.username) {
            this.showFieldError('username', 'Имя пользователя обязательно');
            isValid = false;
        }

        if (!formData.password) {
            this.showFieldError('password', 'Пароль обязателен');
            isValid = false;
        }

        return isValid;
    }

    handleLoginError(response) {
        if (response.errors) {
            Object.keys(response.errors).forEach(field => {
                const errors = response.errors[field];
                if (errors && errors.length > 0) {
                    this.showFieldError(field, errors[0]);
                }
            });
        } else {
            this.showNotification(response.message || 'Неверные учетные данные', 'error');
        }
    }

    showFieldError(fieldName, message) {
        const input = document.getElementById(fieldName);
        const errorElement = document.getElementById(`${fieldName}Error`);
        
        if (input) {
            input.classList.add('error');
        }
        
        if (errorElement) {
            errorElement.textContent = message;
        }
    }

    clearFieldError(fieldName) {
        const input = document.getElementById(fieldName);
        const errorElement = document.getElementById(`${fieldName}Error`);
        
        if (input) {
            input.classList.remove('error');
        }
        
        if (errorElement) {
            errorElement.textContent = '';
        }
    }

    clearAllErrors() {
        ['username', 'password'].forEach(field => {
            this.clearFieldError(field);
        });
    }

    setLoadingState(isLoading) {
        this.loginBtn.disabled = isLoading;
        
        if (isLoading) {
            this.loadingSpinner.style.display = 'inline-block';
            this.btnText.textContent = 'Входим...';
        } else {
            this.loadingSpinner.style.display = 'none';
            this.btnText.textContent = 'Войти';
        }
    }

    showNotification(message, type = 'success') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});