/*
// Класс определения состояний компонентов модуля с поддержкой блокировок
*/
export class StateManager extends EventTarget {
    constructor() {
        super();

        const defaultRange = this.getDefaultDateRange();

        this.state = {
            // Данные CRQ
            crqs: [],
            currentCrq: null,
            
            // Состояние UI
            loading: {
                calendar: false,
                modal: false,
                general: false
            },
            error: null,
            currentService: 'td',
            
            // Фильтры
            filters: {
                service: 'td',
                startDate: defaultRange.startDate,
                endDate: defaultRange.endDate
            },
            
            // Ресурсы
            subscriptions: [],
            partnerGroups: [],
            
            // Файлы
            fileCollections: {
                newCrqFiles: new Map(),
                editCrqFiles: new Map(),
                existingFiles: new Map()
            },
            
            // Формы
            formStates: {
                newCrq: { isValid: false, errors: {} },
                editCrq: { isValid: false, errors: {} },
                partners: { isValid: false, errors: {} }
            },

            // Состояния блокировок
            lockManager: {
                connected: false,
                sessionId: null,
                userId: null,
                userName: null
            },
            
            // Состояния блокировок для отдельных CRQ
            lockStates: {},
            
            // Активные блокировки текущего пользователя
            activeLocks: new Set(),
            
            // Глобальная информация о блокировках (для админов)
            globalLocks: {}
        };
    }

