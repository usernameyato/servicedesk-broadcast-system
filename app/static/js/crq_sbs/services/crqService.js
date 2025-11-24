import { NotificationManager } from '../utils/notificationManager.js';

/*
// Класс обработки событий модальных форм CTQ
*/
export class CrqService {
    constructor(apiClient, stateManager) {
        this.api = apiClient;
        this.state = stateManager;
    }

    async loadCrqs(filters = {}) {
        try {
            this.state.setCalendarLoading(true);
            this.state.clearError();

            const response = await this.api.getCrqs(filters);
            this.state.setCrqs(response.grouped_crq_list);
            
            return response.data;
        } catch (error) {
            this.state.setError(error.message);
            throw error;
        } finally {
            this.state.setCalendarLoading(false);
        }
    }

    async loadCrq(crqNumber, source = 'processed') {
        try {
            this.state.setModalLoading(true);
            this.state.clearError();

            const response = await this.api.getCrq(crqNumber, source);
            this.state.setCurrentCrq(response.data);
            
            return response.data;
        } catch (error) {
            this.state.setError(error.message);
            throw error;
        } finally {
            this.state.setModalLoading(false);
        }
    }

    async createCrq(crqData) {
        try {
            this.state.setModalLoading(true);
            this.state.clearError();

            const response = await this.api.createCrq(crqData);
            this.state.addCrq(response.data);
            
            NotificationManager.showSuccess('CRQ создан успешно');
            
            return response.data;
        } catch (error) {
            this.state.setError(error.message);
            NotificationManager.showError(`Ошибка создания CRQ: ${error.message}`);
            throw error;
        } finally {
            this.state.setModalLoading(false);
        }
    }

    async updateCrq(crqNumber, crqData) {
        try {
            this.state.setModalLoading(true);
            this.state.clearError();

            const response = await this.api.updateCrq(crqNumber, crqData);
            this.state.updateCrq(crqNumber, response.data);
            
            NotificationManager.showSuccess('CRQ обновлен успешно');
            
            return response.data;
        } catch (error) {
            this.state.setError(error.message);
            NotificationManager.showError(`Ошибка обновления CRQ: ${error.message}`);
            throw error;
        } finally {
            this.state.setModalLoading(false);
        }
    }

    async deleteCrq(crqNumber) {
        try {
            this.state.setModalLoading(true);
            this.state.clearError();

            await this.api.deleteCrq(crqNumber);
            this.state.deleteCrq(crqNumber);
            
            NotificationManager.showSuccess('CRQ удален успешно');
        } catch (error) {
            this.state.setError(error.message);
            NotificationManager.showError(`Ошибка удаления CRQ: ${error.message}`);
            throw error;
        } finally {
            this.state.setModalLoading(false);
        }
    }
}