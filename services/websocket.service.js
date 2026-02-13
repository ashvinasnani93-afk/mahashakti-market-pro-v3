const WebSocket = require('ws');
const config = require('../config/angel.config');
const authService = require('./auth.service');

class WebSocketService {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.subscriptions = new Map();
        this.priceCallbacks = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseDelay = 1000;
        this.maxDelay = 60000;
        this.maxSubscriptions = 50;
        this.lastConnectTime = 0;
        this.minConnectInterval = 5000;
        this.isConnecting = false;
        this.pingInterval = null;
        this.rateLimitHits = 0;
    }

    async connect() {
        if (this.isConnecting) {
            console.log('[WS] Connection already in progress');
            return;
        }

        const now = Date.now();
        if (now - this.lastConnectTime < this.minConnectInterval) {
            console.log('[WS] Rate limiting connection attempts');
            return;
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

            if (this.ws) {
                this.ws.terminate();
                this.ws = null;
            }

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

            this.ws.on('open', () => {
                console.log('[WS] Connected successfully');
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.rateLimitHits = 0;
                this.startPing();
                this.resubscribeAll();
            });

            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', (code, reason) => {
                console.log(`[WS] Disconnected: ${code} - ${reason}`);
                this.isConnected = false;
                this.isConnecting = false;
                this.stopPing();
                
                if (code === 429) {
                    this.rateLimitHits++;
                    console.log(`[WS] Rate limit hit #${this.rateLimitHits}`);
                }
                
                this.scheduleReconnect();
            });

            this.ws.on('error', (error) => {
                console.error('[WS] Error:', error.message);
                this.isConnecting = false;
            });

        } catch (error) {
            console.error('[WS] Connection error:', error.message);
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WS] Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        
        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
            this.maxDelay
        );

        if (this.rateLimitHits > 0) {
            const extraDelay = this.rateLimitHits * 30000;
            console.log(`[WS] Adding ${extraDelay}ms delay due to rate limits`);
        }

        console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.isConnected) {
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
        }, 30000);
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
            const ltp = view.getInt32(43, true) / 100;
            
            let volume = 0;
            let open = 0;
            let high = 0;
            let low = 0;
            let close = ltp;

            if (buffer.byteLength >= 100) {
                volume = Number(view.getBigInt64(51, true));
                open = view.getInt32(83, true) / 100;
                high = view.getInt32(87, true) / 100;
                low = view.getInt32(91, true) / 100;
                close = view.getInt32(95, true) / 100;
            }

            return {
                token,
                exchange: exchangeType,
                ltp,
                open,
                high,
                low,
                close,
                volume,
                timestamp: Date.now()
            };
        } catch (e) {
            return null;
        }
    }

    subscribe(tokens, exchangeType = 1, mode = 3) {
        if (!Array.isArray(tokens)) tokens = [tokens];
        
        const availableSlots = this.maxSubscriptions - this.subscriptions.size;
        if (tokens.length > availableSlots) {
            console.log(`[WS] Can only subscribe ${availableSlots} more (max ${this.maxSubscriptions})`);
            tokens = tokens.slice(0, availableSlots);
        }

        if (tokens.length === 0) return;

        tokens.forEach(t => {
            this.subscriptions.set(t, { exchange: exchangeType, mode });
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
                console.log(`[WS] Subscribed to ${tokens.length} tokens`);
            } catch (e) {
                console.error('[WS] Subscribe error:', e.message);
            }
        }
    }

    unsubscribe(tokens, exchangeType = 1) {
        if (!Array.isArray(tokens)) tokens = [tokens];

        tokens.forEach(t => {
            this.subscriptions.delete(t);
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
            } catch (e) {
                console.error('[WS] Unsubscribe error:', e.message);
            }
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

        byExchange.forEach((tokens, key) => {
            const [exchange, mode] = key.split('_').map(Number);
            setTimeout(() => {
                this.subscribe(tokens, exchange, mode);
            }, 500);
        });
    }

    onPrice(callback) {
        this.priceCallbacks.push(callback);
    }

    getStatus() {
        return {
            connected: this.isConnected,
            subscriptionCount: this.subscriptions.size,
            maxSubscriptions: this.maxSubscriptions,
            reconnectAttempts: this.reconnectAttempts,
            rateLimitHits: this.rateLimitHits
        };
    }

    disconnect() {
        this.stopPing();
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        this.isConnected = false;
        this.subscriptions.clear();
    }
}

module.exports = new WebSocketService();
