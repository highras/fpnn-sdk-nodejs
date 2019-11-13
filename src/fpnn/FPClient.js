'use strict'

const FPConfig = require('./FPConfig');
const FPSocket = require('./FPSocket');
const FPPackage = require('./FPPackage');
const FPCallback = require('./FPCallback');
const FPEncryptor = require('./FPEncryptor');
const FPProcessor = require('./FPProcessor');
const FPManager = require('./FPManager');
const ErrorRecorder = require('./ErrorRecorder');

class FPClient {

    constructor(options) {
        this._clientConnect = options.onConnect || null;
        this._clientClose = options.onClose || null;
        this._clientError = options.onError || null;

        let self = this;
        options.onConnect = function () {
            sendPubkey.call(self);
        };
        options.onClose = function () {
            onClose.call(self);
        };
        options.onError = function (err) {
            onError.call(self, err);
        };
        options.onRead = function (chunk) {
            onData.call(self, chunk);
        };

        if (options.connectionTimeout && options.connectionTimeout < 0) {
            options.connectionTimeout = 30 * 1000;
        }
        this._sock = new FPSocket(options);

        this._secondListener = function (timestamp) {
            onSecond.call(self, timestamp)
        };
        FPManager.instance.addSecond(this._secondListener);

        this._pkg = new FPPackage();
        this._cbs = new FPCallback();
        this._cyr = new FPEncryptor(this._pkg);
        this._psr = new FPProcessor();

        this._seq = 0;
        this._wpos = 0;
        this._peekData = null;
        this._invalId = 0;
        this._isClose = false;
        this._keyFn = null;
        this._buffer = Buffer.allocUnsafe(FPConfig.READ_BUFFER_LEN);
    }

    get processor() {
        return this._psr;
    }

    set processor(value) {
        return this._psr = value;
    }

    get sock() {
        return this._sock;
    }

    encryptor(curve, peerPublicKey, streamMode, strength) {
        if (curve != undefined) {
            this._cyr.curve = curve;
        }
        if (peerPublicKey != undefined) {
            this._cyr.peerPublicKey = peerPublicKey;
        }
        if (streamMode != undefined) {
            this._cyr.streamMode = streamMode;
        }
        if (strength != undefined) {
            this._cyr.strength = strength;
        }
        if (this.hasConnect || this._cyr.cryptoed) {
            ErrorRecorder.instance.recordError(new Error('has connected or enable crypto!'));
            return;
        }
        this._cyr.encryptor();
    }

    connect(keyFn) {
        if (this.hasConnect) {
            return;
        }
        if (this._isClose) {
            return;
        }
        if (keyFn != undefined) {
            this._keyFn = keyFn;
        }
        this._sock.open();
    }

    close(err) {
        if (this._isClose) {
            return;
        }
        socketClose.call(this, err);
    }

    sendQuest(options, callback, timeout) {
        let data = {};
        data.magic = options.magic || FPConfig.TCP_MAGIC;
        data.version = options.version || 1;
        data.flag = options.flag || 0;
        data.mtype = options.mtype !== undefined ? options.mtype : 1;
        data.method = options.method;
        data.seq = (options.seq === undefined) ? addSeq.call(this) : options.seq;
        data.payload = options.payload;

        let buf = null;
        try {
            data = this._pkg.buildPkgData(data);
            buf = this._pkg.enCode(data);
            buf = this._cyr.enCode(buf);
        } catch (er) {
            ErrorRecorder.instance.recordError(er);
            return;
        }

        if (callback) {
            this._cbs.addCallback(this._pkg.cbKey(data), callback, timeout);
        }
        this._sock.write(buf);
    }

    sendNotify(options) {
        let data = {};
        data.magic = options.magic || FPConfig.TCP_MAGIC;
        data.version = options.version || 1;
        data.flag = options.flag || 0;
        data.mtype = options.mtype || 0;
        data.method = options.method;
        data.payload = options.payload;

        let buf = null;
        try {
            data = this._pkg.buildPkgData(data);
            buf = this._pkg.enCode(data);
            buf = this._cyr.enCode(buf);
        } catch (er) {
            ErrorRecorder.instance.recordError(er);
            return;
        }
        this._sock.write(buf);
    }

    get isIPv6() {
        return this._sock.isIPv6;
    }

