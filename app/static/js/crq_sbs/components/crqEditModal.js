import { BaseModal } from './modalComponent.js';
import { NotificationManager } from '../utils/notificationManager.js';

export class CrqEditModal extends BaseModal {
    constructor(state, crqService, apiClient, lockManager) {
        super('editCrqModal', state, '.view-crq-details');
        this.crqService = crqService;
        this.api = apiClient;
        this.currentCrqNumber = null;
        this.isInitialized = false;
        this.lockManager = lockManager;
        this.pendingSubscriptionData = null; // Store subscription data for pre-selection
        
        this.tabConfig = {
            overview: { button: 'editCrqOverviewTab', content: 'editCrqOverviewContent' },
            impact: { button: 'editCrqImpactTab', content: 'editCrqImpactContent'},
            communication: { button: 'editCrqCommunicationTab', content: 'editCrqCommunicationContent' }
        };
        
        this.validationConfig = {
            requiredFields: [
                'editCrqStatus', 'editCrqDirection', 'editCrqImpact', 
                'editCrqShortDescription', 'editCrqDetailedDescription',
                'editCrqImpactDetails', 'editCrqCause',
                'editCrqStartDate', 'editCrqEndDate', 'editCrqWorkType'
            ],
            validationRules: {
                'editCrqStartDate': { 
                    validate: (value) => this.validateStartDate(value),
                    message: 'Дата начала не может быть позже даты завершения'
                },
                'editCrqEndDate': {
                    validate: (value) => this.validateEndDate(value),
                    message: 'Дата завершения не может быть раньше даты начала'
                }
            }
        };
        
        this.bindFormEvents();
    }

    // Required abstract method implementations
    getTabContainerName() {
        return 'editCrq';
    }

    getTabName() {
        return 'edit-crq';
    }

    getCheckboxClass() {
        return 'edit-crq-subs-checkbox';
    }

    getFormPrefix() {
        return 'editCrq';
    }

    getFileCollection() {
        return 'editCrqFiles';
    }

    bindFormEvents() {
        // Prevent duplicate binding
        if (this.isInitialized) {
            return;
        }

        // Bind subscription events
        this.bindSubscriptionEvents();

        // Bind action buttons with delegation to avoid duplicates
        this.bindModalButtons();

        // Initialize file upload and field validation
        this.initializeFileUpload('editCrqFileInput', 'addEditCrqFilesButton');
        this.initializeFieldValidation();
        
        this.isInitialized = true;
    }

    bindModalButtons() {
        // Remove existing listeners to prevent duplicates
        const updateButton = this.modal.querySelector('#updateCrq');
        const previewButton = this.modal.querySelector('#previewUserEmail');
        
        if (updateButton) {
            // Clone node to remove all event listeners
            const newUpdateButton = updateButton.cloneNode(true);
            updateButton.parentNode.replaceChild(newUpdateButton, updateButton);
            newUpdateButton.addEventListener('click', () => this.handleUpdate());
        }
        
        if (previewButton) {
            // Clone node to remove all event listeners
            const newPreviewButton = previewButton.cloneNode(true);
            previewButton.parentNode.replaceChild(newPreviewButton, previewButton);
            newPreviewButton.addEventListener('click', () => this.handleEmailPreview());
        }
    }

    async onOpen() {
        try {
            this.showLoadingState('editCrqSubscriptionsDropdown');
            this.initializeTabs();
            
            const subscriptions = await this.api.getSubscriptions();

            this.hideLoadingState();
            this.state.setSubscriptions(subscriptions);
            this.populateSubscriptionsDropdown(subscriptions, 'editCrqSubscriptionsDropdown');
            
            // Apply pending subscription pre-selection if we have it
            if (this.pendingSubscriptionData) {
                // Use setTimeout to ensure DOM is fully updated
                setTimeout(() => {
                    this.preSelectSubscriptions(this.pendingSubscriptionData);
                    this.pendingSubscriptionData = null; // Clear after use
                }, 100);
            }
            
        } catch (error) {
            this.hideLoadingState();
            NotificationManager.showError(`Ошибка загрузки данных: ${error.message}`);
        }
    }

    async open(crqNumber) {
        this.currentCrqNumber = crqNumber;
        
        try {
            if (this.lockManager && this.lockManager.isLockedByCurrentUser(crqNumber)) {
                this.isLocked = true;
            }

            // Load CRQ data
            const crqData = await this.crqService.loadCrq(crqNumber, 'processed');
            
            // Store subscription data for later pre-selection
            this.pendingSubscriptionData = crqData.sub_type;
            
            this.populateFormFromCrqData(crqData);
            this.loadExistingFiles(crqData.attachments || []);
            
            // Update CRQ link
            this.updateCrqLink();
            
            super.open();

            // Add lock indicator if locked
            if (this.isLocked) {
                this.addLockIndicator();
            }
        } catch (error) {
            NotificationManager.showError(`Ошибка загрузки CRQ: ${error.message}`);
        }
    }

