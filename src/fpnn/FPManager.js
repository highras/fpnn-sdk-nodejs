'use strict'

const crypto = require('crypto');
const FPConfig = require('./FPConfig');

class FPManager {
    static get instance() {
        if (!this._instance) {
            this._instance = new FPManager();
        }
        return this._instance;
    }

    constructor() {
        this._invalId = 0;
        this._secondCalls = [];
    }

    addSecond(callback) {
        if (callback == null) {
            return;
        }
        if (this._secondCalls.length >= 500) {
            ErrorRecorder.recordError(new FPError('Second Calls Limit!', FPConfig.ERROR_CODE.FPNN_EC_PROTO_UNKNOWN_ERROR));
            return;
        }
        this._secondCalls.push(callback);

        if (!this._invalId) {
            let self = this;
            this._invalId = setInterval(function () {
                callSecond.call(self);
            }, 1000);
        }
    }

    removeSecond(callback) {
        if (callback == null) {
            return;
        }
        let index = this._secondCalls.indexOf(callback);
        if (index != -1) {
            this._secondCalls.splice(index, 1);
        }
    }

    asyncTask(callback, state) {
        if (!callback) {
            return;
        }
        setTimeout(function() {
            callback && callback(state);
        }, 0);
    }

    delayTask(milliSecond, callback, state) {
        if (milliSecond <= 0) {
            this.asyncTask(callback, state);
            return;
        }
        if (!callback) {
            return;
        }
        setTimeout(function() {
            callback && callback(state);
        }, milliSecond);
    }

    get milliTimestamp() {
        return Date.now();
    }

    get timestamp() {
        return Math.floor(Date.now() / 1000);
    }

    md5(data) {
        let hash = crypto.createHash('md5');
        hash.update(data);
        return hash.digest('hex');
    }
}

function callSecond() {
    let ts = this.milliTimestamp;
    for (let key in this._secondCalls) {
        let callback = this._secondCalls[key];
        this.asyncTask(function (state) {
            callback && callback(ts);
        }, null);
    }
}

module.exports = FPManager;
