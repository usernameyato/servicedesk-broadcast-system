import { NotificationManager } from '../utils/notificationManager.js';

export class BaseModal {
    constructor(modalId, stateManager, triggerSelector = null) {
        this.modalId = modalId;
        this.modal = document.getElementById(modalId);
        this.$modal = $(`#${modalId}`);
        this.state = stateManager;
        this.triggerSelector = triggerSelector;
        
        this.tabConfig = {};
        this.validationConfig = {
            requiredFields: [],
            validationRules: {}
        };
        
        this.init();
    }

    // Abstract methods - must be implemented by subclasses
    getTabContainerName() {
        throw new Error('getTabContainerName() must be implemented by subclass');
    }

    getTabName() {
        throw new Error('getTabName() must be implemented by subclass');
    }

    getCheckboxClass() {
        return 'crq-subs-checkbox';
    }

    getFormPrefix() {
        throw new Error('getFormPrefix() must be implemented by subclass');
    }

    getFileCollection() {
        throw new Error('getFileCollection() must be implemented by subclass');
    }

    init() {
        if (this.modal) {
            this.bindEvents();
            this.bindTriggers();
        }
    }

    bindEvents() {
        this.$modal.on('shown.bs.modal', () => {
            this.onOpen();
        });
        
        this.$modal.on('hidden.bs.modal', () => {
            this.onClose();
        });
    }

