'use strict'

class FPError extends Error {
    constructor(message = "", code = -1, ...args) {
        super(message, ...args);
        this.message = message || "";
        this.code = code || -1;
    }
}

module.exports = FPError;