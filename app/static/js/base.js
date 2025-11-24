class NavigationManager {
    constructor() {
        this.menuToggle = document.getElementById('menuToggle');
        this.expandableMenu = document.getElementById('expandableMenu');
        this.isMenuOpen = false;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        if (!this.menuToggle || !this.expandableMenu) {
            console.warn('Navigation elements not found');
            return;
        }

        this.menuToggle.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleMenu();
        });

        document.addEventListener('click', (e) => this.handleOutsideClick(e));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMenuOpen) {
                this.closeMenu();
            }
        });

        this.expandableMenu.addEventListener('click', (e) => {
            if (e.target.classList.contains('menu-link')) {
                if (!e.target.href.includes('#')) {
                    this.closeMenu();
                }
            }
        });

        const navbarToggler = document.querySelector('.navbar-toggler');
        if (navbarToggler) {
            navbarToggler.addEventListener('click', () => {
                if (this.isMenuOpen) {
                    this.closeMenu();
                }
            });
        }
    }

    toggleMenu() {
        if (this.isMenuOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        this.expandableMenu.classList.add('show');
        this.menuToggle.classList.add('active');
        this.menuToggle.setAttribute('aria-expanded', 'true');
        this.expandableMenu.setAttribute('aria-hidden', 'false');

        this.isMenuOpen = true;

        const firstMenuItem = this.expandableMenu.querySelector('.menu-link');
        if (firstMenuItem) {
            setTimeout(() => {
                firstMenuItem.focus();
            }, 100);
        }

        this.debug('Menu opened');
    }

    closeMenu() {
        this.expandableMenu.classList.remove('show');
        this.menuToggle.classList.remove('active');
        this.menuToggle.setAttribute('aria-expanded', 'false');
        this.expandableMenu.setAttribute('aria-hidden', 'true');

        this.isMenuOpen = false;

        this.debug('Menu closed');
    }

    handleOutsideClick(event) {
        if (this.isMenuOpen &&
            !this.expandableMenu.contains(event.target) &&
            !this.menuToggle.contains(event.target)) {
            this.closeMenu();
        }
    }

    debug(message, data = null) {
        if (console && console.log) {
            console.log(`[NavigationManager] ${message}`, data);
        }
    }
}


class GlobalUtils {
    /**
     * Escape HTML to prevent XSS attacks
     * @param {string} text - Text to escape
     * @returns {string} - Escaped HTML
     */
    static escapeHtml(text) {
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

    /**
     * Show loading state for any button
     * @param {HTMLElement} button - Button element
     * @param {boolean} isLoading - Loading state
     * @param {string} loadingText - Text to show while loading
     */
    static setButtonLoading(button, isLoading, loadingText = 'Загрузка...') {
        if (!button) return;

        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }

        button.disabled = isLoading;

        if (isLoading) {
            button.innerHTML = `
                <span class="spinner-border spinner-border-sm mr-1" role="status" aria-hidden="true"></span>
                ${loadingText}
            `;
        } else {
            button.textContent = button.dataset.originalText;
        }
    }

    /**
     * Debounce function to limit API calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Simple toast notification (alternative to complex notification system)
     * @param {string} message - Message to show
     * @param {string} type - Type: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in milliseconds
     */
    static showToast(message, type = 'info', duration = 5000) {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.simple-toast');
        existingToasts.forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `simple-toast simple-toast-${type}`;
        toast.textContent = message;

        // Toast styles
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '9999',
            maxWidth: '350px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            cursor: 'pointer'
        });

        // Type-specific colors
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        toast.style.backgroundColor = colors[type] || colors.info;

        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Auto remove
        const removeToast = () => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        };

        // Click to dismiss
        toast.addEventListener('click', removeToast);

        // Auto dismiss
        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
    }

    /**
     * Format date to localized string
     * @param {Date|string} date - Date to format
     * @param {string} locale - Locale (default: 'ru-RU')
     * @returns {string} - Formatted date
     */
    static formatDate(date, locale = 'ru-RU') {
        if (!date) return '';

        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return '';

        return dateObj.toLocaleDateString(locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

/**
 * Initialize Base Functionality
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize navigation
    const navigationManager = new NavigationManager();

    // Make utilities available globally
    window.GlobalUtils = GlobalUtils;

    // Make navigation manager available for debugging
    if (window.console) {
        window.navigationManager = navigationManager;
    }

    // Enhanced form validation (Bootstrap 4 style)
    const forms = document.querySelectorAll('.needs-validation');
    forms.forEach(form => {
        form.addEventListener('submit', function(event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        });
    });

    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(alert => {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.opacity = '0';
                alert.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    if (alert.parentNode) {
                        alert.remove();
                    }
                }, 300);
            }
        }, 5000);
    });
});