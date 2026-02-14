const WebSocket = require('ws');
const config = require('../config/angel.config');
const settings = require('../config/settings.config');
const authService = require('./auth.service');

class FocusWebSocketService {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        
        this.subscriptions = new Map();
        this.priorityBuckets = {
            CORE: new Set(),
            ACTIVE: new Set(),
            VOLUME_LEADERS: new Set(),
            EXPLOSION: new Set(),
            ROTATION: new Set()
        };
        this.tokenActivity = new Map();
        this.lastActivityCheck = Date.now();
        
        this.priceCallbacks = [];
        this.connectionCallbacks = [];
        
        this.reconnectAttempts = 0;
        this.rateLimitHits = 0;
        this.lastConnectTime = 0;
        
        this.pingInterval = null;
        this.reconnectTimeout = null;
        
        this.livePrices = new Map();
        this.lastUpdateTime = new Map();
        
        this.wsSettings = settings.websocket || {
            maxSubscriptions: 50,
            maxReconnectAttempts: 10,
            baseReconnectDelay: 1000,
            maxReconnectDelay: 60000,
            minConnectInterval: 5000,
            pingInterval: 30000,
            rateLimitCooldown: 30000
        };
        
        this.subscriptionLeakGuard = new Set();
    }

    async connect() {
        if (this.isConnecting) {
            console.log('[WS] Connection already in progress - singleton guard active');
            return false;
        }

        const now = Date.now();
        if (now - this.lastConnectTime < this.wsSettings.minConnectInterval) {
            console.log('[WS] Rate limiting connection attempts');
            return false;
        }

        this.isConnecting = true;
        this.lastConnectTime = now;

        try {
            await authService.ensureAuthenticated();
            
            const feedToken = authService.feedToken;
            const clientId = config.clientId;
            
            if (!feedToken) {
                throw new Error('No feed token available');
            }

            this.cleanup();

            const wsUrl = `${config.endpoints.wsUrl}?clientCode=${clientId}&feedToken=${feedToken}&apiKey=${config.apiKey}`;
            
            this.ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${authService.jwtToken}`,
                    'x-api-key': config.apiKey,
                    'x-client-code': clientId,
                    'x-feed-token': feedToken
                }
            });

            this.ws.binaryType = 'arraybuffer';
            this.setupEventHandlers();
            
            return true;
        } catch (error) {
            console.error('[WS] Connection error:', error.message);
            this.isConnecting = false;
            this.scheduleReconnect();
            return false;
        }
    }

    setupEventHandlers() {
        this.ws.on('open', () => {
            console.log('[WS] Connected successfully');
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.rateLimitHits = 0;
            
            this.startPing();
            this.resubscribeByPriority();
            
            this.connectionCallbacks.forEach(cb => {
                try { cb({ connected: true }); } catch (e) {}
            });
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[WS] Disconnected: code=${code}`);
            this.isConnected = false;
            this.isConnecting = false;
            this.stopPing();
            
            if (code === 429) {
                this.rateLimitHits++;
                console.log(`[WS] Rate limit hit #${this.rateLimitHits} - applying extended cooldown`);
            }
            
            this.connectionCallbacks.forEach(cb => {
                try { cb({ connected: false, code }); } catch (e) {}
            });
            
            this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
            console.error('[WS] Error:', error.message);
            this.isConnecting = false;
        });
    }

    cleanup() {
        this.stopPing();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.wsSettings.maxReconnectAttempts) {
            console.log('[WS] Max reconnect attempts reached - manual intervention required');
            return;
        }

        if (this.reconnectTimeout) {
            return;
        }

        this.reconnectAttempts++;
        
        let delay = Math.min(
            this.wsSettings.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.wsSettings.maxReconnectDelay
        );
        
        delay += Math.random() * 1000;

        if (this.rateLimitHits > 0) {
            delay += this.rateLimitHits * this.wsSettings.rateLimitCooldown;
            console.log(`[WS] Rate limit cooldown: adding ${this.rateLimitHits * this.wsSettings.rateLimitCooldown}ms`);
        }

        console.log(`[WS] Scheduling reconnect in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.wsSettings.maxReconnectAttempts})`);
        
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (!this.isConnected && !this.isConnecting) {
                this.connect();
            }
        }, delay);
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.isConnected) {
                try {
                    this.ws.ping();
                } catch (e) {
                    console.error('[WS] Ping error:', e.message);
                }
            }
        }, this.wsSettings.pingInterval);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    handleMessage(data) {
        try {
            if (data instanceof ArrayBuffer && data.byteLength > 0) {
                const parsed = this.parseBinaryMessage(data);
                if (parsed && parsed.token) {
                    this.livePrices.set(parsed.token, parsed);
                    this.lastUpdateTime.set(parsed.token, Date.now());
                    
                    this.priceCallbacks.forEach(cb => {
                        try {
                            cb(parsed);
                        } catch (e) {
                            console.error('[WS] Callback error:', e.message);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('[WS] Message parse error:', error.message);
        }
    }

    parseBinaryMessage(buffer) {
        const view = new DataView(buffer);
        
        if (buffer.byteLength < 25) return null;

        try {
            const subscriptionMode = view.getInt8(0);
            const exchangeType = view.getInt8(1);
            const token = view.getBigInt64(2, true).toString();
            const sequenceNumber = Number(view.getBigInt64(10, true));
            const exchangeTimestamp = Number(view.getBigInt64(18, true));
            const ltp = view.getInt32(26, true) / 100;
            
            let volume = 0;
            let open = 0;
            let high = 0;
            let low = 0;
            let close = ltp;
            let avgPrice = 0;
            let oi = 0;

            if (buffer.byteLength >= 50) {
                avgPrice = view.getInt32(38, true) / 100;
                volume = Number(view.getBigInt64(42, true));
            }

            if (buffer.byteLength >= 130) {
                open = view.getInt32(66, true) / 100;
                high = view.getInt32(70, true) / 100;
                low = view.getInt32(74, true) / 100;
                close = view.getInt32(78, true) / 100;
            }

            if (buffer.byteLength >= 164) {
                oi = Number(view.getBigInt64(130, true));
            }

            return {
                token,
                exchange: exchangeType,
                ltp,
                open: open || ltp,
                high: high || ltp,
                low: low || ltp,
                close: close || ltp,
                volume,
                avgPrice,
                oi,
                timestamp: Date.now(),
                exchangeTimestamp
            };
        } catch (e) {
            return null;
        }
    }

    subscribeWithPriority(tokens, priority = 'ROTATION') {
        if (!Array.isArray(tokens)) tokens = [tokens];
        if (tokens.length === 0) return;

        tokens.forEach(token => {
            Object.values(this.priorityBuckets).forEach(bucket => bucket.delete(token));
            this.priorityBuckets[priority].add(token);
        });

        this.enforceSubscriptionLimit();
        this.syncSubscriptions();
    }

    enforceSubscriptionLimit() {
        const maxSubs = this.wsSettings.maxSubscriptions;
        const coreCount = this.priorityBuckets.CORE.size;
        const activeCount = this.priorityBuckets.ACTIVE.size;
        const rotationCount = this.priorityBuckets.ROTATION.size;

        const total = coreCount + activeCount + rotationCount;

        if (total <= maxSubs) return;

        let excess = total - maxSubs;

        if (excess > 0 && rotationCount > 0) {
            const rotationArray = Array.from(this.priorityBuckets.ROTATION);
            const toRemove = rotationArray.slice(0, Math.min(excess, rotationCount));
            toRemove.forEach(token => this.priorityBuckets.ROTATION.delete(token));
            excess -= toRemove.length;
        }

        if (excess > 0 && activeCount > 0) {
            const activeArray = Array.from(this.priorityBuckets.ACTIVE);
            const toRemove = activeArray.slice(0, Math.min(excess, activeCount));
            toRemove.forEach(token => this.priorityBuckets.ACTIVE.delete(token));
            excess -= toRemove.length;
        }

        console.log(`[WS] Enforced limit: CORE=${this.priorityBuckets.CORE.size}, ACTIVE=${this.priorityBuckets.ACTIVE.size}, ROTATION=${this.priorityBuckets.ROTATION.size}`);
    }

    syncSubscriptions() {
        const allTokens = new Set([
            ...this.priorityBuckets.CORE,
            ...this.priorityBuckets.ACTIVE,
            ...this.priorityBuckets.ROTATION
        ]);

        const currentTokens = new Set(this.subscriptions.keys());

        const toSubscribe = [...allTokens].filter(t => !currentTokens.has(t));
        const toUnsubscribe = [...currentTokens].filter(t => !allTokens.has(t));

        if (toUnsubscribe.length > 0) {
            this.unsubscribeTokens(toUnsubscribe);
        }

        if (toSubscribe.length > 0) {
            this.subscribeTokens(toSubscribe);
        }
    }

    subscribeTokens(tokens, exchangeType = 1, mode = 3) {
        if (!Array.isArray(tokens) || tokens.length === 0) return;

        tokens.forEach(t => {
            this.subscriptions.set(t, { exchange: exchangeType, mode, subscribedAt: Date.now() });
            this.subscriptionLeakGuard.add(t);
        });

        if (this.ws && this.isConnected) {
            const payload = {
                correlationID: `sub_${Date.now()}`,
                action: 1,
                params: {
                    mode: mode,
                    tokenList: [{
                        exchangeType: exchangeType,
                        tokens: tokens
                    }]
                }
            };

            try {
                this.ws.send(JSON.stringify(payload));
                console.log(`[WS] Subscribed ${tokens.length} tokens (total: ${this.subscriptions.size}/${this.wsSettings.maxSubscriptions})`);
            } catch (e) {
                console.error('[WS] Subscribe error:', e.message);
            }
        }
    }

    unsubscribeTokens(tokens, exchangeType = 1) {
        if (!Array.isArray(tokens) || tokens.length === 0) return;

        tokens.forEach(t => {
            this.subscriptions.delete(t);
            this.subscriptionLeakGuard.delete(t);
        });

        if (this.ws && this.isConnected) {
            const payload = {
                correlationID: `unsub_${Date.now()}`,
                action: 0,
                params: {
                    mode: 3,
                    tokenList: [{
                        exchangeType: exchangeType,
                        tokens: tokens
                    }]
                }
            };

            try {
                this.ws.send(JSON.stringify(payload));
                console.log(`[WS] Unsubscribed ${tokens.length} tokens`);
            } catch (e) {
                console.error('[WS] Unsubscribe error:', e.message);
            }
        }
    }

    subscribe(tokens, exchangeType = 1, mode = 3) {
        this.subscribeWithPriority(tokens, 'ROTATION');
    }

    unsubscribe(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        tokens.forEach(token => {
            Object.values(this.priorityBuckets).forEach(bucket => bucket.delete(token));
        });

        this.unsubscribeTokens(tokens);
    }

    resubscribeByPriority() {
        if (this.subscriptions.size === 0 && 
            this.priorityBuckets.CORE.size === 0 && 
            this.priorityBuckets.ACTIVE.size === 0) {
            return;
        }

        this.subscriptions.clear();

        const coreTokens = Array.from(this.priorityBuckets.CORE);
        const activeTokens = Array.from(this.priorityBuckets.ACTIVE);
        const rotationTokens = Array.from(this.priorityBuckets.ROTATION);

        setTimeout(() => {
            if (coreTokens.length > 0) {
                this.subscribeTokens(coreTokens, 1, 3);
            }
        }, 100);

        setTimeout(() => {
            if (activeTokens.length > 0) {
                this.subscribeTokens(activeTokens, 1, 3);
            }
        }, 600);

        setTimeout(() => {
            const maxRotation = this.wsSettings.maxSubscriptions - coreTokens.length - activeTokens.length;
            if (rotationTokens.length > 0 && maxRotation > 0) {
                this.subscribeTokens(rotationTokens.slice(0, maxRotation), 1, 3);
            }
        }, 1100);
    }

    shiftPriority(token, fromBucket, toBucket) {
        if (this.priorityBuckets[fromBucket]) {
            this.priorityBuckets[fromBucket].delete(token);
        }
        if (this.priorityBuckets[toBucket]) {
            this.priorityBuckets[toBucket].add(token);
        }
        this.enforceSubscriptionLimit();
    }

    promoteToActive(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        tokens.forEach(token => {
            this.priorityBuckets.ROTATION.delete(token);
            this.priorityBuckets.ACTIVE.add(token);
        });
        this.enforceSubscriptionLimit();
        this.syncSubscriptions();
    }

    demoteToRotation(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        tokens.forEach(token => {
            if (!this.priorityBuckets.CORE.has(token)) {
                this.priorityBuckets.ACTIVE.delete(token);
                this.priorityBuckets.ROTATION.add(token);
            }
        });
        this.enforceSubscriptionLimit();
        this.syncSubscriptions();
    }

    evictFromRotation(count) {
        const rotationArray = Array.from(this.priorityBuckets.ROTATION);
        const toEvict = rotationArray.slice(0, count);
        
        toEvict.forEach(token => {
            this.priorityBuckets.ROTATION.delete(token);
        });

        this.unsubscribeTokens(toEvict);
        return toEvict;
    }

    checkForLeaks() {
        const subscribed = new Set(this.subscriptions.keys());
        const inBuckets = new Set([
            ...this.priorityBuckets.CORE,
            ...this.priorityBuckets.ACTIVE,
            ...this.priorityBuckets.ROTATION
        ]);

        const leaks = [...subscribed].filter(t => !inBuckets.has(t));
        
        if (leaks.length > 0) {
            console.log(`[WS] Detected ${leaks.length} subscription leaks, cleaning up...`);
            this.unsubscribeTokens(leaks);
        }

        return leaks;
    }

    onPrice(callback) {
        this.priceCallbacks.push(callback);
        return () => {
            const idx = this.priceCallbacks.indexOf(callback);
            if (idx > -1) this.priceCallbacks.splice(idx, 1);
        };
    }

    onConnection(callback) {
        this.connectionCallbacks.push(callback);
        return () => {
            const idx = this.connectionCallbacks.indexOf(callback);
            if (idx > -1) this.connectionCallbacks.splice(idx, 1);
        };
    }

    getLivePrice(token) {
        return this.livePrices.get(token) || null;
    }

    getAllLivePrices() {
        return new Map(this.livePrices);
    }

    getPriorityBuckets() {
        return {
            CORE: Array.from(this.priorityBuckets.CORE),
            ACTIVE: Array.from(this.priorityBuckets.ACTIVE),
            ROTATION: Array.from(this.priorityBuckets.ROTATION)
        };
    }

    getStatus() {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            subscriptionCount: this.subscriptions.size,
            maxSubscriptions: this.wsSettings.maxSubscriptions,
            availableSlots: this.wsSettings.maxSubscriptions - this.subscriptions.size,
            buckets: {
                CORE: this.priorityBuckets.CORE.size,
                ACTIVE: this.priorityBuckets.ACTIVE.size,
                ROTATION: this.priorityBuckets.ROTATION.size
            },
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.wsSettings.maxReconnectAttempts,
            rateLimitHits: this.rateLimitHits,
            livePricesCount: this.livePrices.size,
            leakGuardSize: this.subscriptionLeakGuard.size
        };
    }

    disconnect() {
        console.log('[WS] Disconnecting...');
        this.cleanup();
        this.isConnected = false;
        this.subscriptions.clear();
        Object.values(this.priorityBuckets).forEach(bucket => bucket.clear());
        this.livePrices.clear();
        this.subscriptionLeakGuard.clear();
    }
}

module.exports = new FocusWebSocketService();
