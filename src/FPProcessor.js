'use strict'

const Emitter = require('events').EventEmitter;

class FPProcessor {

    constructor() {}

    service(data, cb) {

        this.emit(data.method, data.payload, cb);
    }
}

Object.setPrototypeOf(FPProcessor.prototype, Emitter.prototype);
module.exports = FPProcessor;