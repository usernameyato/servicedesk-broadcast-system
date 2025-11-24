class PartnersManagementPanel {
    constructor() {
        this.selectedGroup = null;
        this.groups = [];
        this.groupPartners = [];
        this.removedPartners = [];

        this.groupSelect = document.getElementById('groupname');
        this.editGroupCard = document.getElementById('editGroupCard');
        this.groupPartnersContainer = document.getElementById('group-partners');
        this.emptyPartnersMessage = document.getElementById('empty-partners-message');
        this.partnersCount = document.getElementById('partners-count');
        this.lastModified = document.getElementById('last-modified');
        this.groupsTableBody = document.getElementById('groupsTableBody');
        this.saveChangesBtn = document.getElementById('saveChangesBtn');
        this.alertContainer = document.getElementById('alert-container');

        this.addUserModal = $('#addUserModal');
        this.addGroupModal = $('#addGroupModal');
        this.uploadFileModal = $('#uploadFileModal');

        this.addPartnerForm = document.getElementById('add-partner-form');
        this.addGroupForm = document.getElementById('add-group-form');
        this.uploadFileForm = document.getElementById('upload-file-form');

        this.originalSaveBtnText = this.saveChangesBtn ? this.saveChangesBtn.innerHTML : 'Сохранить изменения';

        this.initializeEventListeners();
        this.loadGroups();
    }

    initializeEventListeners() {
        if (this.groupSelect) {
            this.groupSelect.addEventListener('change', (e) => {
                this.selectGroup(e.target.value);
            });
        }

        const toggleButton = document.getElementById('toggleButton');
        const groupList = document.getElementById('groupList');

        if (groupList && toggleButton) {
            $('#groupList').on('shown.bs.collapse', () => {
                toggleButton.innerHTML = '&#9660;';
                toggleButton.setAttribute('aria-expanded', 'true');
            });

            $('#groupList').on('hidden.bs.collapse', () => {
                toggleButton.innerHTML = '&#9654;';
                toggleButton.setAttribute('aria-expanded', 'false');
            });
        }

        if (this.saveChangesBtn) {
            this.saveChangesBtn.addEventListener('click', () => {
                this.saveGroupChanges();
            });
        }

        if (this.addPartnerForm) {
            this.addPartnerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addPartner();
            });
        }

        if (this.addGroupForm) {
            this.addGroupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addGroup();
            });

            const groupNameInput = document.getElementById('new-groupname');
            const charCountSpan = document.getElementById('group-char-count');
            if (groupNameInput && charCountSpan) {
                groupNameInput.addEventListener('input', (e) => {
                    charCountSpan.textContent = e.target.value.length;
                });
            }
        }

        if (this.uploadFileForm) {
            this.uploadFileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.uploadUsersFile();
            });
        }

        if (this.addUserModal.length) {
            this.addUserModal.on('hidden.bs.modal', () => this.resetForm(this.addPartnerForm));
        }

        if (this.addGroupModal.length) {
            this.addGroupModal.on('hidden.bs.modal', () => this.resetForm(this.addGroupForm));
        }

        if (this.uploadFileModal.length) {
            this.uploadFileModal.on('hidden.bs.modal', () => this.resetForm(this.uploadFileForm));
        }

        document.addEventListener('click', (e) => this.handleNotificationClose(e));
    }

    async apiCall(url, options = {}) {
        try {
            const defaultHeaders = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            };

            if (options.body instanceof FormData) {
                delete defaultHeaders['Content-Type'];
            }

            const response = await fetch(url, {
                headers: {
                    ...defaultHeaders,
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            this.showNotification(error.message || 'Произошла ошибка при выполнении запроса', 'error');
            throw error;
        }
    }

    async loadGroups() {
        try {
            const data = await this.apiCall('/admin/api/groups');
            this.groups = data.groups || [];
            this.updateGroupsDropdowns();
            this.updateGroupsTable();

            if (this.groups.length > 0 && this.groupSelect) {
                this.selectGroup(this.groups[0].groupname);
            } else if (this.groups.length === 0) {
                this.hideEditGroupCard();
            }
        } catch (error) {
            console.error('Error loading groups:', error);
            this.updateGroupsTable(true);
        }
    }

    updateGroupsDropdowns() {
        const dropdowns = [
            document.getElementById('groupname'),
            document.getElementById('partner-groupname'),
            document.getElementById('file-groupname')
        ];

        dropdowns.forEach(dropdown => {
            if (dropdown) {
                if (this.groups.length === 0) {
                    dropdown.innerHTML = '<option value="">Нет доступных групп</option>';
                    dropdown.disabled = true;
                } else {
                    dropdown.innerHTML = this.groups.map(group =>
                        `<option value="${this.escapeHtml(group.groupname)}">${this.escapeHtml(group.groupname)}</option>`
                    ).join('');
                    dropdown.disabled = false;

                    if (dropdown.id === 'groupname' && this.groups.length > 0) {
                        dropdown.value = this.groups[0].groupname;
                    }
                }
            }
        });
    }

    updateGroupsTable(showError = false) {
        if (!this.groupsTableBody) return;

        if (showError) {
            this.groupsTableBody.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center py-5">
                        <div class="text-muted">
                            <i class="fas fa-exclamation-triangle fa-2x mb-3 text-warning" aria-hidden="true"></i>
                            <h6>Ошибка загрузки</h6>
                            <p>Не удалось загрузить список групп.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        if (this.groups.length === 0) {
            this.groupsTableBody.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center py-5">
                        <div class="text-muted">
                            <i class="fas fa-users fa-2x mb-3" aria-hidden="true"></i>
                            <h6>Группы отсутствуют</h6>
                            <p>Создайте первую группу для начала работы.</p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            this.groupsTableBody.innerHTML = this.groups.map(group => `
                <tr onclick="partnersPanel.selectGroup('${this.escapeHtml(group.groupname)}')"
                    style="cursor: pointer;"
                    title="Нажмите для выбора группы">
                    <td>
                        <strong>${this.escapeHtml(group.groupname)}</strong>
                    </td>
                    <td onclick="event.stopPropagation();">
                        <button type="button"
                                class="btn btn-danger btn-sm"
                                onclick="partnersPanel.deleteGroup('${this.escapeHtml(group.groupname)}')"
                                title="Удалить группу"
                                aria-label="Удалить группу ${this.escapeHtml(group.groupname)}">
                            <i class="fas fa-trash mr-1" aria-hidden="true"></i>
                            Удалить
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    }

    async selectGroup(groupname) {
        if (!groupname) {
            this.hideEditGroupCard();
            return;
        }

        this.selectedGroup = groupname;
        if (this.groupSelect) {
            this.groupSelect.value = groupname;
        }

        try {
            const response = await fetch(`/admin/api/groups/${encodeURIComponent(groupname)}/partners`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const data = await response.json();

            if (response.ok || data.status === 'not_found') {
                this.groupPartners = data.partners || [];
                this.removedPartners = [];
                this.updatePartnersDisplay();
                this.showEditGroupCard();

                if (data.status === 'not_found' && data.message) {
                    this.showNotification(data.message, 'info');
                }
            } else {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error loading group partners:', error);
            this.showNotification('Ошибка загрузки участников группы: ' + error.message, 'error');
            this.hideEditGroupCard();
        }
    }

    showEditGroupCard() {
        if (this.editGroupCard) {
            this.editGroupCard.style.display = 'block';
        }
    }

    hideEditGroupCard() {
        if (this.editGroupCard) {
            this.editGroupCard.style.display = 'none';
        }
        this.selectedGroup = null;
    }

    updatePartnersDisplay() {
        if (!this.groupPartnersContainer) return;

        if (this.partnersCount) {
            this.partnersCount.textContent = this.groupPartners.length;
        }

        if (this.lastModified) {
            this.lastModified.textContent = new Date().toLocaleString('ru-RU');
        }

        if (this.groupPartners.length > 0) {
            this.groupPartnersContainer.classList.add('has-partners');
            if (this.emptyPartnersMessage) {
                this.emptyPartnersMessage.style.display = 'none';
            }
        } else {
            this.groupPartnersContainer.classList.remove('has-partners');
            if (this.emptyPartnersMessage) {
                this.emptyPartnersMessage.style.display = 'block';
            }
        }

        this.groupPartnersContainer.innerHTML = this.groupPartners.map(partner => `
            <div class="partner-block" id="partner-${this.escapeHtml(partner.email)}">
                <span class="partner-email" title="${this.escapeHtml(partner.email)}">
                    ${this.escapeHtml(partner.email)}
                </span>
                <button type="button"
                        class="partner-remove-btn"
                        onclick="partnersPanel.removePartner('${this.escapeHtml(partner.email)}')"
                        title="Удалить участника"
                        aria-label="Удалить ${this.escapeHtml(partner.email)} из группы">
                    &times;
                </button>
            </div>
        `).join('');
    }

    removePartner(email) {
        this.groupPartners = this.groupPartners.filter(partner => partner.email !== email);
        if (!this.removedPartners.includes(email)) {
            this.removedPartners.push(email);
        }
        this.updatePartnersDisplay();
        this.showNotification(`Участник ${email} будет удален после сохранения`, 'info');
    }

    async saveGroupChanges() {
        if (!this.selectedGroup) return;

        this.setLoadingState(this.saveChangesBtn, true);

        try {
            const data = await this.apiCall('/admin/api/partners/manage', {
                method: 'POST',
                body: JSON.stringify({
                    groupname: this.selectedGroup,
                    partners: this.groupPartners.map(p => p.email),
                    removed_partners: this.removedPartners
                })
            });

            this.showNotification('Изменения успешно сохранены!', 'success');
            this.removedPartners = [];

            await this.selectGroup(this.selectedGroup);
        } catch (error) {
            console.error('Error saving changes:', error);
        } finally {
            this.setLoadingState(this.saveChangesBtn, false);
        }
    }

    async addPartner() {
        if (!this.addPartnerForm) return;

        const formData = new FormData(this.addPartnerForm);
        const email = formData.get('email')?.trim();
        const groupname = formData.get('groupname');

        if (!this.validateEmail(email)) {
            this.showNotification('Пожалуйста, введите корректный email-адрес', 'error');
            this.setFormFieldError('email', 'Введите корректный email-адрес');
            return;
        }

        if (!groupname) {
            this.showNotification('Пожалуйста, выберите группу', 'error');
            this.setFormFieldError('partner-groupname', 'Выберите группу');
            return;
        }

        const submitBtn = this.addPartnerForm.querySelector('button[type="submit"]');
        this.setLoadingState(submitBtn, true);

        try {
            const data = await this.apiCall('/admin/api/partners/add', {
                method: 'POST',
                body: JSON.stringify({
                    email: email,
                    groupname: groupname
                })
            });

            this.showNotification('Пользователь успешно добавлен!', 'success');
            this.addUserModal.modal('hide');

            if (groupname === this.selectedGroup) {
                await this.selectGroup(this.selectedGroup);
            }
        } catch (error) {
            console.error('Error adding partner:', error);
        } finally {
            this.setLoadingState(submitBtn, false);
        }
    }

    async addGroup() {
        if (!this.addGroupForm) return;

        const formData = new FormData(this.addGroupForm);
        const groupname = formData.get('groupname')?.trim();

        if (!groupname) {
            this.showNotification('Пожалуйста, введите название группы', 'error');
            this.setFormFieldError('new-groupname', 'Введите название группы');
            return;
        }

        if (groupname.length > 100) {
            this.showNotification('Название группы слишком длинное (максимум 100 символов)', 'error');
            this.setFormFieldError('new-groupname', 'Слишком длинное название');
            return;
        }

        const submitBtn = this.addGroupForm.querySelector('button[type="submit"]');
        this.setLoadingState(submitBtn, true);

        try {
            const data = await this.apiCall('/admin/api/groups/add', {
                method: 'POST',
                body: JSON.stringify({
                    groupname: groupname
                })
            });

            this.showNotification('Группа успешно создана!', 'success');
            this.addGroupModal.modal('hide');
            await this.loadGroups();
        } catch (error) {
            console.error('Error adding group:', error);
        } finally {
            this.setLoadingState(submitBtn, false);
        }
    }

    async uploadUsersFile() {
        if (!this.uploadFileForm) return;

        const formData = new FormData(this.uploadFileForm);
        const fileInput = this.uploadFileForm.querySelector('input[type="file"]');
        const groupname = formData.get('groupname');

        if (!fileInput.files || fileInput.files.length === 0) {
            this.showNotification('Пожалуйста, выберите файл для загрузки', 'error');
            this.setFormFieldError('file', 'Выберите файл');
            return;
        }

        if (!groupname) {
            this.showNotification('Пожалуйста, выберите группу', 'error');
            this.setFormFieldError('file-groupname', 'Выберите группу');
            return;
        }

        const file = fileInput.files[0];

        if (!file.name.toLowerCase().endsWith('.txt')) {
            this.showNotification('Пожалуйста, выберите файл с расширением .txt', 'error');
            this.setFormFieldError('file', 'Выберите файл .txt');
            return;
        }

        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showNotification('Файл слишком большой. Максимальный размер: 5MB', 'error');
            this.setFormFieldError('file', 'Файл слишком большой');
            return;
        }

        const submitBtn = this.uploadFileForm.querySelector('button[type="submit"]');
        this.setLoadingState(submitBtn, true);

        try {
            const fileContent = await this.readFileAsText(file);

            console.log("UPLOADING FILE");

            const data = await this.apiCall('/admin/api/partners/upload', {
                method: 'POST',
                body: JSON.stringify({
                    groupname: groupname,
                    file_content: fileContent,
                    filename: file.name
                })
            });

            console.log(data);

            this.showNotification('Файл успешно загружен!', 'success');
            this.uploadFileModal.modal('hide');

            if (groupname === this.selectedGroup) {
                await this.selectGroup(this.selectedGroup);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            this.showNotification(error.message || 'Ошибка при загрузке файла', 'error');
        } finally {
            this.setLoadingState(submitBtn, false);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function(event) {
                resolve(event.target.result);
            };

            reader.onerror = function(event) {
                reject(new Error('Ошибка чтения файла: ' + event.target.error));
            };

            reader.readAsText(file, 'UTF-8');
        });
    }

    async deleteGroup(groupname) {
        if (!confirm(`Вы уверены, что хотите удалить группу "${groupname}"?\n\nЭто действие необратимо.`)) {
            return;
        }

        try {
            const data = await this.apiCall('/admin/api/groups/delete', {
                method: 'POST',
                body: JSON.stringify({ groupname })
            });

            this.showNotification('Группа успешно удалена!', 'success');
            await this.loadGroups();

            if (this.selectedGroup === groupname) {
                this.hideEditGroupCard();
            }
        } catch (error) {
            console.error('Error deleting group:', error);
        }
    }

    validateEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    setFormFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.add('is-invalid');
            const feedback = field.parentNode.querySelector('.invalid-feedback');
            if (feedback) {
                feedback.textContent = message;
            }
        }
    }

    clearFormFieldError(fieldId) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.remove('is-invalid');
        }
    }

    resetForm(form) {
        if (!form) return;

        form.reset();

        const invalidFields = form.querySelectorAll('.is-invalid');
        invalidFields.forEach(field => field.classList.remove('is-invalid'));

        const charCountSpan = document.getElementById('group-char-count');
        if (charCountSpan) {
            charCountSpan.textContent = '0';
        }
    }

    setLoadingState(button, isLoading) {
        if (!button) return;

        button.disabled = isLoading;
        const spinner = button.querySelector('.spinner-border');
        const icon = button.querySelector('i.fas');

        if (isLoading) {
            if (spinner) {
                spinner.classList.remove('d-none');
            }
            if (icon) {
                icon.style.display = 'none';
            }

            if (!button.dataset.originalText) {
                button.dataset.originalText = button.innerHTML;
            }

            const loadingText = button.textContent.includes('Сохранить') ? 'Сохранение...' :
                              button.textContent.includes('Добавить') ? 'Добавление...' :
                              button.textContent.includes('Создать') ? 'Создание...' :
                              button.textContent.includes('Загрузить') ? 'Загрузка...' :
                              'Обработка...';

            button.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                ${loadingText}
            `;
        } else {
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
            } else {
                if (spinner) {
                    spinner.classList.add('d-none');
                }
                if (icon) {
                    icon.style.display = '';
                }
            }
        }
    }

    showNotification(message, type = 'success') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => {
            this.hideNotification(notification);
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-message">${this.escapeHtml(message)}</span>
            <button type="button" class="notification-close" aria-label="Закрыть">&times;</button>
        `;

        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        const hideDelay = type === 'error' || type === 'danger' ? 7000 :
                         type === 'info' ? 5000 : 4000;

        setTimeout(() => {
            this.hideNotification(notification);
        }, hideDelay);

        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideNotification(notification));
        }
    }

    hideNotification(notification) {
        if (!notification || !notification.parentNode) return;

        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }

    handleNotificationClose(event) {
        if (event.target.classList.contains('notification-close')) {
            const notification = event.target.closest('.notification');
            if (notification) {
                this.hideNotification(notification);
            }
        }
    }

    escapeHtml(text) {
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

    debug(message, data = null) {
        if (console && console.log) {
            console.log(`[PartnersManagementPanel] ${message}`, data || '');
        }
    }

    selectGroupFromTable(groupname) {
        this.selectGroup(groupname);
    }

    deleteGroupFromTable(groupname) {
        this.deleteGroup(groupname);
    }

    removePartnerFromDisplay(email) {
        this.removePartner(email);
    }
}

let partnersPanel;
$(document).ready(function() {
    partnersPanel = new PartnersManagementPanel();

    if (window.console) {
        window.partnersManagementPanel = partnersPanel;
    }

    const emailInput = document.getElementById('email');
    const groupNameInput = document.getElementById('new-groupname');
    const fileInput = document.getElementById('file');

    if (emailInput) {
        emailInput.addEventListener('input', function() {
            partnersPanel.clearFormFieldError('email');
        });
    }

    if (groupNameInput) {
        groupNameInput.addEventListener('input', function() {
            partnersPanel.clearFormFieldError('new-groupname');
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            partnersPanel.clearFormFieldError('file');
        });
    }

    const partnerGroupSelect = document.getElementById('partner-groupname');
    const fileGroupSelect = document.getElementById('file-groupname');

    if (partnerGroupSelect) {
        partnerGroupSelect.addEventListener('change', function() {
            partnersPanel.clearFormFieldError('partner-groupname');
        });
    }

    if (fileGroupSelect) {
        fileGroupSelect.addEventListener('change', function() {
            partnersPanel.clearFormFieldError('file-groupname');
        });
    }
});