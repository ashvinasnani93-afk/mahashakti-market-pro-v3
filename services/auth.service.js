const axios = require('axios');
const { authenticator } = require('otplib');
const config = require('../config/angel.config');

class AuthService {
    constructor() {
        this.jwtToken = null;
        this.refreshToken = null;
        this.feedToken = null;
        this.isAuthenticated = false;
        this.lastLoginTime = null;
        this.loginInProgress = false;
        this.tokenExpiryMs = 6 * 60 * 60 * 1000;
    }

    generateTOTP() {
        if (!config.totpSecret) {
            throw new Error('TOTP secret not configured in environment');
        }
        return authenticator.generate(config.totpSecret);
    }

    async login() {
        if (this.loginInProgress) {
            console.log('[AUTH] Login already in progress, waiting...');
            await this.waitForLogin();
            return { success: true, jwtToken: this.jwtToken, feedToken: this.feedToken };
        }

        this.loginInProgress = true;

        try {
            const totp = this.generateTOTP();
            
            const response = await axios.post(
                `${config.endpoints.base}${config.endpoints.login}`,
                {
                    clientcode: config.clientId,
                    password: config.password,
                    totp: totp
                },
                {
                    headers: this.getPublicHeaders(),
                    timeout: 30000
                }
            );

            if (response.data.status && response.data.data) {
                this.jwtToken = response.data.data.jwtToken;
                this.refreshToken = response.data.data.refreshToken;
                this.feedToken = response.data.data.feedToken;
                this.isAuthenticated = true;
                this.lastLoginTime = Date.now();
                
                console.log('[AUTH] Login successful');
                console.log('[AUTH] JWT Token obtained');
                console.log('[AUTH] Feed Token obtained');
                
                return {
                    success: true,
                    jwtToken: this.jwtToken,
                    feedToken: this.feedToken
                };
            }

            throw new Error(response.data.message || 'Login failed - no data returned');
        } catch (error) {
            console.error('[AUTH] Login error:', error.message);
            this.isAuthenticated = false;
            throw error;
        } finally {
            this.loginInProgress = false;
        }
    }

    async waitForLogin() {
        const maxWait = 30000;
        const checkInterval = 100;
        let waited = 0;
        
        while (this.loginInProgress && waited < maxWait) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
    }

    async ensureAuthenticated() {
        const tokenAge = Date.now() - (this.lastLoginTime || 0);

        if (!this.isAuthenticated || tokenAge > this.tokenExpiryMs) {
            console.log('[AUTH] Token expired or not authenticated, logging in...');
            await this.login();
        }
        
        return this.jwtToken;
    }

    getPublicHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': '00:00:00:00:00:00',
            'X-PrivateKey': config.apiKey
        };
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.jwtToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': '00:00:00:00:00:00',
            'X-PrivateKey': config.apiKey
        };
    }

    getStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            hasJwtToken: !!this.jwtToken,
            hasFeedToken: !!this.feedToken,
            tokenAgeSeconds: this.lastLoginTime ? Math.floor((Date.now() - this.lastLoginTime) / 1000) : null,
            tokenExpiresIn: this.lastLoginTime ? Math.max(0, Math.floor((this.tokenExpiryMs - (Date.now() - this.lastLoginTime)) / 1000)) : null
        };
    }

    invalidate() {
        this.jwtToken = null;
        this.refreshToken = null;
        this.feedToken = null;
        this.isAuthenticated = false;
        this.lastLoginTime = null;
        console.log('[AUTH] Session invalidated');
    }
}

module.exports = new AuthService();