    get isOpen() {
        return this._sock.isOpen;
    }

    get hasConnect() {
        return this._sock.isOpen || this._sock.isConnecting;
    }
}

function onSecond(timestamp) {
    this._sock.onSecond(timestamp);
    this._psr.onSecond(timestamp);
    this._cbs.onSecond(timestamp);
}

function socketClose(err) {
    this._isClose = true;
    if (this._secondListener) {
        FPManager.instance.removeSecond(this._secondListener);
        this._secondListener = null;
    }
    if (this._invalId) {
        clearInterval(this._invalId);
        this._invalId = 0;
    }
    this._psr.destroy();
    this._sock.close(err);
}

function sendPubkey() {
    if (this._cyr.crypto) {
        let options = {
            flag: 1,
            method: '*key',
            payload: this._keyFn(this._cyr)
        };

        let self = this;
        this.sendQuest(options, function (data) {
            onPubkey.call(self, data);
        }, 10 * 1000);

        this._cyr.cryptoed = true;
        return;
    }
    onConnect.call(this);
}

function onPubkey(data) {
    if (data instanceof Error) {
        this._cyr.setCryptoed(false);
        ErrorRecorder.instance.recordError(new Error('wrong cryptor!'));
        return;
    }
    onConnect.call(this);
}

function onClose() {
    this.close();
    this._seq = 0;
    this._wpos = 0;
    this._peekData = null;
    this._buffer = Buffer.allocUnsafe(FPConfig.READ_BUFFER_LEN);
    this._cbs.removeCallback();
    this._cyr.clear();

    try {
        this._clientClose && this._clientClose();
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
    destroy.call(this);
}

function destroy() {
    this._clientConnect = null;
    this._clientClose = null;
    this._clientError = null;
}

function onData(chunk) {
    let len = this._wpos + chunk.length;
    if (len > this._buffer.length) {
        resizeBuffer.call(this, len, 2 * FPConfig.READ_BUFFER_LEN);
    }
    this._wpos += chunk.copy(this._buffer, this._wpos, 0);

    if (this._invalId) {
        return;
    }
    let self = this;
    this._invalId = setInterval(function () {
            readPeekData.call(self);
        }, 0);
}

function onConnect() {
    try {
        this._clientConnect && this._clientConnect();
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function onError(err) {
    try {
        this._clientError && this._clientError(err);
    } catch (er) {
        ErrorRecorder.instance.recordError(er);
    }
}

function resizeBuffer(len1, len2, offset = 0) {
    let len = Math.max(len1, len2);
    let buf = Buffer.allocUnsafe(len);
    this._wpos = this._buffer.copy(buf, 0, offset, this._wpos);
    this._buffer = buf;
}

function readPeekData() {
    if (this._wpos < 12) {
        return;
    }

    if (!this._peekData) {
        this._peekData = this._cyr.peekHead(this._buffer);
        if (!this._peekData) {
            this._sock.close(new Error('worng package head!'));
            return;
        }
    }

    let diff = this._wpos - this._peekData.pkgLen;
    if (diff < 0) {
        return;
    }

    this._buffer.copy(this._peekData.buffer, 0, 0, this._peekData.pkgLen);
    this._peekData.buffer = this._cyr.deCode(this._peekData.buffer);
    let data = this._pkg.deCode(this._peekData.buffer);
    resizeBuffer.call(this, 2 * diff, FPConfig.READ_BUFFER_LEN, this._peekData.pkgLen);
    delete this._peekData;
    this._peekData = null;

    if (!data) {
        this._sock.close(new Error('worng package body!'));
        return;
    }
    if (this._pkg.isAnswer(data)) {
        let cbkey = this._pkg.cbKey(data);
        this._cbs.execCallback(cbkey, data);
    }
    if (this._pkg.isQuest(data)) {
        let self = this;
        this._psr.service(data, function (payload, exception) {
            sendAnswer.call(self, data.flag, data.seq, payload, exception);
        });
    }
}

function sendAnswer(flag, seq, payload, exception) {
    exception = exception || false;
    let options = {
        flag: flag,
        mtype: 2,
        seq: seq,
        ss: exception ? 1 : 0,
        payload: payload,
    };
    this.sendQuest(options);
}

function addSeq() {
    return ++this._seq;
}

module.exports = FPClient;
