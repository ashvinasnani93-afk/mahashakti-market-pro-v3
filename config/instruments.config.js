module.exports = {
    indices: [
        { symbol: 'NIFTY', token: '99926000', exchange: 1, name: 'NIFTY 50' },
        { symbol: 'BANKNIFTY', token: '99926009', exchange: 1, name: 'BANK NIFTY' },
        { symbol: 'FINNIFTY', token: '99926037', exchange: 1, name: 'FIN NIFTY' }
    ],
    
    fnoStocks: [
        { symbol: 'RELIANCE', token: '2885', exchange: 1, name: 'Reliance Industries' },
        { symbol: 'TCS', token: '11536', exchange: 1, name: 'Tata Consultancy' },
        { symbol: 'HDFCBANK', token: '1333', exchange: 1, name: 'HDFC Bank' },
        { symbol: 'INFY', token: '1594', exchange: 1, name: 'Infosys' },
        { symbol: 'ICICIBANK', token: '4963', exchange: 1, name: 'ICICI Bank' },
        { symbol: 'SBIN', token: '3045', exchange: 1, name: 'State Bank India' },
        { symbol: 'BHARTIARTL', token: '10604', exchange: 1, name: 'Bharti Airtel' },
        { symbol: 'ITC', token: '1660', exchange: 1, name: 'ITC Ltd' },
        { symbol: 'KOTAKBANK', token: '1922', exchange: 1, name: 'Kotak Mahindra' },
        { symbol: 'LT', token: '11483', exchange: 1, name: 'Larsen & Toubro' },
        { symbol: 'AXISBANK', token: '5900', exchange: 1, name: 'Axis Bank' },
        { symbol: 'BAJFINANCE', token: '317', exchange: 1, name: 'Bajaj Finance' },
        { symbol: 'TATAMOTORS', token: '3456', exchange: 1, name: 'Tata Motors' },
        { symbol: 'MARUTI', token: '10999', exchange: 1, name: 'Maruti Suzuki' },
        { symbol: 'SUNPHARMA', token: '3351', exchange: 1, name: 'Sun Pharma' },
        { symbol: 'TITAN', token: '3506', exchange: 1, name: 'Titan Company' },
        { symbol: 'ASIANPAINT', token: '236', exchange: 1, name: 'Asian Paints' },
        { symbol: 'ULTRACEMCO', token: '11532', exchange: 1, name: 'UltraTech Cement' },
        { symbol: 'WIPRO', token: '3787', exchange: 1, name: 'Wipro' },
        { symbol: 'POWERGRID', token: '14977', exchange: 1, name: 'Power Grid Corp' }
    ],
    
    commodities: [
        { symbol: 'GOLDM', token: '252917', exchange: 5, name: 'Gold Mini' },
        { symbol: 'SILVERM', token: '253017', exchange: 5, name: 'Silver Mini' },
        { symbol: 'CRUDEOIL', token: '255217', exchange: 5, name: 'Crude Oil' },
        { symbol: 'NATURALGAS', token: '255717', exchange: 5, name: 'Natural Gas' }
    ],
    
    getWatchlist() {
        return [...this.indices, ...this.fnoStocks.slice(0, 15)];
    },
    
    getByToken(token) {
        const all = [...this.indices, ...this.fnoStocks, ...this.commodities];
        return all.find(i => i.token === token);
    }
};
