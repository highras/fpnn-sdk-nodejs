'use strict'

const FPManager = require('./FPManager');
const ErrorRecorder = require('./ErrorRecorder');

class FPProcessor {
    constructor() {
        this._processor = null;
        this._destroyed = false;
    }

    set processor(value) {
        this._processor = value;
    }

    service(data, cb) {
        let method;

        if (data) {
            method = data.method;
        }
        if (!method) {
            return;
        }
        if (this._destroyed) {
            return;
        }
        if (!this._processor) {
            this._processor = new FPProcessor.BaseProcessor();
        }
        if (!(this._processor.hasPushService && this._processor.hasPushService(method))) {
            if (method != 'ping') {
                return;
            }
        }

        let self = this;
        FPManager.instance.asyncTask(function () {
            if (self._processor) {
                self._processor.service && self._processor.service(data, cb);
            }
        });
    }

    onSecond(timestamp) {
        try {
            if (this._processor) {
                this._processor.onSecond && this._processor.onSecond(timestamp);
            }
        } catch (er) {
            ErrorRecorder.instance.recordError(er);
        }
    }

    destroy() {
        this._destroyed = true;
    }
}

FPProcessor.BaseProcessor = class {
    service(data, cb) {
        // TODO
        if (data.flag == 0) {}
        if (data.flag == 1) {}
    }

    hasPushService(name) {
        return false;
    }

    onSecond(timestamp) {}
};

module.exports = FPProcessor;
