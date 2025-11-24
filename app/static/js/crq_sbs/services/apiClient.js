/*
// Класс обработки API запросов с поддержкой блокировок
*/
export class ApiClient {
    constructor(baseURL = '/crq/api') {
        this.baseURL = baseURL;
        this.headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: { ...this.headers, ...options.headers },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                // Handle lock-specific errors
                if (response.status === 423) {
                    throw new ApiError(data.message || 'Resource is locked', 423, data.errors);
                }
                
                throw new ApiError(data.message || 'Request failed', response.status, data.errors);
            }

            return data;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError('Network error occurred', 0, { network: 'Failed to connect to server' });
        }
    }

    // Эндпоинты CRQ
    async getCrqs(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = `/calendar${queryString ? `?${queryString}` : ''}`;
        return this.request(endpoint);
    }

    async getCrq(crqNumber, source = 'CRQSending') {
        return this.request(`/find/${crqNumber}?source=${source}`);
    }

    async createCrq(crqData) {
        return this.request('/create', {
            method: 'POST',
            body: JSON.stringify(crqData)
        });
    }

    async updateCrq(crqNumber, crqData) {
        return this.request(`/update/${crqNumber}`, {
            method: 'POST',
            body: JSON.stringify(crqData)
        });
    }

    async deleteCrq(crqNumber) {
        return this.request(`/delete/${crqNumber}`, {
            method: 'POST'
        });
    }

    // Эндпоинты блокировок
    async acquireLock(crqNumber, lockData) {
        return this.request(`/locks/${crqNumber}`, {
            method: 'POST',
            body: JSON.stringify(lockData)
        });
    }

    async releaseLock(crqNumber, lockData) {
        return this.request(`/locks/${crqNumber}`, {
            method: 'DELETE',
            body: JSON.stringify(lockData)
        });
    }

    async extendLock(crqNumber, lockData) {
        return this.request(`/locks/${crqNumber}`, {
            method: 'PUT',
            body: JSON.stringify(lockData)
        });
    }

    async getLockStatus(crqNumber) {
        return this.request(`/locks/${crqNumber}`);
    }

    async getAllLocks() {
        return this.request('/locks');
    }

    // Admin lock endpoints
    async forceReleaseLock(crqNumber) {
        return this.request(`/admin/locks/${crqNumber}`, {
            method: 'DELETE'
        });
    }

    // Эндпоинты файловой системы
    async uploadFiles(uploadFilesData) {
        const formData = new FormData();
        
        formData.append('crqNumber', uploadFilesData.crqNumber);
        
        uploadFilesData.files.forEach(file => {
            formData.append('files', file);
        });
        
        return this.request('/files/upload', {
            method: 'POST',
            headers: {},
            body: formData
        });
    }

    async uploadTemporaryFiles(uploadFilesData) {
        const formData = new FormData();
        
        uploadFilesData.files.forEach(file => {
            formData.append('files', file);
        });
        
        return this.request('/files/upload', {
            method: 'POST',
            headers: {},
            body: formData
        });
    }

    async deleteFile(fileId) {
        return this.request(`/files/delete/${fileId}`, {
            method: 'POST'
        });
    }

    // Эндопинты рассылок
    async sendEmail(template, data) {
        return this.request('/email/send_async', {
            method: 'POST',
            body: JSON.stringify({ template, data })
        });
    }

    async previewEmail(template, data) {
        const response = await this.request('/email/preview', {
            method: 'POST',
            body: JSON.stringify({ template, data })
        });
        
        // Handle HTTP errors
        if (!response.status == 'success') {
            throw new Error(response.message || 'Ошибка сервера');
        }
        
        return response;
    }

    // Эндпоинты ресурсов
    getSubscriptions() {
        return this.request('/resources/subscriptions');
    }

    async getPartnerGroups() {
        return this.request('/resources/partner-groups');
    }
}

export class ApiError extends Error {
    constructor(message, status, errors = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors;
        this.isLockError = status === 423;
    }
}