import { BaseModal } from './modalComponent.js';
import { NotificationManager } from '../utils/notificationManager.js';

export class EmailPreviewModal extends BaseModal {
    constructor(modalId, stateManager, notificationService, apiClient) {
        super(modalId, stateManager);
        this.notificationService = notificationService;
        this.api = apiClient
        
        this.bindSendEvent();
    }

    bindSendEvent() {
        const sendButton = this.modal.querySelector('[id*="sendEmail"]');
        if (sendButton) {
            sendButton.addEventListener('click', (e) => this.handleSendEmail(e));
        }
    }

    async handleSendEmail(event) {
        const button = event.currentTarget;
        const originalText = button.textContent;
        
        try {
            button.disabled = true;
            button.textContent = 'Отправка...';
            button.classList.add('loading');
            
            // Определение типа рассылки письма по ID модального окна
            const isUsersEmail = this.modalId.includes('user');
            const template = isUsersEmail ? 'users' : 'partners';
            
            let emailData;
            if (isUsersEmail) {
                // Получение данных с модального окна
                const editModal = window.app.getComponent('editCrqModal');
                emailData = editModal.prepareEmailData();
            } else {
                const partnersModal = window.app.getComponent('partnersModal');
                emailData = partnersModal.prepareEmailData();
            }
            
            if (!emailData) return;
            
            await this.api.sendEmail(template, emailData);
            
            NotificationManager.showSuccess('Письмо успешно отправлено');
            this.close();
            
        } catch (error) {
            NotificationManager.showError(`Ошибка отправки письма: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
            button.classList.remove('loading');
        }
    }
}