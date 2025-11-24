// lockManager.js - Fixed version with tooltip management removed
import { NotificationManager } from '../utils/notificationManager.js';

export class LockManager {
    constructor(apiClient, stateManager, socketUrl = null) {
        this.api = apiClient;
        this.state = stateManager;
        this.socket = null;
        this.socketUrl = socketUrl || `${window.location.protocol}//${window.location.host}`;
        this.sessionId = null;
        this.userId = null;
        this.userName = null;
        this.activeLocks = new Set();
        this.lockStatusCallbacks = new Map();
        this.isConnected = false;
        this.connectionPromise = null;

        // Initialize user info first
        this.initializeUserInfo();

        // Then initialize socket
        this.connectionPromise = this.initSocket();
        this.setupHeartbeat();
        this.bindStateEvents();
    }

    initializeUserInfo() {
        // Get or create consistent user ID
        this.userId = this.getOrCreateUserId();
        this.userName = this.getCurrentUserName();
    }

    getOrCreateUserId() {
        // Check various sources for existing user ID
        let userId = window.currentUser?.id ||
                    sessionStorage.getItem('lockManagerUserId') ||
                    localStorage.getItem('lockManagerUserId');

        if (!userId) {
            // Generate a new ID and persist it
            userId = 'user_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('lockManagerUserId', userId);
            localStorage.setItem('lockManagerUserId', userId);
        }

        return userId;
    }

    getCurrentUserName() {
        // Add null check for currentUser
        if (window.currentUser && window.currentUser.username) {
            return window.currentUser.username;
        }

        return sessionStorage.getItem('userName') ||
               localStorage.getItem('userName') ||
               `User_${this.userId?.slice(-4)}`;
    }

    async initSocket() {
        return new Promise((resolve, reject) => {
            try {
                // Enhanced socket configuration
                this.socket = io(this.socketUrl, {
                    transports: ['polling', 'websocket'],
                    timeout: 10000,
                    forceNew: true,
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionAttempts: 5,
                    maxReconnectionAttempts: 5,
                    randomizationFactor: 0.5,
                    autoConnect: true
                });

                this.socket.on('connect', () => {
                    this.sessionId = this.socket.id;
                    this.isConnected = true;
                    console.log('Socket connected successfully:', this.sessionId);

                    // Update connection status in state
                    this.state.setState({
                        lockManager: {
                            connected: true,
                            sessionId: this.sessionId,
                            userId: this.userId,
                            userName: this.userName
                        }
                    });

                    resolve();
                });

                this.socket.on('disconnect', (reason) => {
                    console.log('Socket disconnected:', reason);
                    this.sessionId = null;
                    this.isConnected = false;

                    this.state.setState({
                        lockManager: {
                            connected: false,
                            sessionId: null
                        }
                    });
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Socket connection error:', error);
                    console.error('Error details:', error.description, error.context, error.type);
                    
                    // Don't reject immediately, let it retry
                    if (error.type === 'TransportError') {
                        console.warn('Transport error, will retry with different transport');
                    }
                });

                this.socket.on('reconnect', (attemptNumber) => {
                    console.log('Socket reconnected after', attemptNumber, 'attempts');
                    this.isConnected = true;
                });

                this.socket.on('reconnect_error', (error) => {
                    console.error('Socket reconnection error:', error);
                });

                this.socket.on('reconnect_failed', () => {
                    console.error('Socket reconnection failed after maximum attempts');
                    this.isConnected = false;
                });

                this.socket.on('crq_locked', (data) => {
                    this.handleCrqLocked(data);
                });

                this.socket.on('crq_unlocked', (data) => {
                    this.handleCrqUnlocked(data);
                });

                this.socket.on('crq_force_unlocked', (data) => {
                    this.handleCrqForceUnlocked(data);
                });

                // Resolve after a timeout if connection doesn't happen
                setTimeout(() => {
                    if (!this.isConnected) {
                        console.warn('Socket connection timeout, continuing without socket features');
                        resolve(); // Continue without connection
                    }
                }, 15000); // Increased timeout

            } catch (error) {
                console.error('Failed to initialize Socket.IO:', error);
                NotificationManager.showWarning('Функция блокировки недоступна');
                resolve(); // Don't reject, allow app to work without sockets
            }
        });
    }

    // Wait for connection before performing operations
    async waitForConnection() {
        if (this.isConnected) return true;

        try {
            await this.connectionPromise;
            return this.isConnected;
        } catch (error) {
            console.warn('Connection failed, continuing without socket features');
            return false;
        }
    }

    bindStateEvents() {
        this.state.addEventListener('stateChange', (event) => {
            const { updates } = event.detail;

            if (updates.crqs) {
                this.subscribeToLoadedCrqs(updates.crqs);
            }

            // Listen for lock state changes and update UI accordingly
            if (updates.lockStates) {
                this.updateUIFromLockStates(updates.lockStates);
            }
        });
    }

