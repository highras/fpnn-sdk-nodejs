'use strict'

const Emitter = require('events').EventEmitter;

const FPConfig = require('./FPConfig');
const FPSocket = require('./FPSocket');
const FPPackage = require('./FPPackage');
const FPCallback = require('./FPCallback');
const FPEncryptor = require('./FPEncryptor');
const FPProcessor = require('./FPProcessor');

class FPClient {

    constructor(options) {

        this._autoReconnect = options.autoReconnect || false;

        this._conn = new FPSocket(options);

        let self = this; 
        this._conn.on('connect', function() {

            onConnect.call(self);
        });

        this._conn.on('close', function() {

            onClose.call(self);
        });

        this._conn.on('data', function(chunk) {

            onData.call(self, chunk);
        });

        this._conn.on('error', function(err) {

            self.emit('error', err);
        });

        this._pkg = new FPPackage();
        this._cbs = new FPCallback();
        this._cyr = new FPEncryptor(this._pkg);
        this._psr = new FPProcessor();

        this._seq = 0;
        this._wpos = 0;
        this._peekData = null;

        this._readID = 0;
        this._reconnectID = 0;
        this._keyFn = null;

        this._buffer = Buffer.allocUnsafe(FPConfig.READ_BUFFER_LEN);
    }

    get processor() {

        return this._psr;
    }

    set processor(value) {

        return this._psr = value;
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

            this.emit('error', new Error('has connected or enable crypto!'));
            return;
        }

        this._cyr.encryptor();
    }

    connect(keyFn) {

        if (this.hasConnect) {

            return;
        }

        if (keyFn != undefined) {

            this._keyFn = keyFn;
        }

        this._conn.open();
    }

    close() {

        if (this._conn) {

            this._conn.close();
        } 
    }

    sendQuest(options, callback, timeout) {

        let data = {};

        data.magic = options.magic || FPConfig.TCP_MAGIC;
        data.version = options.version || 1;
        data.flag = options.flag || 0;
        data.mtype = options.mtype !== undefined ? options.mtype : 1;

        data.method = options.method;
        data.seq = (options.seq === undefined) ? ++this._seq : options.seq;
        data.payload = options.payload;

        data = this._pkg.buildPkgData(data);

        if (callback) {

            this._cbs.addCb(this._pkg.cbKey(data), callback, timeout);
        }

        let buf = this._pkg.enCode(data);
        buf = this._cyr.enCode(buf);

        this._conn.write(buf);
    }

    sendNotify(options) {

        let data = {};

        data.magic = options.magic || FPConfig.TCP_MAGIC;
        data.version = options.version || 1;
        data.flag = options.flag || 0;
        data.mtype = options.mtype || 0;

        data.method = options.method;
        data.payload = options.payload;

        data = this._pkg.buildPkgData(data);
        let buf = this._pkg.enCode(data);
        buf = this._cyr.enCode(buf);

        this._conn.write(buf);
    }

    get isOpen() {

        return this._conn.isOpen;
    }

    get hasConnect() {

        return this._conn.isOpen || this._conn.isConnecting;
    }
}

function onConnect() {

    sendPubkey.call(this);
}

function sendPubkey() {

    if (this._cyr.crypto) {
        
        let options = {
            flag: 1,
            method: '*key',
            payload: this._keyFn(this._cyr)
        };

        let self = this;
        this.sendQuest(options, function(data) {

            onPubkey.call(self, data); 
        }, 10 * 1000);

        this._cyr.cryptoed = true;
        return;
    }

    if (this._reconnectID) {

        clearTimeout(this._reconnectID);
        this._reconnectID = 0;
    }

    this.emit('connect');
}

function onPubkey(data) {

    if (data instanceof Error) {

        this._cyr.setCryptoed(false);
        this.emit('error', data);
        return;
    }

    if (this._reconnectID) {

        clearTimeout(this._reconnectID);
        this._reconnectID = 0;
    }

    this.emit('connect');
}

function onClose() {

    if (this._readID) {

        clearInterval(this._readID);
        this._readID = 0;
    }

    if (this._reconnectID) {

        clearTimeout(this._reconnectID);
        this._reconnectID = 0;
    }

    this._seq = 0;
    this._wpos = 0;
    this._peekData = null;

    this._buffer = Buffer.allocUnsafe(FPConfig.READ_BUFFER_LEN);
    this._cyr.clear();

    this.emit('close');
    reConnect.call(this);
}

function reConnect() {

    if (!this._autoReconnect) {

        return;
    }

    if (this._reconnectID) {

        return;
    }

    let self = this;

    this._reconnectID = setTimeout(function() {

        if (self._cyr.crypto) {

            self.encryptor();
            self.connect(self._keyFn);
            return
        }

        self.connect();
    }, 100);
}

function onData(chunk) {

    let len = this._wpos + chunk.length;

    if (len > this._buffer.length) {

        resizeBuffer.call(this, len, 2 * FPConfig.READ_BUFFER_LEN);
    }

    this._wpos += chunk.copy(this._buffer, this._wpos, 0);

    if (!this._readID) {

        let self = this;
        this._readID = setInterval(function () {

            readPeekData.call(self);
        }, 0);
    }
}

function resizeBuffer(len1, len2, offset=0) {

    let len = Math.max(len1, len2);

    let buf = Buffer.allocUnsafe(len);
    this._wpos = this._buffer.copy(buf, 0, offset, this._wpos);
    this._buffer = buf;
}

function readPeekData () {

    if (this._wpos < 12) {

        return;
    }

    if (!this._peekData) {

        this._peekData = this._cyr.peekHead(this._buffer);

        if (!this._peekData) {

            this.conn.close(new Error('worng package!'));
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

    if (this._pkg.isAnswer(data)) {

        let cbkey = this._pkg.cbKey(data);
        this._cbs.execCb(cbkey, data);
    }

    if (this._pkg.isQuest(data)) {

        let self = this;
        this._psr.service(data, function(payload, exception) {

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

Object.setPrototypeOf(FPClient.prototype, Emitter.prototype);
module.exports = FPClient;