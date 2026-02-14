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
        // 🔴 PRIORITY BUCKET STRUCTURE V2.0: Intelligent Rotation
        this.priorityBuckets = {
            CORE: new Set(),           // Indices only - never unsubscribed
            ACTIVE_EQUITY: new Set(),  // Explosive equity runners
            ACTIVE_OPTIONS: new Set(), // Explosive option strikes
            HIGH_RS: new Set(),        // High relative strength stocks
            HIGH_OI: new Set(),        // High OI acceleration strikes
            ROTATION: new Set()        // Remaining - rotates every 60 sec
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
        this.rotationInterval = null;
        
        this.livePrices = new Map();
        this.lastUpdateTime = new Map();
        
        this.wsSettings = settings.websocket || {
            maxSubscriptions: 50,
            maxReconnectAttempts: 10,
            baseReconnectDelay: 1000,
            maxReconnectDelay: 60000,
            minConnectInterval: 5000,
            pingInterval: 30000,
            rateLimitCooldown: 30000,
            rotationIntervalSec: 60
        };
        
        this.subscriptionLeakGuard = new Set();
        this.coreOnlyMode = false;
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
            this.startRotation();
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
        this.stopRotation();
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

    // 🔴 AUTO ROTATION EVERY 120 SECONDS
    startRotation() {
        this.stopRotation();
        const rotationMs = (this.wsSettings.rotationIntervalSec || 120) * 1000;
        
        this.rotationInterval = setInterval(() => {
            this.rotateSubscriptions();
        }, rotationMs);
        
        console.log(`[WS] Auto-rotation started: every ${rotationMs / 1000}s`);
    }

    stopRotation() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
        }
    }

    rotateSubscriptions() {
        if (this.coreOnlyMode) {
            console.log('[WS] Rotation skipped - CORE ONLY mode active');
            return;
        }

        const rotationTokens = Array.from(this.priorityBuckets.ROTATION);
        if (rotationTokens.length === 0) return;

        // Rotate: move first 5 to end
        const toRotate = Math.min(5, Math.floor(rotationTokens.length / 2));
        const rotated = rotationTokens.slice(toRotate).concat(rotationTokens.slice(0, toRotate));
        
        this.priorityBuckets.ROTATION = new Set(rotated);
        
        // Re-sync subscriptions
        this.enforceSubscriptionLimit();
        this.syncSubscriptions();
        
        console.log(`[WS] Rotation complete: ${toRotate} tokens cycled`);
    }

    // 🔴 CORE ONLY MODE (CPU > 90%)
    enableCoreOnlyMode() {
        if (this.coreOnlyMode) return;
        
        this.coreOnlyMode = true;
        console.log('[WS] CORE ONLY MODE ENABLED - Unsubscribing non-core tokens');
        
        // Unsubscribe everything except CORE
        const nonCore = [
            ...this.priorityBuckets.ACTIVE,
            ...this.priorityBuckets.EXPLOSION,
            ...this.priorityBuckets.ROTATION
        ];
        
        if (nonCore.length > 0) {
            this.unsubscribeTokens(nonCore);
        }
    }

    disableCoreOnlyMode() {
        if (!this.coreOnlyMode) return;
        
        this.coreOnlyMode = false;
        console.log('[WS] CORE ONLY MODE DISABLED - Resuming full subscriptions');
        
        // Re-sync all buckets
        this.syncSubscriptions();
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
        const explosionCount = this.priorityBuckets.EXPLOSION.size;
        const rotationCount = this.priorityBuckets.ROTATION.size;

        // 🔴 HARD LIMIT: 50 MAX
        const total = coreCount + activeCount + explosionCount + rotationCount;

        if (total <= maxSubs) return;

        let excess = total - maxSubs;

        // Evict from ROTATION first
        if (excess > 0 && rotationCount > 0) {
            const toRemove = this.evictLowActivity(this.priorityBuckets.ROTATION, Math.min(excess, rotationCount));
            toRemove.forEach(token => this.priorityBuckets.ROTATION.delete(token));
            excess -= toRemove.length;
        }

        // Then EXPLOSION (keep top 10)
        if (excess > 0 && explosionCount > 10) {
            const explosionArray = Array.from(this.priorityBuckets.EXPLOSION);
            const toRemove = explosionArray.slice(10);
            toRemove.forEach(token => this.priorityBuckets.EXPLOSION.delete(token));
            excess -= toRemove.length;
        }

        // Then ACTIVE (keep top 20)
        if (excess > 0 && activeCount > 20) {
            const toRemove = this.evictLowActivity(this.priorityBuckets.ACTIVE, Math.min(excess, activeCount - 20));
            toRemove.forEach(token => this.priorityBuckets.ACTIVE.delete(token));
            excess -= toRemove.length;
        }

        console.log(`[WS] Enforced limit: CORE=${coreCount}, ACTIVE=${this.priorityBuckets.ACTIVE.size}, EXPLOSION=${this.priorityBuckets.EXPLOSION.size}, ROTATION=${this.priorityBuckets.ROTATION.size} (Total: ${this.subscriptions.size}/${maxSubs})`);
    }

    evictLowActivity(bucket, count) {
        const tokens = Array.from(bucket);
        const now = Date.now();
        
        const scored = tokens.map(token => {
            const activity = this.tokenActivity.get(token) || { lastUpdate: 0, updateCount: 0 };
            const ageMs = now - activity.lastUpdate;
            const activityScore = activity.updateCount / Math.max(1, ageMs / 60000);
            return { token, activityScore };
        });

        scored.sort((a, b) => a.activityScore - b.activityScore);
        
        return scored.slice(0, count).map(s => s.token);
    }

    recordTokenActivity(token) {
        const existing = this.tokenActivity.get(token) || { lastUpdate: 0, updateCount: 0 };
        this.tokenActivity.set(token, {
            lastUpdate: Date.now(),
            updateCount: existing.updateCount + 1
        });
    }

    promoteToExplosion(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        // Keep only top 10 in EXPLOSION bucket
        tokens.forEach(token => {
            Object.values(this.priorityBuckets).forEach(bucket => bucket.delete(token));
            this.priorityBuckets.EXPLOSION.add(token);
        });

        // Trim to top 10
        if (this.priorityBuckets.EXPLOSION.size > 10) {
            const explosionArray = Array.from(this.priorityBuckets.EXPLOSION);
            this.priorityBuckets.EXPLOSION = new Set(explosionArray.slice(0, 10));
        }

        this.enforceSubscriptionLimit();
        this.syncSubscriptions();
        console.log(`[WS] Promoted ${tokens.length} tokens to EXPLOSION bucket (Total: ${this.priorityBuckets.EXPLOSION.size}/10)`);
    }

    promoteToActive(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        // Keep only top 20 in ACTIVE bucket
        tokens.forEach(token => {
            if (!this.priorityBuckets.CORE.has(token)) {
                this.priorityBuckets.ROTATION.delete(token);
                this.priorityBuckets.EXPLOSION.delete(token);
                this.priorityBuckets.ACTIVE.add(token);
            }
        });

        // Trim to top 20
        if (this.priorityBuckets.ACTIVE.size > 20) {
            const toRemove = this.evictLowActivity(this.priorityBuckets.ACTIVE, this.priorityBuckets.ACTIVE.size - 20);
            toRemove.forEach(token => {
                this.priorityBuckets.ACTIVE.delete(token);
                this.priorityBuckets.ROTATION.add(token);
            });
        }

        this.enforceSubscriptionLimit();
        this.syncSubscriptions();
    }

    syncSubscriptions() {
        // Skip if CORE only mode
        if (this.coreOnlyMode) {
            const coreTokens = Array.from(this.priorityBuckets.CORE);
            const currentTokens = new Set(this.subscriptions.keys());
            
            const toSubscribe = coreTokens.filter(t => !currentTokens.has(t));
            const toUnsubscribe = [...currentTokens].filter(t => !this.priorityBuckets.CORE.has(t));
            
            if (toUnsubscribe.length > 0) this.unsubscribeTokens(toUnsubscribe);
            if (toSubscribe.length > 0) this.subscribeTokens(toSubscribe);
            return;
        }

        const allTokens = new Set([
            ...this.priorityBuckets.CORE,
            ...this.priorityBuckets.ACTIVE,
            ...this.priorityBuckets.EXPLOSION,
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
        const activeTokens = Array.from(this.priorityBuckets.ACTIVE).slice(0, 20);
        const explosionTokens = Array.from(this.priorityBuckets.EXPLOSION).slice(0, 10);
        
        // Calculate remaining slots for rotation
        const usedSlots = coreTokens.length + activeTokens.length + explosionTokens.length;
        const rotationSlots = this.wsSettings.maxSubscriptions - usedSlots;
        const rotationTokens = Array.from(this.priorityBuckets.ROTATION).slice(0, rotationSlots);

        setTimeout(() => {
            if (coreTokens.length > 0) {
                this.subscribeTokens(coreTokens, 1, 3);
            }
        }, 100);

        setTimeout(() => {
            if (activeTokens.length > 0) {
                this.subscribeTokens(activeTokens, 1, 3);
            }
        }, 500);

        setTimeout(() => {
            if (explosionTokens.length > 0) {
                this.subscribeTokens(explosionTokens, 1, 3);
            }
        }, 900);

        setTimeout(() => {
            if (rotationTokens.length > 0) {
                this.subscribeTokens(rotationTokens, 1, 3);
            }
        }, 1300);
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

    demoteToRotation(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        tokens.forEach(token => {
            if (!this.priorityBuckets.CORE.has(token)) {
                this.priorityBuckets.ACTIVE.delete(token);
                this.priorityBuckets.EXPLOSION.delete(token);
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
            ...this.priorityBuckets.EXPLOSION,
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
            EXPLOSION: Array.from(this.priorityBuckets.EXPLOSION),
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
            coreOnlyMode: this.coreOnlyMode,
            buckets: {
                CORE: this.priorityBuckets.CORE.size,
                ACTIVE: this.priorityBuckets.ACTIVE.size,
                EXPLOSION: this.priorityBuckets.EXPLOSION.size,
                ROTATION: this.priorityBuckets.ROTATION.size
            },
            limits: {
                active: '20 max',
                explosion: '10 max',
                rotation: 'dynamic'
            },
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.wsSettings.maxReconnectAttempts,
            rateLimitHits: this.rateLimitHits,
            livePricesCount: this.livePrices.size,
            leakGuardSize: this.subscriptionLeakGuard.size,
            rotationIntervalSec: this.wsSettings.rotationIntervalSec || 120
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
        this.coreOnlyMode = false;
    }
}

module.exports = new FocusWebSocketService();
