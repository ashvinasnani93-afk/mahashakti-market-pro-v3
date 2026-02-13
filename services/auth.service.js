const axios = require('axios');
const { authenticator } = require('otplib');
const config = require('../config/angel.config');

class AngelAuthService {
    constructor() {
        this.jwtToken = null;
        this.refreshToken = null;
        this.feedToken = null;
        this.isAuthenticated = false;
        this.lastLoginTime = null;
    }

    generateTOTP() {
        if (!config.totpSecret) {
            throw new Error('TOTP secret not configured');
        }
        return authenticator.generate(config.totpSecret);
    }

    async login() {
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
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-UserType': 'USER',
                        'X-SourceID': 'WEB',
                        'X-ClientLocalIP': '127.0.0.1',
                        'X-ClientPublicIP': '127.0.0.1',
                        'X-MACAddress': '00:00:00:00:00:00',
                        'X-PrivateKey': config.apiKey
                    }
                }
            );

            if (response.data.status && response.data.data) {
                this.jwtToken = response.data.data.jwtToken;
                this.refreshToken = response.data.data.refreshToken;
                this.feedToken = response.data.data.feedToken;
                this.isAuthenticated = true;
                this.lastLoginTime = Date.now();
                
                console.log('[AUTH] Login successful');
                return {
                    success: true,
                    jwtToken: this.jwtToken,
                    feedToken: this.feedToken
                };
            }

            throw new Error(response.data.message || 'Login failed');
        } catch (error) {
            console.error('[AUTH] Login error:', error.message);
            this.isAuthenticated = false;
            throw error;
        }
    }

    async ensureAuthenticated() {
        const tokenAge = Date.now() - (this.lastLoginTime || 0);
        const maxAge = 6 * 60 * 60 * 1000;

        if (!this.isAuthenticated || tokenAge > maxAge) {
            await this.login();
        }
        return this.jwtToken;
    }

    getHeaders() {
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
            hasToken: !!this.jwtToken,
            hasFeedToken: !!this.feedToken,
            tokenAge: this.lastLoginTime ? Math.floor((Date.now() - this.lastLoginTime) / 1000) : null
        };
    }
}

module.exports = new AngelAuthService();
