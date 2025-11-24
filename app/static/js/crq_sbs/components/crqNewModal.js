import { BaseModal } from './modalComponent.js';
import { NotificationManager } from '../utils/notificationManager.js';

export class CrqNewModal extends BaseModal {
    constructor(state, crqService, apiClient) {
        super('newCrqModal', state, '.add-crq-button');
        this.crqService = crqService;
        this.api = apiClient;
        
        this.tabConfig = {
            overview: { button: 'newCrqOverviewTab', content: 'newCrqOverviewContent' },
            impact: { button: 'newCrqImpactTab', content: 'newCrqImpactContent'},
            communication: { button: 'newCrqCommunicationTab', content: 'newCrqCommunicationContent' }
        };
        
        this.validationConfig = {
            requiredFields: [
                'newCrqNumber', 'newCrqStatus', 'newCrqInitiator', 'newCrqDirection', 
                'newCrqImpact', 'newCrqShortDescription', 'newCrqDetailedDescription',
                'newCrqImpactDetails', 'newCrqCause',
                'newCrqStartDate', 'newCrqEndDate', 'newCrqWorkType'
            ],
            validationRules: {
                'newCrqNumber': { 
                    pattern: /^CRQ\d+$/, 
                    message: 'Номер CRQ должен начинаться с "CRQ" и содержать только цифры' 
                },
                'newCrqStartDate': { 
                    validate: (value) => this.validateStartDate(value),
                    message: 'Дата начала не может быть позже даты завершения'
                },
                'newCrqEndDate': {
                    validate: (value) => this.validateEndDate(value),
                    message: 'Дата завершения не может быть раньше даты начала'
                }
            }
        };
        
        this.bindFormEvents();
    }

    // Required abstract method implementations
    getTabContainerName() {
        return 'newCrq';
    }

    getTabName() {
        return 'new-crq';
    }

    getCheckboxClass() {
        return 'new-crq-subs-checkbox';
    }

    getFormPrefix() {
        return 'newCrq';
    }

    getFileCollection() {
        return 'newCrqFiles';
    }

    bindFormEvents() {
        // Bind subscription events
        this.bindSubscriptionEvents();

        // Bind CRQ search functionality
        const findButton = this.modal.querySelector('#findCrq');
        if (findButton) {
            findButton.addEventListener('click', () => this.handleCrqSearch());
        }

        // Bind save functionality
        const saveButton = this.modal.querySelector('#addCrq');
        if (saveButton) {
            saveButton.addEventListener('click', () => this.handleSave());
        }

        // Initialize file upload and field validation
        this.initializeFileUpload();
        this.initializeFieldValidation();
    }

    async onOpen() {
        try {
            this.showLoadingState('newCrqSubscriptionsDropdown');
            this.initializeTabs();
            
            const subscriptions = await this.api.getSubscriptions();
            
            this.hideLoadingState();
            this.state.setSubscriptions(subscriptions);
            this.populateSubscriptionsDropdown(subscriptions, 'newCrqSubscriptionsDropdown');
            
            this.resetForm();
            
        } catch (error) {
            this.hideLoadingState();
            NotificationManager.showError(`Ошибка загрузки подписок: ${error.message}`);
        }
    }

    async handleCrqSearch() {
        const crqNumberInput = this.modal.querySelector('#newCrqNumber');
        const crqNumber = crqNumberInput.value.trim();
        
        if (!crqNumber) {
            this.showFieldError(crqNumberInput, 'Пожалуйста, введите номер плановых работ');
            NotificationManager.showWarning('Пожалуйста, введите номер плановых работ');
            return;
        }

        try {
            const crqData = await this.crqService.loadCrq(crqNumber, 'raw');
            this.populateFormFromCrqData(crqData);
            this.removeFieldError(crqNumberInput);
            NotificationManager.showSuccess('CRQ найден и загружен');
        } catch (error) {
            this.showFieldError(crqNumberInput, 'CRQ не найден');
            NotificationManager.showError(`Ошибка поиска CRQ: ${error.message}`);
        }
    }