    addLockIndicator() {
        const modalHeader = this.modal?.querySelector('.modal-header');
        if (!modalHeader) return;

        const existingIndicator = modalHeader.querySelector('.lock-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        const lockIndicator = document.createElement('div');
        lockIndicator.className = 'lock-indicator';
        lockIndicator.innerHTML = `
            <span class="lock-icon">🔒</span>
            <span class="lock-text">Заблокировано вами</span>
        `;
        
        lockIndicator.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            color: #28a745;
            font-size: 14px;
            margin-left: auto;
        `;
        
        modalHeader.appendChild(lockIndicator);
    }

    updateCrqLink() {
        const crqNumber = this.modal.querySelector('#editCrqNumber').value;
        const crqLink = this.modal.querySelector('#crqLink');
        
        if (crqNumber && crqLink) {
            crqLink.href = `https://itsm.beeline.kz:8443/servlet/ViewFormServlet?form=CHG:Infrastructure Change&server=kz-bmccore01&qual='1000000182'%20%3D%20%22${crqNumber}%22`;
            crqLink.style.display = 'inline';
        }
    }

    populateFormFromCrqData(crqData) {
        const fieldMappings = {
            'editCrqNumber': crqData.crq_number,
            'editCrqInitiator': crqData.initiator,
            'editCrqDirection': crqData.direction,
            'editCrqImpact': crqData.impact_status,
            'editCrqStatus': crqData.status,
            'editCrqStartDate': this.formatDateTimeLocal(crqData.start_date),
            'editCrqEndDate': this.formatDateTimeLocal(crqData.end_date),
            'editCrqWorkType': crqData.crq_type,
            'editCrqShortDescription': crqData.short_description,
            'editCrqCause': crqData.short_description,
            'editCrqDetailedDescription': crqData.detailed_description,
            'editCrqImpactDetails': crqData.impact_details,
            'editCrqComment': crqData.comments
        };

        this.populateFormFields(crqData, fieldMappings);
    }

