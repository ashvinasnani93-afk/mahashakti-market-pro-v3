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
        this.focusedTokens = new Set();
        this.priorityTokens = new Set();
        
        this.priceCallbacks = [];
        this.connectionCallbacks = [];
        
        this.reconnectAttempts = 0;
        this.rateLimitHits = 0;
        this.lastConnectTime = 0;
        
        this.pingInterval = null;
        this.reconnectTimeout = null;
        
        this.livePrices = new Map();
        this.lastUpdateTime = new Map();
        
        this.wsSettings = settings.websocket;
    }

    async connect() {
        if (this.isConnecting) {
            console.log('[WS] Connection already in progress - singleton guard');
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
            this.resubscribeAll();
            
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
                console.log(`[WS] Rate limit hit #${this.rateLimitHits} - applying cooldown`);
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
            console.log('[WS] Max reconnect attempts reached - giving up');
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
            let oiDayHigh = 0;
            let oiDayLow = 0;

            if (buffer.byteLength >= 50) {
                const lastTradedQty = Number(view.getBigInt64(30, true));
                avgPrice = view.getInt32(38, true) / 100;
                volume = Number(view.getBigInt64(42, true));
            }

            if (buffer.byteLength >= 130) {
                const totalBuyQty = view.getFloat64(50, true);
                const totalSellQty = view.getFloat64(58, true);
                open = view.getInt32(66, true) / 100;
                high = view.getInt32(70, true) / 100;
                low = view.getInt32(74, true) / 100;
                close = view.getInt32(78, true) / 100;
            }

            if (buffer.byteLength >= 164) {
                oi = Number(view.getBigInt64(130, true));
                oiDayHigh = Number(view.getBigInt64(138, true));
                oiDayLow = Number(view.getBigInt64(146, true));
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
                oiDayHigh,
                oiDayLow,
                timestamp: Date.now(),
                exchangeTimestamp
            };
        } catch (e) {
            return null;
        }
    }

    subscribe(tokens, exchangeType = 1, mode = 3) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        const availableSlots = this.wsSettings.maxSubscriptions - this.subscriptions.size;
        
        if (tokens.length > availableSlots) {
            console.log(`[WS] Subscription limit: can only add ${availableSlots} more (max ${this.wsSettings.maxSubscriptions})`);
            
            if (availableSlots <= 0) {
                this.evictLowPrioritySubscriptions(tokens.length);
            }
            
            tokens = tokens.slice(0, Math.max(availableSlots, 0));
        }

        if (tokens.length === 0) return;

        tokens.forEach(t => {
            this.subscriptions.set(t, { exchange: exchangeType, mode, subscribedAt: Date.now() });
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
                console.log(`[WS] Subscribed to ${tokens.length} tokens (total: ${this.subscriptions.size}/${this.wsSettings.maxSubscriptions})`);
            } catch (e) {
                console.error('[WS] Subscribe error:', e.message);
            }
        }
    }

    unsubscribe(tokens, exchangeType = 1) {
        if (!Array.isArray(tokens)) tokens = [tokens];

        tokens.forEach(t => {
            this.subscriptions.delete(t);
            this.focusedTokens.delete(t);
            this.priorityTokens.delete(t);
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

    setFocus(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        this.focusedTokens.clear();
        tokens.forEach(t => this.focusedTokens.add(t));
        
        console.log(`[WS] Focus set on ${tokens.length} tokens`);
    }

    setPriority(tokens) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        this.priorityTokens.clear();
        tokens.forEach(t => this.priorityTokens.add(t));
    }

    evictLowPrioritySubscriptions(needed) {
        const candidates = [];
        
        this.subscriptions.forEach((value, token) => {
            if (!this.priorityTokens.has(token) && !this.focusedTokens.has(token)) {
                candidates.push({ token, ...value });
            }
        });

        candidates.sort((a, b) => a.subscribedAt - b.subscribedAt);

        const toEvict = candidates.slice(0, needed);
        if (toEvict.length > 0) {
            const tokens = toEvict.map(c => c.token);
            console.log(`[WS] Evicting ${tokens.length} low-priority subscriptions`);
            this.unsubscribe(tokens);
        }
    }

    resubscribeAll() {
        if (this.subscriptions.size === 0) return;

        const byExchange = new Map();
        this.subscriptions.forEach((value, token) => {
            const key = `${value.exchange}_${value.mode}`;
            if (!byExchange.has(key)) {
                byExchange.set(key, []);
            }
            byExchange.get(key).push(token);
        });

        let delay = 0;
        byExchange.forEach((tokens, key) => {
            const [exchange, mode] = key.split('_').map(Number);
            setTimeout(() => {
                if (this.isConnected) {
                    const payload = {
                        correlationID: `resub_${Date.now()}`,
                        action: 1,
                        params: {
                            mode: mode,
                            tokenList: [{
                                exchangeType: exchange,
                                tokens: tokens
                            }]
                        }
                    };
                    try {
                        this.ws.send(JSON.stringify(payload));
                    } catch (e) {}
                }
            }, delay);
            delay += 500;
        });
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

    getStatus() {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            subscriptionCount: this.subscriptions.size,
            maxSubscriptions: this.wsSettings.maxSubscriptions,
            availableSlots: this.wsSettings.maxSubscriptions - this.subscriptions.size,
            focusedCount: this.focusedTokens.size,
            priorityCount: this.priorityTokens.size,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.wsSettings.maxReconnectAttempts,
            rateLimitHits: this.rateLimitHits,
            livePricesCount: this.livePrices.size
        };
    }

    disconnect() {
        console.log('[WS] Disconnecting...');
        this.cleanup();
        this.isConnected = false;
        this.subscriptions.clear();
        this.focusedTokens.clear();
        this.priorityTokens.clear();
        this.livePrices.clear();
    }
}

module.exports = new FocusWebSocketService();