    populateFormFromCrqData(crqData) {
        const fieldMappings = {
            'newCrqNumber': crqData.crq_number,
            'newCrqInitiator': crqData.initiator,
            'newCrqDirection': this.mapDirection(crqData.direction),
            'newCrqImpact': this.mapImpact(crqData.impact_status),
            'newCrqShortDescription': crqData.short_description,
            'newCrqDetailedDescription': crqData.detailed_description,
            'newCrqImpactDetails': this.buildImpactDetails(crqData),
            'newCrqCause': crqData.cause,
            'newCrqStartDate': this.formatDateTimeLocal(crqData.start_date),
            'newCrqEndDate': this.formatDateTimeLocal(crqData.end_date)
        };

        this.populateFormFields(crqData, fieldMappings);
    }

    buildImpactDetails(crqData) {
        const impactParts = [];
        
        if (crqData.it_impact_on_user_details) {
            impactParts.push(`Влияние на пользователей: ${crqData.it_impact_on_user_details}`);
        }
        
        if (crqData.it_impact_on_client_details) {
            impactParts.push(`Влияние на клиентов: ${crqData.it_impact_on_client_details}`);
        }
        
        if (crqData.td_impact_on_service_details) {
            impactParts.push(`Влияние ТД: ${crqData.td_impact_on_service_details}`);
        }
        
        return impactParts.length > 0 ? impactParts.join('\n\n') : null;
    }

    mapDirection(direction) {
        const directionMap = { 
            "Техническая Дирекция": "ТД", 
            "Информационные технологии": "ДИТ"
        };
        return directionMap[direction] || direction;
    }

    mapImpact(impact) {
        const impactMap = { 
            "Без прерывания": "Нет", 
            "С прерыванием": "Да" 
        };
        return impactMap[impact] || impact;
    }

    async handleFileUpload(event) {
        const files = Array.from(event.target.files);
        
        if (files.length === 0) return;

        const validationResult = this.validateFiles(files);
        if (!validationResult.isValid) {
            NotificationManager.showError(validationResult.message);
            event.target.value = '';
            return;
        }

        try {
            const uploadedFiles = await this.api.uploadTemporaryFiles({ files });
            
            uploadedFiles.data.forEach(fileInfo => {
                this.state.addFile('newCrqFiles', fileInfo.id, fileInfo);
                this.addFileToList(fileInfo);
            });

            NotificationManager.showSuccess(`${files.length} файл(ов) успешно загружено`);
        } catch (error) {
            NotificationManager.showError(`Ошибка загрузки файлов: ${error.message}`);
        }

        event.target.value = '';
    }

    handleFileRemoval(fileId, fileIdPrefix) {
        if (fileIdPrefix === 'existing_') {
            this.removeExistingFile(fileId);
        } else {
            this.removeFile(fileId);
        }
    }

    async removeFile(fileId) {
        try {
            await this.api.deleteFile(fileId);
            this.state.removeFile('newCrqFiles', fileId);
            
            const listItem = document.getElementById(`file_${fileId}`);
            if (listItem) {
                listItem.remove();
            }
        } catch (error) {
            NotificationManager.showError(`Ошибка удаления файла: ${error.message}`);
        }
    }

    async handleSave() {
        if (!this.validateForm()) {
            return;
        }

        try {
            const formData = this.getFormData('new');
            
            const { fileCollections } = this.state.getState();
            const fileIds = fileCollections?.newCrqFiles ? 
                Array.from(fileCollections.newCrqFiles.keys()) : [];
            
            if (fileIds.length > 0) {
                formData.file_ids = fileIds;
            }

            await this.crqService.createCrq(formData);
            
            this.close();
            
            if (window.calendarComponent?.loadCalendarData) {
                await window.calendarComponent.loadCalendarData();
            }
            
            NotificationManager.showSuccess('CRQ успешно создан');
        } catch (error) {
            NotificationManager.showError(`Ошибка создания CRQ: ${error.message}`);
        }
    }

    onClose() {
        super.onClose();
        // Additional cleanup specific to new CRQ modal if needed
    }
}