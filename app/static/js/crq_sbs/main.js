import { NotificationManager } from './utils/notificationManager.js';
import { NotificationService } from './services/notificationService.js';
import { ApiClient } from './services/apiClient.js';
import { StateManager } from './services/stateManager.js';
import { CrqService } from './services/crqService.js';
import { LockManager } from './services/lockManager.js';
import { CalendarComponent } from './components/calendarComponent.js';
import { CrqNewModal } from './components/crqNewModal.js';
import { CrqEditModal } from './components/crqEditModal.js';
import { PartnersModal } from './components/partnersModal.js';
import { EmailPreviewModal } from './components/emailPreviewModal.js';

/*
// Класс приложения с интегрированным менеджером блокировок
*/
class Application {
    constructor() {
        this.apiClient = new ApiClient();
        this.stateManager = new StateManager();
        this.crqService = new CrqService(this.apiClient, this.stateManager);
        this.notificationService = new NotificationService(this.apiClient, this.stateManager);
        
        // Initialize lock manager as null initially
        this.lockManager = null;
        
        this.components = {};
        this.isInitialized = false;
    }

    // Инициализация
    async init() {
        if (this.isInitialized) return;

        try {
            // Загрузка плейсхолдера
            this.showGlobalLoading();

            // Инициализация нотификаций
            NotificationManager.init();

            // Initialize lock manager first
            await this.initializeLockManager();

            // Инициализация компонентов с поддержкой блокировок
            this.initializeComponents();

            // Настройка глобального перехватчика ошибок
            this.setupErrorHandling();

            // Setup lock manager event handlers
            this.setupLockManagerEvents();

            this.setupDevTools()

            this.isInitialized = true;

        } catch (error) {
            console.error('Ошибка загрузки модуля CRQ SBS:', error);
            NotificationManager.showError('Ошибка инициализации приложения');
        } finally {
            this.hideGlobalLoading();
        }
    }

    async initializeLockManager() {
        try {
            // Create single instance of lock manager
            this.lockManager = new LockManager(this.apiClient, this.stateManager);
            
            // Wait for connection with reasonable timeout
            await this.waitForLockManagerConnection(5000);
            
        } catch (error) {
            // Set lockManager to null so components know it's unavailable
            this.lockManager = null;
        }
    }

    async waitForLockManagerConnection(timeout = 5000) {
        if (!this.lockManager) return false;
        
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (this.lockManager.isConnected && this.lockManager.sessionId) {
                return true;
            }
            
            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return false;
    }

    initializeComponents() {
        // Calendar component initialization
        const calendarContainer = document.querySelector('.container');
        if (calendarContainer) {
            this.components.calendar = new CalendarComponent(
                calendarContainer, 
                this.stateManager, 
                this.crqService,
                this.apiClient,
                this.lockManager
            );
            window.calendarComponent = this.components.calendar;
        }

        // Modal components - all use the shared lock manager
        this.components.newCrqModal = new CrqNewModal(
            this.stateManager, 
            this.crqService, 
            this.apiClient
        );

        this.components.editCrqModal = new CrqEditModal(
            this.stateManager, 
            this.crqService, 
            this.apiClient,
            this.lockManager
        );

        this.components.partnersModal = new PartnersModal(
            this.stateManager, 
            this.notificationService, 
            this.apiClient
        );

        this.components.userEmailPreview = new EmailPreviewModal(
            'userEmailNotifPreviewModal',
            this.stateManager,
            this.notificationService,
            this.apiClient
        );

        this.components.partnersEmailPreview = new EmailPreviewModal(
            'partnersNotifPreviewModal',
            this.stateManager,
            this.notificationService,
            this.apiClient
        );
    }

    setupLockManagerEvents() {
        if (!this.lockManager) return;

        // Listen to state changes for lock-related updates
        this.stateManager.addEventListener('stateChange', (event) => {
            const { updates } = event.detail;
            
            // Handle lock manager connection status
            if (updates.lockManager) {
                this.updateConnectionStatus(updates.lockManager);
            }
        });
    }

    updateConnectionStatus(lockManagerState) {
        const statusElement = document.querySelector('.lock-connection-status');
        if (!statusElement) return;

        if (lockManagerState.connected) {
            statusElement.className = 'lock-connection-status connected';
            statusElement.textContent = 'Блокировки: подключено';
        } else {
            statusElement.className = 'lock-connection-status disconnected';
            statusElement.textContent = 'Блокировки: отключено';
        }
    }

