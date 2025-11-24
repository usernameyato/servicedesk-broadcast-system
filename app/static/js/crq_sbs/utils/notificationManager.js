/*
// Класс менеджера оповещений
// Показывает/скрывает статусы обработки событий модуля
*/
export class NotificationManager {
    static container = null;

    static init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }
    }

    static show(message, type = 'info', duration = 5000) {
        this.init();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const content = document.createElement('div');
        content.className = 'notification-content';
        content.textContent = message;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.remove(notification);
        
        notification.appendChild(content);
        notification.appendChild(closeBtn);
        this.container.appendChild(notification);

        setTimeout(() => this.remove(notification), duration);

        requestAnimationFrame(() => {
            notification.classList.add('notification-show');
        });

        return notification;
    }

    static remove(notification) {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    static showSuccess(message, duration) {
        return this.show(message, 'success', duration);
    }

    static showError(message, duration) {
        return this.show(message, 'error', duration);
    }

    static showWarning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    static showInfo(message, duration) {
        return this.show(message, 'info', duration);
    }
}