    subscribeToLoadedCrqs(crqs) {
        if (!this.isConnected || !crqs) return;

        const crqNumbers = new Set();

        if (Array.isArray(crqs)) {
            crqs.forEach(crq => crqNumbers.add(crq.crq_number));
        } else if (typeof crqs === 'object') {
            Object.values(crqs).forEach(dateGroup => {
                if (Array.isArray(dateGroup)) {
                    dateGroup.forEach(crq => crqNumbers.add(crq.crq_number));
                }
            });
        }

        crqNumbers.forEach(crqNumber => {
            this.subscribeToCrq(crqNumber);
        });
    }

    setupHeartbeat() {
        setInterval(() => {
            if (this.activeLocks.size > 0 && this.isConnected) {
                this.activeLocks.forEach(crqNumber => {
                    this.extendLock(crqNumber);
                });

                if (this.socket) {
                    this.socket.emit('user_activity', {
                        userId: this.userId,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }, 120000); // 2 minutes
    }

    async acquireLock(crqNumber, duration = 300) {
        if (!this.userId) {
            throw new Error('User ID not available');
        }

        // Wait for connection
        await this.waitForConnection();

        if (!this.sessionId) {
            throw new Error('Not connected to lock server');
        }

        try {
            const requestData = {
                user_id: this.userId,
                user_name: this.userName,
                session_id: this.sessionId,
                duration: duration
            };

            const response = await this.api.acquireLock(crqNumber, requestData);

            if (response.success) {
                this.activeLocks.add(crqNumber);
                this.subscribeToCrq(crqNumber);

                // Only update state, let UI react to state changes
                this.updateLockState(crqNumber, {
                    locked: true,
                    lockedBy: this.userName,
                    lockedByUserId: this.userId,
                    isOwnLock: true,
                    lockedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + duration * 1000).toISOString()
                });

                return { success: true };
            } else {
                return {
                    success: false,
                    message: response.message,
                    lockedBy: response.locked_by,
                    lock_info: response.lock_info
                };
            }
        } catch (error) {
            console.error('🔒 Error acquiring lock:', error);
            throw error;
        }
    }

    async releaseLock(crqNumber) {
        if (!this.userId || !this.sessionId) {
            console.warn('🔒 Cannot release lock - missing credentials');
            return false;
        }

        try {
            const requestData = {
                user_id: this.userId,
                session_id: this.sessionId
            };

            const response = await this.api.releaseLock(crqNumber, requestData);

            if (response.success) {
                this.activeLocks.delete(crqNumber);
                this.unsubscribeFromCrq(crqNumber);

                // Only update state, let UI react to state changes
                this.updateLockState(crqNumber, {
                    locked: false,
                    lockedBy: null,
                    lockedByUserId: null,
                    isOwnLock: false,
                    lockedAt: null,
                    expiresAt: null
                });

                return true;
            } else {
                console.error('🔒 Failed to release lock:', response.message);

                // If lock not found or not owned, still clean up local state
                if (response.message &&
                    (response.message.includes('not found') ||
                     response.message.includes('not owned') ||
                     response.message.includes('Lock not found'))) {

                    this.activeLocks.delete(crqNumber);
                    this.unsubscribeFromCrq(crqNumber);

                    this.updateLockState(crqNumber, {
                        locked: false,
                        lockedBy: null,
                        lockedByUserId: null,
                        isOwnLock: false,
                        lockedAt: null,
                        expiresAt: null
                    });

                    return true; // Consider it successful since lock is gone
                }

                return false;
            }
        } catch (error) {
            console.error('🔒 Error releasing lock:', error);

            // Handle 404 errors (lock already expired/released)
            if (error.status === 404 ||
                error.message.includes('not found') ||
                error.message.includes('Lock not found')) {

                this.activeLocks.delete(crqNumber);
                this.unsubscribeFromCrq(crqNumber);

                this.updateLockState(crqNumber, {
                    locked: false,
                    lockedBy: null,
                    lockedByUserId: null,
                    isOwnLock: false,
                    lockedAt: null,
                    expiresAt: null
                });

                return true; // Consider successful
            }

            return false;
        }
    }

    async extendLock(crqNumber, duration = 300) {
        if (!this.userId || !this.sessionId) {
            return false;
        }

        try {
            const requestData = {
                    user_id: this.userId,
                    session_id: this.sessionId,
                    duration: duration
                };

            const response = await this.api.extendLock(crqNumber, requestData);

            if (response.success) {
                // Update state with new expiration time
                const currentState = this.state.getState();
                const lockStates = currentState.lockStates || {};
                const currentLockState = lockStates[crqNumber];

                if (currentLockState && currentLockState.isOwnLock) {
                    this.updateLockState(crqNumber, {
                        ...currentLockState,
                        expiresAt: new Date(Date.now() + duration * 1000).toISOString()
                    });
                }
            }

            return response.success;
        } catch (error) {
            console.error('🔒 Error extending lock:', error);
            return false;
        }
    }

    async getLockStatus(crqNumber) {
        try {
            const response = await this.api.getLockStatus(crqNumber);
            return response;
        } catch (error) {
            console.error('🔒 Error getting lock status:', error);
            return { status: 'available', lock_info: null };
        }
    }

    subscribeToCrq(crqNumber) {
        if (this.socket && this.isConnected) {
            this.socket.emit('subscribe_crq', { crq_number: crqNumber });
        }
    }

    unsubscribeFromCrq(crqNumber) {
        if (this.socket && this.isConnected) {
            this.socket.emit('unsubscribe_crq', { crq_number: crqNumber });
        }
    }

    handleCrqLocked(data) {
        const { crq_number, user_id, user_name, locked_at, expires_at } = data;

        // Only update state, UI will react to state changes
        this.updateLockState(crq_number, {
            locked: true,
            lockedBy: user_name,
            lockedByUserId: user_id,
            isOwnLock: user_id === this.userId,
            lockedAt: locked_at,
            expiresAt: expires_at
        });

        if (user_id !== this.userId) {
            NotificationManager.showInfo(`CRQ ${crq_number} заблокирован пользователем ${user_name}`);
        }
    }

    handleCrqUnlocked(data) {
        const { crq_number, reason } = data;

        // Only update state, UI will react to state changes
        this.updateLockState(crq_number, {
            locked: false,
            lockedBy: null,
            lockedByUserId: null,
            isOwnLock: false,
            lockedAt: null,
            expiresAt: null
        });

        let message = `CRQ ${crq_number} разблокирован`;
        if (reason === 'expired') {
            message += ' (истекло время блокировки)';
        } else if (reason === 'user_disconnect') {
            message += ' (пользователь отключился)';
        }

        NotificationManager.showInfo(message);
    }

    handleCrqForceUnlocked(data) {
        const { crq_number, reason } = data;

        this.activeLocks.delete(crq_number);

        // Only update state, UI will react to state changes
        this.updateLockState(crq_number, {
            locked: false,
            lockedBy: null,
            lockedByUserId: null,
            isOwnLock: false,
            lockedAt: null,
            expiresAt: null
        });

        NotificationManager.showWarning(`CRQ ${crq_number} принудительно разблокирован: ${reason}`);
    }

    // Centralized state management - single source of truth
    updateLockState(crqNumber, lockInfo) {
        const currentState = this.state.getState();
        const lockStates = currentState.lockStates || {};

        // Update the state
        lockStates[crqNumber] = lockInfo;
        this.state.setState({ lockStates });
    }

    // Update UI based on state changes - ONLY CSS CLASSES, NO TOOLTIPS
    updateUIFromLockStates(lockStates) {
        Object.entries(lockStates).forEach(([crqNumber, lockInfo]) => {
            this.updateCrqButtonLockStatus(crqNumber, lockInfo);
        });
    }

    // FIXED: Only handles CSS classes, NO tooltip management
    updateCrqButtonLockStatus(crqNumber, lockInfo) {
        const crqButton = document.querySelector(`[data-crq-number="${crqNumber}"]`);
        if (!crqButton) return;

        // Remove existing lock classes
        crqButton.classList.remove('locked', 'locked-by-me', 'locked-by-other');

        // Store lock info in data attributes for CalendarComponent tooltip system
        if (lockInfo.locked) {
            crqButton.classList.add('locked');
            crqButton.setAttribute('data-lock-status', 'locked');
            crqButton.setAttribute('data-lock-user-name', lockInfo.lockedBy);
            crqButton.setAttribute('data-lock-user-id', lockInfo.lockedByUserId);
            crqButton.setAttribute('data-lock-is-own', lockInfo.isOwnLock ? 'true' : 'false');

            if (lockInfo.isOwnLock) {
                crqButton.classList.add('locked-by-me');
            } else {
                crqButton.classList.add('locked-by-other');
            }
        } else {
            crqButton.setAttribute('data-lock-status', 'available');
            crqButton.removeAttribute('data-lock-user-name');
            crqButton.removeAttribute('data-lock-user-id');
            crqButton.removeAttribute('data-lock-is-own');
        }
    }

    isLockedByCurrentUser(crqNumber) {
        const currentState = this.state.getState();
        const lockStates = currentState.lockStates || {};
        const lockInfo = lockStates[crqNumber];

        return lockInfo && lockInfo.locked && lockInfo.isOwnLock;
    }

    // Get lock info from state instead of internal tracking
    getLockInfo(crqNumber) {
        const currentState = this.state.getState();
        const lockStates = currentState.lockStates || {};
        return lockStates[crqNumber] || null;
    }

    // Debug info
    getDebugInfo() {
        const currentState = this.state.getState();
        const lockStates = currentState.lockStates || {};

        return {
            userId: this.userId,
            userName: this.userName,
            sessionId: this.sessionId,
            isConnected: this.isConnected,
            activeLocks: Array.from(this.activeLocks),
            lockStates: lockStates
        };
    }

    destroy() {
        // Release all active locks
        const lockPromises = Array.from(this.activeLocks).map(crqNumber => 
            this.releaseLock(crqNumber)
        );
        
        Promise.all(lockPromises).then(() => {
            console.log('🔒 All locks released');
        });

        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}