'use strict'

const net = require('net');
const FPConfig = require('./FPConfig');
const FPManager = require('./FPManager');
const ErrorRecorder = require('./ErrorRecorder');

class FPSocket {
    constructor(options) {
        this._queue = [];
        this._socket = null;
        this._isIPv6 = false;
        this._isConnected = false;
        this._closeStatus = 0;
        this._openTimestamp = 0;

        this._socketConnect = options.onConnect || null;
        this._socketClose = options.onClose || null;
        this._socketError = options.onError || null;
        this._socketRead = options.onRead || null;

        this._host = options.host || null;
        this._port = options.port || 0;
        this._timeout = options.connectionTimeout || 30 * 1000;
    }

    open() {
        if (!this._host) {
            onError.call(this, new FPError('Cannot open null host', FPConfig.ERROR_CODE.FPNN_EC_CORE_UNKNOWN_ERROR));
            return;
        }
        if (!this._port || this._port < 0) {
            onError.call(this, new FPError('Cannot open without port', FPConfig.ERROR_CODE.FPNN_EC_CORE_UNKNOWN_ERROR));
            return;
        }
        if (this._socket) {
            return;
        }
        if (this._openTimestamp > 0) {
            return;
        }
        this._openTimestamp = FPManager.instance.milliTimestamp;

        let self = this;
        FPManager.instance.asyncTask(function (state) {
            asyncConnect.call(self);
        }, null);
    }

    get isIPv6() {
        return this._isIPv6;
    }

    get isOpen() {
        return this._isConnected;
    }

    get isConnecting() {
        if (this._socket) {
            return this._socket.connecting;
        }
        return false;
    }

    onSecond(timestamp) {
        if (this._timeout <= 0) {
            return;
        }
        if (!this.isConnecting) {
            return;
        }
        if (timestamp - this._openTimestamp >= this._timeout) {
            this.close(new FPError('Connect Timeout', FPConfig.ERROR_CODE.FPNN_EC_CORE_TIMEOUT));
        }
    }

    close(err) {
        if (this._closeStatus == 0) {
            this._closeStatus = 1;
            if (err) {
                onError.call(this, err);
            }
            if (this.isConnecting) {
                return;
            }

            let self = this;
            FPManager.instance.delayTask(200, function (state) {
                delayClose.call(self, state);
            }, null)
        }
        tryClose.call(this);
    }

    write(buf) {
        if (!buf) {
            return;
        }
        this._queue.push(buf);
        writeSocket.call(this);
    }

    get host() {
        return this._host;
    }

    get port() {
        return this._port;
    }

    get timeout() {
        return this._timeout;
    }
}

function asyncConnect() {
    let self = this;
    this._socket = new net.Socket();
    this._socket.on('connect', function () {
        onConnect.call(self);
    });
    this._socket.on('close', function () {
        self.close();
    });
    this._socket.on('error', function (err) {
        onError.call(self, err);
    });
    this._socket.on('data', function (chunk) {
        onData.call(self, chunk);
    });
    this._socket.connect(this._port, this._host);
}

function delayClose(state) {
    if (this._closeStatus != 3) {
        socketClose.call(this);
    }
}

function tryClose() {
    if (this._closeStatus == 3) {
        return;
    }
    try {
        socketClose.call(this);
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function socketClose() {
    if (this._socket && !this._socket.destroyed) {
        this._socket.destroy();
    }
    this._closeStatus == 3;
    onClose.call(this);
}

function writeSocket() {
    if (!this.isOpen) {
        return;
    }

    try {
        while (this._queue.length) {
            let buf = this._queue.shift();
            if (!this._socket.write(buf)) {
                return;
            }
        }
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function onData(chunk) {
    try {
        this._socketRead && this._socketRead(chunk);
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function onConnect() {
    if (this._closeStatus != 0) {
        delayClose.call(this);
        return;
    }
    this._isConnected = true;
    this._isIPv6 = (this._socket && this._socket.remoteFamily == 'IPv6');
    writeSocket.call(this);

    try {
        this._socketConnect && this._socketConnect();
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function onError(err) {
    try {
        this._socketError && this._socketError(err);
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function onClose() {
    this._isConnected = false;
    try {
        this._socketClose && this._socketClose();
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
    destroy.call(this);
}

function destroy() {
    this._socketConnect = null;
    this._socketClose = null;
    this._socketError = null;
    this._socketRead = null;
}

module.exports = FPSocket;