    bindTriggers() {
        if (this.triggerSelector) {
            const triggers = document.querySelectorAll(this.triggerSelector);
            triggers.forEach(trigger => {
                trigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.open();
                });
            });
        }
    }

    // Common tab functionality
    initializeTabs() {
        // Remove existing tab listeners to prevent duplicates
        const tabContainer = this.modal.querySelector(`[data-tab-container="${this.getTabContainerName()}"]`);
        
        if (tabContainer) {
            // Clone the container to remove all existing event listeners
            const newTabContainer = tabContainer.cloneNode(true);
            tabContainer.parentNode.replaceChild(newTabContainer, tabContainer);
            
            // Add single event listener with delegation
            newTabContainer.addEventListener('click', (event) => this.handleTabClick(event));
            
            // Initialize first tab as active
            setTimeout(() => {
                this.switchTab('overview');
            }, 0);
        }
    }

    handleTabClick(event) {
        const tabButton = event.target.closest(`[data-${this.getTabName()}-tab]`);
        if (!tabButton) return;
        
        event.preventDefault();
        const targetTab = tabButton.dataset[`${this.getTabContainerName()}Tab`];
        
        if (targetTab && this.tabConfig[targetTab]) {
            this.switchTab(targetTab);
        }
    }

    switchTab(tabName) {
        const config = this.tabConfig[tabName];
        if (!config) return;

        // Deactivate all tabs
        Object.values(this.tabConfig).forEach(({ button, content }) => {
            const tabButton = this.modal.querySelector(`#${button}`);
            const tabContent = this.modal.querySelector(`#${content}`);
            
            if (tabButton) tabButton.classList.remove('active');
            if (tabContent) tabContent.classList.remove('active');
        });

        // Activate target tab
        const activeButton = this.modal.querySelector(`#${config.button}`);
        const activeContent = this.modal.querySelector(`#${config.content}`);
        
        if (activeButton) activeButton.classList.add('active');
        if (activeContent) activeContent.classList.add('active');
    }

    // Common subscription dropdown functionality
    showLoadingState(dropdownId) {
        const dropdown = $(`#${dropdownId}`);
        dropdown.html('<div class="text-center p-3"><i class="spinner-border spinner-border-sm"></i> Загрузка...</div>');
    }

    hideLoadingState() {
        // Loading state is hidden when dropdown is populated
    }

    populateSubscriptionsDropdown(subscriptions, dropdownId) {
        const dropdown = $(`#${dropdownId}`);
        dropdown.empty();

        subscriptions.forEach((subscription) => {
            const checkboxClass = this.getCheckboxClass();
            const item = `
                <div class="form-check dropdown-item">
                    <input type="checkbox" 
                           class="form-check-input ${checkboxClass}"
                           id="${this.modalId}Sub_${subscription.id}" 
                           name="email_types[]" 
                           value="${subscription.name}">
                    <label class="form-check-label" 
                           for="${this.modalId}Sub_${subscription.id}"
                           data-tooltip="${subscription.description}">
                        ${subscription.name}
                    </label>
                </div>
            `;
            dropdown.append(item);
        });
    }

    updateDropdownText(dropdownButtonId, checkboxSelector) {
        const selectedOptions = [];
        $(checkboxSelector + ':checked').each(function() {
            const optionText = $(this).next('label').text().trim();
            selectedOptions.push(optionText);
        });

        const newText = selectedOptions.length > 0
            ? (selectedOptions.length === 1 ? selectedOptions[0] : `${selectedOptions[0]} (+${selectedOptions.length - 1})`)
            : 'Выберите тип рассылки';

        $(`#${dropdownButtonId}`).text(newText);
    }

    // Common subscription handling
    bindSubscriptionEvents() {
        const checkboxClass = this.getCheckboxClass();
        const dropdownButtonId = `${this.getFormPrefix()}DropdownMenuButton`;
        
        // Use event delegation to prevent duplicate bindings
        $(document).off('change', `.${checkboxClass}`).on('change', `.${checkboxClass}`, (e) => {
            // Add visual feedback
            const $item = $(e.target).closest('.dropdown-item');
            if (e.target.checked) {
                $item.addClass('selected').removeClass('unselected');
            } else {
                $item.addClass('unselected').removeClass('selected');
            }
            
            // Remove transition classes after animation
            setTimeout(() => {
                $item.removeClass('selected unselected');
            }, 300);
            
            this.updateDropdownText(dropdownButtonId, `.${checkboxClass}`);
        });
        
        // Remove existing listeners and add new one
        const dropdownButton = this.modal.querySelector(`#${dropdownButtonId}`);
        if (dropdownButton) {
            const newDropdownButton = dropdownButton.cloneNode(true);
            dropdownButton.parentNode.replaceChild(newDropdownButton, dropdownButton);
            
            newDropdownButton.addEventListener('click', () => {
                $(`#${this.getFormPrefix()}SubscriptionsDropdown`).parent().find('.dropdown-menu').toggleClass('show');
            });
        }
    }

    // Common subscription validation and selection
    validateSubscriptions() {
        const selectedSubs = this.modal.querySelectorAll(`.${this.getCheckboxClass()}:checked`);
        if (selectedSubs.length === 0) {
            NotificationManager.showWarning('Пожалуйста, выберите хотя бы один тип рассылки');
            return false;
        }
        return true;
    }

    getSelectedSubscriptions() {
        return Array.from(this.modal.querySelectorAll(`.${this.getCheckboxClass()}:checked`))
            .map(cb => cb.value);
    }

    preSelectSubscriptions(subscriptionString) {
        const allCheckboxes = this.modal.querySelectorAll(`.${this.getCheckboxClass()}`);
        
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
            const cleanString = subscriptionString.replace(/^{|}$/g, '');
            subscriptionArray = cleanString.split(',').map(item => 
                item.trim().replace(/^"|"$/g, '')
            );
        } catch (error) {
            console.error('Error parsing subscription string:', error);
            return;
        }
        
        subscriptionArray.forEach(value => {
            allCheckboxes.forEach(checkbox => {
                if (checkbox.value === value) {
                    checkbox.checked = true;
                }
            });
        });
        
        this.updateDropdownText(`${this.getFormPrefix()}DropdownMenuButton`, `.${this.getCheckboxClass()}`);
    }

    // Common file handling
    initializeFileUpload(fileInputId, uploadButtonId) {
        const fileInput = this.modal.querySelector(`#${fileInputId || this.getFormPrefix() + 'FileInput'}`);
        const addFilesButton = this.modal.querySelector(`#${uploadButtonId || 'add' + this.getFormPrefix().charAt(0).toUpperCase() + this.getFormPrefix().slice(1) + 'FilesButton'}`);
        
        if (addFilesButton && fileInput) {
            // Remove existing listeners to prevent duplicates
            const newAddFilesButton = addFilesButton.cloneNode(true);
            addFilesButton.parentNode.replaceChild(newAddFilesButton, addFilesButton);
            
            const newFileInput = fileInput.cloneNode(true);
            fileInput.parentNode.replaceChild(newFileInput, fileInput);
            
            newAddFilesButton.addEventListener('click', () => this.handleUploadFileClick(newFileInput));

            // Store reference for cleanup
            this.fileInputHandler = (e) => this.handleFileUpload(e);
            newFileInput.addEventListener('change', this.fileInputHandler);
        }
    }

    handleUploadFileClick(fileInput) {
        fileInput.click();
    }
    
    validateFiles(files) {
        const maxFileSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = [
            'application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'image/jpeg', 'image/png', 'image/gif'
        ];

        for (const file of files) {
            if (file.size > maxFileSize) {
                return {
                    isValid: false,
                    message: `Файл "${file.name}" превышает максимальный размер 10MB`
                };
            }
            
            if (!allowedTypes.includes(file.type)) {
                return {
                    isValid: false,
                    message: `Файл "${file.name}" имеет недопустимый тип`
                };
            }
        }

        return { isValid: true };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    addFileToList(fileInfo, fileListId, fileIdPrefix = 'file_') {
        const fileList = this.modal.querySelector(`#${fileListId || this.getFormPrefix() + 'FileList'}`);
        
        const listItem = document.createElement('li');
        listItem.className = 'file-item';
        listItem.id = `${fileIdPrefix}${fileInfo.id}`;
        
        const fileName = fileInfo.original_filename || fileInfo.name;
        const fileSize = this.formatFileSize(fileInfo.size || 0);
        
        listItem.innerHTML = `
            <span class="file-name">${fileName}</span>
            <span class="file-size">(${fileSize})</span>
            <button type="button" class="btn btn-sm btn-danger remove-file" 
                    data-file-id="${fileInfo.id}">
                <i class="fas fa-times"></i> Удалить
            </button>
        `;
        
        const removeButton = listItem.querySelector('.remove-file');
        removeButton.addEventListener('click', () => this.handleFileRemoval(fileInfo.id, fileIdPrefix));
        
        fileList.appendChild(listItem);
    }

    handleFileRemoval(fileId, fileIdPrefix) {
        // Override in subclasses for specific removal logic
        const listItem = document.getElementById(`${fileIdPrefix}${fileId}`);
        if (listItem) {
            listItem.remove();
        }
    }

    clearFileList() {
        const fileList = this.modal.querySelector(`#${this.getFormPrefix()}FileList`);
        if (fileList) {
            fileList.innerHTML = '';
        }
    }

    // Common date formatting and validation
    formatDateTimeLocal(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toISOString().slice(0, 16);
        } catch (error) {
            console.warn('Invalid date format:', dateString);
            return '';
        }
    }

    validateDateRange(startDateValue, endDateValue) {
        if (!startDateValue || !endDateValue) return true;
        const startDate = new Date(startDateValue);
        const endDate = new Date(endDateValue);
        return startDate <= endDate;
    }

    validateStartDate(value) {
        if (!value) return true;
        const endDateField = this.modal.querySelector(`#${this.getFormPrefix()}EndDate`);
        const endDateValue = endDateField ? endDateField.value : '';
        return this.validateDateRange(value, endDateValue);
    }

    validateEndDate(value) {
        if (!value) return true;
        const startDateField = this.modal.querySelector(`#${this.getFormPrefix()}StartDate`);
        const startDateValue = startDateField ? startDateField.value : '';
        return this.validateDateRange(startDateValue, value);
    }

    // Common validation methods
    initializeFieldValidation() {
        const form = this.modal.querySelector('form');
        if (!form) return;

        const fields = form.querySelectorAll('input:not([type="file"]), select, textarea');
        fields.forEach(field => {
            // Remove existing listeners to prevent duplicates
            const newField = field.cloneNode(true);
            field.parentNode.replaceChild(newField, field);
            
            newField.addEventListener('blur', () => {
                if (newField.value.trim()) {
                    this.validateField(newField);
                }
            });
            
            newField.addEventListener('input', () => {
                this.removeFieldError(newField);
            });
            
            newField.addEventListener('change', () => {
                this.removeFieldError(newField);
            });
        });
    }

    validateField(field) {
        const fieldName = field.id;
        const value = field.value.trim();
        
        // Check if required
        if (this.validationConfig.requiredFields.includes(fieldName) && !value) {
            this.showFieldError(field, 'Это поле обязательно для заполнения');
            return false;
        }

        // Check specific validation rules
        const rule = this.validationConfig.validationRules[fieldName];
        if (rule && value) {
            let isValid = true;
            
            if (rule.pattern && !rule.pattern.test(value)) {
                isValid = false;
            }
            
            if (rule.validate) {
                isValid = rule.validate(value);
            }
            
            if (!isValid) {
                this.showFieldError(field, rule.message);
                return false;
            }
        }
        
        this.removeFieldError(field);
        return true;
    }

    validateForm() {
        let isValid = true;
        const form = this.modal.querySelector('form');
        
        if (!form) return false;
        
        // Validate required fields
        this.validationConfig.requiredFields.forEach(fieldId => {
            const field = form.querySelector(`#${fieldId}`);
            if (field && !this.validateField(field)) {
                isValid = false;
            }
        });
        
        // Validate subscriptions
        if (!this.validateSubscriptions()) {
            isValid = false;
        }
        
        if (!isValid) {
            NotificationManager.showError('Пожалуйста, исправьте ошибки в форме');
        }
        
        return isValid;
    }

    showFieldError(field, message) {
        this.removeFieldError(field);
        field.classList.add('is-invalid');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'invalid-feedback';
        errorDiv.textContent = message;
        errorDiv.id = `${field.id}_error`;
        
        const inputGroup = field.closest('.input-group');
        if (inputGroup) {
            const formGroup = inputGroup.parentNode;
            formGroup.insertBefore(errorDiv, inputGroup.nextSibling);
        } else {
            field.parentNode.insertBefore(errorDiv, field.nextSibling);
        }
    }

    removeFieldError(field) {
        field.classList.remove('is-invalid');
        
        const existingError = document.getElementById(`${field.id}_error`);
        if (existingError) {
            existingError.remove();
        }
    }

    clearAllErrors() {
        const invalidFields = this.modal.querySelectorAll('.is-invalid');
        invalidFields.forEach(field => this.removeFieldError(field));
    }

    // Common form data collection
    getFormData(formPrefix) {
        const form = this.modal.querySelector('form');
        if (!form) return {};

        const formData = new FormData(form);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            // Remove form prefix from field names
            const cleanKey = key.replace(`${formPrefix}_`, '');
            data[cleanKey] = value;
        }
        
        // Add selected subscriptions
        data.sub_names = this.getSelectedSubscriptions();
        
        return data;
    }

    // Common field population
    populateFormFields(data, fieldMappings = {}) {
        Object.entries(fieldMappings).forEach(([fieldId, value]) => {
            const field = this.modal.querySelector(`#${fieldId}`);
            if (field && value !== undefined && value !== null) {
                field.value = value;
                this.removeFieldError(field);
            }
        });
    }

    open() {
        this.$modal.modal('show');
    }

    close() {
        this.$modal.modal('hide');
    }

    onOpen() {
        // Override in subclasses
    }

    onClose() {
        this.resetForm();
        this.clearAllErrors();
    }

    resetForm() {
        const form = this.modal.querySelector('form');
        if (form) {
            form.reset();
        }
        
        this.clearAllErrors();
        this.clearFileList();
        this.updateDropdownText(`${this.getFormPrefix()}DropdownMenuButton`, `.${this.getCheckboxClass()}`);
        this.switchTab('overview');
        this.state.clearFiles(this.getFileCollection());
    }

    showErrors(errors) {
        this.clearAllErrors();
        Object.entries(errors).forEach(([fieldName, fieldErrors]) => {
            if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
                const field = this.modal.querySelector(`#${fieldName}, [name="${fieldName}"]`);
                if (field) {
                    this.showFieldError(field, fieldErrors[0]);
                }
            }
        });
    }
}