    // Override the preSelectSubscriptions method with improved logic
    preSelectSubscriptions(subscriptionString) {
        
        // Get all checkboxes
        const allCheckboxes = this.modal.querySelectorAll(`.${this.getCheckboxClass()}`);
        
        // If no checkboxes found, dropdown might not be populated yet
        if (allCheckboxes.length === 0) {
            console.warn('No checkboxes found - dropdown not populated yet');
            return;
        }
        
        // Clear all first
        allCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        if (!subscriptionString) {
            this.updateDropdownText(`${this.getFormPrefix()}DropdownMenuButton`, `.${this.getCheckboxClass()}`);
            return;
        }
        
        let subscriptionArray;
        try {
            // Handle different formats of subscription strings
            let cleanString = subscriptionString;
            
            // If it's wrapped in curly braces, remove them
            if (cleanString.startsWith('{') && cleanString.endsWith('}')) {
                cleanString = cleanString.slice(1, -1);
            }
            
            // Split by comma and clean each item
            subscriptionArray = cleanString.split(',').map(item => 
                item.trim().replace(/^["']|["']$/g, '') // Remove quotes from start/end
            ).filter(item => item.length > 0); // Remove empty items
            
        } catch (error) {
            console.error('Error parsing subscription string:', error);
            return;
        }
        
        // Pre-select matching checkboxes
        let selectedCount = 0;
        subscriptionArray.forEach(value => {
            allCheckboxes.forEach(checkbox => {
                if (checkbox.value === value) {
                    checkbox.checked = true;
                    selectedCount++;
                }
            });
        });
        
        // Update dropdown text to reflect selections
        this.updateDropdownText(`${this.getFormPrefix()}DropdownMenuButton`, `.${this.getCheckboxClass()}`);
    }

    loadExistingFiles(attachments) {
        const { existingFiles } = this.state.getState().fileCollections;
        existingFiles.clear();
        
        const fileList = this.modal.querySelector('#editCrqFileList');
        fileList.innerHTML = '';

        attachments.forEach(file => {
            existingFiles.set(file.id, file);
            this.addExistingFileToList(file);
        });
    }

    addExistingFileToList(fileInfo) {
        const fileList = this.modal.querySelector('#editCrqFileList');
        
        const listItem = document.createElement('li');
        listItem.className = 'file-item';
        listItem.id = `existing_${fileInfo.id}`;
        
        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = fileInfo.original_filename;
        fileNameSpan.className = 'file-name';
        
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'Удалить';
        removeButton.className = 'btn btn-sm btn-danger remove-file';
        removeButton.addEventListener('click', () => this.removeExistingFile(fileInfo.id));
        
        listItem.appendChild(fileNameSpan);
        listItem.appendChild(removeButton);
        fileList.appendChild(listItem);
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
            console.log(uploadedFiles)
            uploadedFiles.data.forEach(fileInfo => {
                this.state.addFile('editCrqFiles', fileInfo.id, fileInfo);
                this.addFileToList(fileInfo);
            });

            NotificationManager.showSuccess(`${files.length} файл(ов) загружено`);
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

    removeExistingFile(fileId) {
        const { existingFiles } = this.state.getState().fileCollections;
        existingFiles.delete(fileId);
        
        const listItem = document.getElementById(`existing_${fileId}`);
        if (listItem) {
            listItem.remove();
        }
    }

    async removeFile(fileId) {
        try {
            await this.api.deleteFile(fileId);
            this.state.removeFile('editCrqFiles', fileId);
            
            const listItem = document.getElementById(`file_${fileId}`);
            if (listItem) {
                listItem.remove();
            }
        } catch (error) {
            NotificationManager.showError(`Ошибка удаления файла: ${error.message}`);
        }
    }

    async handleUpdate() {
        if (!this.validateForm()) {
            return;
        }

        try {
            if (this.lockManager && this.currentCrqNumber) {
                try {
                    const lockStatus = await this.lockManager.getLockStatus(this.currentCrqNumber);
                    
                    if (lockStatus.status !== 'locked' || 
                        !lockStatus.lock_info || 
                        lockStatus.lock_info.user_id !== this.lockManager.userId) {
                        
                        NotificationManager.showError('Блокировка утеряна. Не удается сохранить изменения.');
                        this.close();
                        return;
                    }
                } catch (error) {
                    console.error('🔒 Error verifying lock before update:', error);
                }
            }

            const formData = this.getFormData('edit');
            
            // Add file information
            const { fileCollections } = this.state.getState();
            formData.new_file_ids = Array.from(fileCollections.editCrqFiles?.keys() || []);
            formData.kept_file_ids = Array.from(fileCollections.existingFiles?.keys() || []);

            await this.crqService.updateCrq(this.currentCrqNumber, formData);
            
            this.close();
            
            // Reload calendar using the global instance
            if (window.app && window.app.getComponent('calendar')) {
                await window.app.getComponent('calendar').loadCalendarData();
            }
        } catch (error) {
            // Error already handled in service
        }
    }

    async handleEmailPreview() {
        if (!this.validateForm()) {
            return;
        }
        
        try {
            const emailData = this.prepareEmailData();
            if (!emailData) return;
            
            const response = await this.api.previewEmail('users', emailData);
            
            if (response.status === 'success') {
                const previewModal = document.getElementById('userEmailNotifPreviewModal');
                const previewBody = previewModal.querySelector('#userEmailNotifPreviewBody');
                previewBody.innerHTML = response.content;
                
                const bootstrapPreviewModal = new bootstrap.Modal(previewModal);
                bootstrapPreviewModal.show();
            } else {
                NotificationManager.showError(`Ошибка: ${response.message}`);
            }
            
        } catch (error) {
            console.error('Preview error:', error);
            NotificationManager.showError(`Ошибка генерации предпросмотра: ${error.message}`);
        }
    }

    prepareEmailData() {
        const form = this.modal.querySelector('#editCrqForm');
        const formData = new FormData(form);
        
        const requiredFields = [
            'edit_crq_number', 'edit_crq_direction', 
            'edit_crq_impact', 'edit_crq_start_date', 'edit_crq_end_date', 
            'edit_crq_cause', 'edit_crq_work_type', 'edit_crq_impact_details'
        ];
        
        const data = {};
        for (const fieldName of requiredFields) {
            const value = formData.get(fieldName);
            if (!value || value.trim() === '') {
                NotificationManager.showError(`Поле обязательно к заполнению: ${fieldName}`);
                return null;
            }
            data[fieldName.replace('edit_crq_', 'crq_')] = value;
        }
        
        // Check subscriptions
        const selectedSubs = this.getSelectedSubscriptions();
        if (selectedSubs.length === 0) {
            NotificationManager.showError('Выберите хотя бы одну подписку');
            return null;
        }
        
        data.subscriptions = selectedSubs;
        
        return data;
    }

    onClose() {
        super.onClose();
        this.state.clearFiles('existingFiles');
        
        if (this.lockManager && this.currentCrqNumber) {
            this.lockManager.releaseLock(this.currentCrqNumber).catch(error => {
                console.error('Failed to release lock:', error);
            });
        }
        
        this.currentCrqNumber = null;
        this.isLocked = false;
        this.pendingSubscriptionData = null; // Clear pending data on close
    }
}