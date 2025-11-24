import { BaseModal } from './modalComponent.js';
import { NotificationManager } from '../utils/notificationManager.js';

/*
// Класс обработки событий модального окна рассылки партнерам
*/
export class PartnersModal extends BaseModal {
    constructor(stateManager, notificationService, apiClient) {
        super('partnersModal', stateManager, '.partner-button');
        this.notificationService = notificationService;
        this.api = apiClient;
        
        this.bindFormEvents();
    }

    getTabContainerName() {
        return '';
    }

    getTabName() {
        return '';
    }

    getCheckboxClass() {
        return '';
    }

    getFormPrefix() {
        return 'partners';
    }

    getFileCollection() {
        return '';
    }

    bindFormEvents() {
        // Перехват событий изменения типа сервиса
        const serviceSelect = this.modal.querySelector('#partnerModalServiceType');
        serviceSelect.addEventListener('change', () => this.updateTextField());

        // Перехват событий изменения дат
        const startDateInput = this.modal.querySelector('#partnerModalStartDate');
        const endDateInput = this.modal.querySelector('#partnerModalEndDate');
        
        startDateInput.addEventListener('change', () => this.updateTextField());
        endDateInput.addEventListener('change', () => this.updateTextField());

        // Перехват события нажатия на кнопку превью почтового письма
        const previewButton = this.modal.querySelector('#previewPartnersEmail');
        previewButton.addEventListener('click', () => this.handleEmailPreview());
    }

    async onOpen () {
        const selectElement = this.modal.querySelector('#partnerModalGroupname');
    
        try {
            const data = await this.api.getPartnerGroups();
            
            const optionsHTML = '<option value="" disabled selected>Выберите группу...</option>' +
                (data.status === 'success' && data.groups ? 
                    data.groups.map(group => `<option value="${group.groupname}">${group.groupname}</option>`).join('') : 
                    '');
            
            selectElement.innerHTML = optionsHTML;
        } catch (error) {
            selectElement.innerHTML = '<option value="" disabled selected>Ошибка загрузки групп</option>';
            console.error('Failed to load partner groups:', error);
        }
    }

    updateTextField() {
        const serviceType = this.modal.querySelector('#partnerModalServiceType').value;
        const startDate = this.formatDate(this.modal.querySelector('#partnerModalStartDate').value);
        const endDate = this.formatDate(this.modal.querySelector('#partnerModalEndDate').value);
        
        const textField = this.modal.querySelector('#partnerModalTextletter');
        const newText = `Уважаемый Партнер!\n\nПросьба принять к сведению, что в связи с плановыми работами, проводимыми на стороне Кар-Тел, c ${startDate || '(дата начала)'} до ${endDate || '(дата окончания)'} (UTC+5) возможно влияние на сервис ${serviceType || '(выбранный сервис)'}.`;
        
        textField.value = newText;
    }

    formatDate(dateString) {
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

    async handleEmailPreview() {
        const emailData = this.prepareEmailData();
        if (!emailData) return;

        try {
            const preview = await this.api.previewEmail('partners', emailData);
            
            // Открытие модального окна превью почтового письма
            const previewModal = document.getElementById('partnersNotifPreviewModal');
            const previewBody = previewModal.querySelector('#partnersNotifPreviewBody');
            previewBody.innerHTML = preview.content;
            
            const bootstrapPreviewModal = new bootstrap.Modal(previewModal);
            bootstrapPreviewModal.show();
        } catch (error) {
            NotificationManager.showError(`Ошибка генерации предпросмотра: ${error.message}`);
        }
    }

    prepareEmailData() {
        const textLetter = this.modal.querySelector('#partnerModalTextletter').value.trim();
        const partnerGroup = this.modal.querySelector('#partnerModalGroupname').value.trim();

        if (!textLetter) {
            NotificationManager.showError('Поле "Текст письма" обязательно к заполнению');
            return null;
        }

        if (!partnerGroup) {
            NotificationManager.showError('Поле "Группа партнера" обязательно к заполнению');
            return null;
        }

        return {
            textLetter,
            partnerGroup
        };
    }
}