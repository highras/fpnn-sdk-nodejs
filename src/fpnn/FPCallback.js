'use strict'

const FPConfig = require('./FPConfig');
const FPManager = require('./FPManager');
const ErrorRecorder = require('./ErrorRecorder');

class FPCallback {

    constructor() {
        this._cbMap = {};
        this._exMap = {};
    }

    addCallback(key, cb, timeout) {
        if (!key) {
            ErrorRecorder.instance.recordError(new FPError('callback key is null or empty', FPConfig.ERROR_CODE.FPNN_EC_CORE_FORBIDDEN));
            return;
        }

        if (!cb) {
            ErrorRecorder.instance.recordError(new FPError('callback is null', FPConfig.ERROR_CODE.FPNN_EC_CORE_FORBIDDEN));
            return;
        }

        if (!this._cbMap.hasOwnProperty(key)) {
            this._cbMap[key] = cb;
        }

        if (!this._exMap.hasOwnProperty(key)) {
            let ts = (!timeout || timeout < 0) ? FPConfig.SEND_TIMEOUT : timeout;
            this._exMap[key] = ts + Date.now();
        }
    }

    removeCallback() {
        this._cbMap = {};
        this._exMap = {};
    }

    execCallback(key, data) {
        if (!key) {
            ErrorRecorder.instance.recordError(new FPError('callback key is null or empty', FPConfig.ERROR_CODE.FPNN_EC_CORE_FORBIDDEN));
            return;
        }

        let self = this;
        FPManager.instance.asyncTask(function(state) {
            callbackExec.call(self, key, data);
        }, null);
    }

    onSecond(timestamp) {
        for (let key in this._exMap) {
            if (this._exMap[key] > timestamp) {
                continue;
            }
            this.execCallback(key, new FPError('timeout with expire', FPConfig.ERROR_CODE.FPNN_EC_CORE_TIMEOUT));
        }
    }
}

function callbackExec(key, data) {
    if (this._cbMap.hasOwnProperty(key)) {
        let cb = this._cbMap[key];
        delete this._cbMap[key];
        if (this._exMap.hasOwnProperty(key)) {
            delete this._exMap[key];
        }
        cb && cb(data);
    }
}

module.exports = FPCallback