    setState(updates) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...updates };
        
        this.dispatchEvent(new CustomEvent('stateChange', {
            detail: { oldState, newState: this.state, updates }
        }));
    }

    getState() {
        return { ...this.state };
    }

    // Методы CRQ
    setCrqs(crqs) {
        this.setState({ crqs });
    }

    addCrq(crq) {
        if (!this.state.crqs || !Array.isArray(this.state.crqs)) {
            this.setState({ crqs: [crq] });
        } else {
            this.setState({ crqs: [...this.state.crqs, crq] });
        }
    }

    updateCrq(crqNumber, updates) {
        if (!this.state.crqs || typeof this.state.crqs !== 'object') {
            console.error('this.state.crqs is not an object:', this.state.crqs);
            return;
        }
        
        const updatedCrqs = { ...this.state.crqs };
        let crqFound = false;
        
        Object.keys(updatedCrqs).forEach(date => {
            if (Array.isArray(updatedCrqs[date])) {
                updatedCrqs[date] = updatedCrqs[date].map(crq => {
                    if (crq.crq_number === crqNumber) {
                        crqFound = true;
                        return { ...crq, ...updates };
                    }
                    return crq;
                });
            }
        });
        
        if (!crqFound) {
            console.warn(`CRQ ${crqNumber} not found in any date`);
        }
        
        this.setState({ crqs: updatedCrqs });
    }

    deleteCrq(crqNumber) {
        const crqs = this.state.crqs.filter(crq => crq.crq_number !== crqNumber);
        this.setState({ crqs });
        
        // Also clean up lock state for deleted CRQ
        this.removeLockState(crqNumber);
    }

    setCurrentCrq(crq) {
        this.setState({ currentCrq: crq });
    }

    // Методы состояния UI
    setCalendarLoading(loading) {
        this.setState({ 
            loading: { ...this.state.loading, calendar: loading }
        });
    }

    setModalLoading(loading) {
        this.setState({ 
            loading: { ...this.state.loading, modal: loading }
        });
    }

    setGeneralLoading(loading) {
        this.setState({ 
            loading: { ...this.state.loading, general: loading }
        });
    }

    setError(error) {
        this.setState({ error });
    }

    clearError() {
        this.setState({ error: null });
    }

    setCurrentService(service) {
        this.setState({ 
            currentService: service,
            filters: { ...this.state.filters, service }
        });
    }

    setFilters(filters) {
        this.setState({ 
            filters: { ...this.state.filters, ...filters }
        });
    }

    // Методы ресурсов
    setSubscriptions(subscriptions) {
        this.setState({ subscriptions });
    }

    setPartnerGroups(partnerGroups) {
        this.setState({ partnerGroups });
    }

    // Методы файлов
    addFile(collection, fileId, file) {
        const fileCollections = { ...this.state.fileCollections };
        fileCollections[collection].set(fileId, file);
        this.setState({ fileCollections });
    }

    removeFile(collection, fileId) {
        const fileCollections = { ...this.state.fileCollections };
        fileCollections[collection].delete(fileId);
        this.setState({ fileCollections });
    }

    clearFiles(collection) {
        const fileCollections = { ...this.state.fileCollections };
        fileCollections[collection].clear();
        this.setState({ fileCollections });
    }

    // Методы валидации форм
    setFormValidation(formName, isValid, errors = {}) {
        const formStates = {
            ...this.state.formStates,
            [formName]: { isValid, errors }
        };
        this.setState({ formStates });
    }

    // Методы управления блокировками
    setLockManagerState(lockManagerState) {
        this.setState({
            lockManager: { ...this.state.lockManager, ...lockManagerState }
        });
    }

    setLockState(crqNumber, lockState) {
        const lockStates = {
            ...this.state.lockStates,
            [crqNumber]: lockState
        };
        this.setState({ lockStates });
    }

    removeLockState(crqNumber) {
        const lockStates = { ...this.state.lockStates };
        delete lockStates[crqNumber];
        
        // Also remove from active locks
        const activeLocks = new Set(this.state.activeLocks);
        activeLocks.delete(crqNumber);
        
        this.setState({ lockStates, activeLocks });
    }

    addActiveLock(crqNumber) {
        const activeLocks = new Set(this.state.activeLocks);
        activeLocks.add(crqNumber);
        this.setState({ activeLocks });
    }

    removeActiveLock(crqNumber) {
        const activeLocks = new Set(this.state.activeLocks);
        activeLocks.delete(crqNumber);
        this.setState({ activeLocks });
    }

    setGlobalLocks(globalLocks) {
        this.setState({ globalLocks });
    }

    updateGlobalLock(crqNumber, lockInfo) {
        const globalLocks = {
            ...this.state.globalLocks,
            [crqNumber]: lockInfo
        };
        this.setState({ globalLocks });
    }

    removeGlobalLock(crqNumber) {
        const globalLocks = { ...this.state.globalLocks };
        delete globalLocks[crqNumber];
        this.setState({ globalLocks });
    }

    // Методы получения информации о блокировках
    isLocked(crqNumber) {
        const lockState = this.state.lockStates[crqNumber];
        return lockState && lockState.locked;
    }

    isLockedByCurrentUser(crqNumber) {
        const lockState = this.state.lockStates[crqNumber];
        return lockState && lockState.locked && lockState.isOwnLock;
    }

    isLockedByOtherUser(crqNumber) {
        const lockState = this.state.lockStates[crqNumber];
        return lockState && lockState.locked && !lockState.isOwnLock;
    }

    getLockInfo(crqNumber) {
        return this.state.lockStates[crqNumber] || null;
    }

    getActiveLocks() {
        return Array.from(this.state.activeLocks);
    }

    getLockManagerStatus() {
        return {
            connected: this.state.lockManager.connected,
            sessionId: this.state.lockManager.sessionId,
            activeLockCount: this.state.activeLocks.size
        };
    }

    // Методы очистки состояний блокировок
    clearAllLockStates() {
        this.setState({
            lockStates: {},
            activeLocks: new Set(),
            globalLocks: {}
        });
    }

    clearUserLocks() {
        // Clear only current user's active locks, keep lock states for UI
        this.setState({
            activeLocks: new Set()
        });
    }

    getDefaultDateRange() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);

        return {
            startDate: this.formatDate(startDate),
            endDate: this.formatDate(endDate)
        };
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    // Utility method for debugging lock states
    debugLockStates() {
        console.group('🔒 Lock States Debug');
        console.log('Lock Manager:', this.state.lockManager);
        console.log('Active Locks:', Array.from(this.state.activeLocks));
        console.log('Lock States:', this.state.lockStates);
        console.log('Global Locks:', this.state.globalLocks);
        console.groupEnd();
    }
}