    setupErrorHandling() {
        // Your existing error handling plus lock-specific errors
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Произошла неожиданная ошибка:', event.reason);
            NotificationManager.showError('Произошла неожиданная ошибка');
            event.preventDefault();
        });

        window.addEventListener('error', (event) => {
            console.error('Ошибка JavaScript:', event.error);
        });

        // Перехват ошибок API включая ошибки блокировок
        this.stateManager.addEventListener('stateChange', (event) => {
            const { updates } = event.detail;
            if (updates.error) {
                console.error('Ошибка API запроса:', updates.error);
                
                // Handle lock-specific errors
                if (updates.error.includes('заблокирован')) {
                    NotificationManager.showWarning(updates.error);
                }
            }
        });
    }

    showGlobalLoading() {
        this.hideGlobalLoading();
        
        const overlay = document.createElement('div');
        overlay.id = 'global-loading';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <p style="margin-top: 16px; color: #666;">Загрузка приложения...</p>
            <div class="lock-connection-status connecting" style="margin-top: 8px; font-size: 12px; color: #999;">
                Подключение к системе блокировок...
            </div>
        `;
        document.body.appendChild(overlay);
    }

    hideGlobalLoading() {
        const overlay = document.getElementById('global-loading');
        if (overlay) {
            overlay.remove();
        }
    }

    // Публичные API для внешних скриптов
    getComponent(name) {
        return this.components[name];
    }

    getService(name) {
        switch (name) {
            case 'crq':
                return this.crqService;
            case 'notification':
                return this.notificationService;
            case 'api':
                return this.apiClient;
            case 'state':
                return this.stateManager;
            case 'lock':
                return this.lockManager;
            default:
                return null;
        }
    }

    // Lock manager specific methods
    async acquireLock(crqNumber) {
        if (!this.lockManager) {
            throw new Error('Lock Manager недоступен');
        }
        return await this.lockManager.acquireLock(crqNumber);
    }

    async releaseLock(crqNumber) {
        if (!this.lockManager) {
            return false;
        }
        return await this.lockManager.releaseLock(crqNumber);
    }

    getLockStatus(crqNumber) {
        if (!this.lockManager) {
            return { status: 'available', lock_info: null };
        }
        return this.lockManager.getLockStatus(crqNumber);
    }

    isLockManagerAvailable() {
        return this.lockManager && this.lockManager.sessionId;
    }

    getDebugInfo() {
        return {
            lockManager: this.lockManager?.getDebugInfo(),
            activeLocks: this.lockManager ? Array.from(this.lockManager.activeLocks) : [],
            isLockManagerAvailable: !!this.lockManager,
            connectionStatus: this.lockManager?.isConnected
        };
    }

    setupDevTools() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            window.CRQ_DEBUG = {
                getState: () => window.app?.getService('state')?.getState(),
                getComponent: (name) => window.app?.getComponent(name),
                getService: (name) => window.app?.getService(name),
                getLockManager: () => window.app?.getService('lock'),
                clearNotifications: () => {
                    const container = document.getElementById('notification-container');
                    if (container) container.innerHTML = '';
                },
                simulateError: () => {
                    throw new Error('Simulated error for testing');
                },
                logApiCalls: (enable = true) => {
                    const apiClient = window.app?.getService('api');
                    if (apiClient) {
                        const originalRequest = apiClient.request;
                        apiClient.request = async function(...args) {
                            if (enable) {
                                console.log('🔗 API Call:', args[0], args[1]);
                            }
                            return originalRequest.apply(this, args);
                        };
                    }
                },
                reloadApp: async () => {
                    if (window.app) {
                        window.app.isInitialized = false;
                        await window.app.init();
                    }
                },
                lockDebug: {
                    getInfo: () => this.getDebugInfo(),
                    acquireLock: (crqNumber) => this.lockManager?.acquireLock(crqNumber),
                    releaseLock: (crqNumber) => this.lockManager?.releaseLock(crqNumber),
                    getLockStatus: (crqNumber) => this.lockManager?.getLockStatus(crqNumber),
                    getActiveLocks: () => this.lockManager ? Array.from(this.lockManager.activeLocks) : [],
                    forceDisconnect: () => this.lockManager?.socket?.disconnect(),
                    reconnect: () => this.lockManager?.socket?.connect(),
                    checkConnection: () => ({
                        isConnected: this.lockManager?.isConnected,
                        sessionId: this.lockManager?.sessionId,
                        userId: this.lockManager?.userId
                    })
                }
            };
            
            console.log('🔧 Development mode detected. Enhanced debugging available:');
            console.log('   - window.CRQ_DEBUG.lockDebug.getInfo() - Get lock manager status');
            console.log('   - window.CRQ_DEBUG.lockDebug.checkConnection() - Check connection');
        }
    }
}

// Инициализация DOM
document.addEventListener('DOMContentLoaded', async function() {
    // Создание инстанса приложения
    window.app = new Application();
    
    try {
        // Инициализация инстанса
        await window.app.init();
        
    } catch (error) {
        console.error('Ошибка инициализации модуля CRQ SBS:', error);
        // Вызов фолбэка ошибок
        showInitializationError(error);
    }
});

// Метод обработки фолбэк ошибок
function showInitializationError(error) {
    // Удаление плейсхолдера
    const loadingOverlay = document.getElementById('global-loading');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
    
    // Создание сообщения ошибки
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.style.cssText = `
        position: fixed; 
        top: 20px; 
        left: 50%; 
        transform: translateX(-50%); 
        z-index: 9999; 
        max-width: 500px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-radius: 8px;
    `;
    errorDiv.innerHTML = `
        <h4>Ошибка инициализации</h4>
        <p>Не удалось загрузить приложение. Возможные причины:</p>
        <ul>
            <li>Проблемы с сетевым подключением</li>
            <li>Ошибка сервера</li>
            <li>Устаревшие данные в кэше браузера</li>
            <li>Недоступность системы блокировок</li>
        </ul>
        <div style="margin-top: 16px;">
            <button class="btn btn-primary" onclick="location.reload()">🔄 Обновить страницу</button>
            <button class="btn btn-secondary" onclick="this.parentElement.parentElement.remove()" style="margin-left: 8px;">✕ Закрыть</button>
        </div>
        <details style="margin-top: 12px;">
            <summary style="cursor: pointer; color: #666;">Технические детали</summary>
            <pre style="background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 8px; font-size: 12px; overflow-x: auto;">${error.message}</pre>
        </details>
    `;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 30000);
}