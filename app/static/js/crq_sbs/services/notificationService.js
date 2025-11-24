import { NotificationManager } from '../utils/notificationManager.js';

/*
// Класс обработки событий оповещения (превью/отарвка почты)
*/
export class NotificationService {
    constructor(apiClient, stateManager) {
        this.api = apiClient;
        this.state = stateManager;
    }

    async sendUsersEmail(emailData) {
        try {
            this.state.setModalLoading(true);
            
            const result = await this.api.sendEmail('users', emailData);
            NotificationManager.showSuccess('Письмо пользователям отправлено успешно');
            
            return result;
        } catch (error) {
            NotificationManager.showError(`Ошибка отправки письма: ${error.message}`);
            throw error;
        } finally {
            this.state.setModalLoading(false);
        }
    }

    async sendPartnersEmail(emailData) {
        try {
            this.state.setModalLoading(true);
            
            const result = await this.api.sendEmail('partners', emailData);
            NotificationManager.showSuccess('Письмо партнерам отправлено успешно');
            
            return result;
        } catch (error) {
            NotificationManager.showError(`Ошибка отправки письма: ${error.message}`);
            throw error;
        } finally {
            this.state.setModalLoading(false);
        }
    }

    async previewEmail(template, data) {
        try {
            return await this.api.previewEmail(template, data);
        } catch (error) {
            NotificationManager.showError(`Ошибка предпросмотра: ${error.message}`);
            throw error;
        }
    }
}