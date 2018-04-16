'use strict'

const Emitter = require('events').EventEmitter;
const msgpack = require("msgpack-lite");

const FPConfig = require('./FPConfig');
const FPSocket = require('./FPSocket');
const FPPackage = require('./FPPackage');
const FPCallback = require('./FPCallback');
const FPEncryptor = require('./FPEncryptor');
const FPProcessor = require('./FPProcessor');

class FPClient{
    constructor(options){
        this._autoReconnect = options.autoReconnect || false;
        this._connectionTimeout = options.connectionTimeout || 30 * 1000;

        this._conn = new FPSocket(options);

        let self = this; 
        this._conn.on('connect', function(){
            onConnect.call(self);
        });

        this._conn.on('close', function(){
            onClose.call(self);
        });

        this._conn.on('data', function(chunk){
            onData.call(self, chunk);
        });

        this._conn.on('error', function(err){
            self.emit('error', err);
        });

        this._pkg = new FPPackage();
        this._cbs = new FPCallback();
        this._cyr = new FPEncryptor(this._pkg);
        this._psr = new FPProcessor();

        this._seq = 0;
        this._wpos = 0;
        this._peekData = null;

        this._intervalID = 0;

        this._buffer = Buffer.allocUnsafe(FPConfig.READ_BUFFER_LEN);
    }

    get processor(){
        return this._psr;
    }

    set processor(value){
        return this._psr = value;
    }

    connectCryptor(pemData, curveName, strength, streamMode){
        if (this.hasConnect || this._cyr.crypto){
            this.emit('error', new Error('has connected or enable crypto!'));
            return;
        }

        this._cyr.encryptor(pemData, curveName, strength, streamMode);
        this.connect();
    }

    connect(){
        if (this.hasConnect){
            return;
        }

        this._cyr.cryptoed = false;
        this._conn.open();
    }

    close(){
        if (this._conn){
            this._conn.close();
        } 
    }

    sendQuest(options, callback, timeout){
        if (!this.isOpen){
            this.emit('error', new Error('no connect'));
            return;
        }

        let data = {};

        data.magic = options.magic || FPConfig.TCP_MAGIC;
        data.version = options.version || 1;
        data.flag = options.flag || 0;
        data.mtype = options.mtype !== undefined ? options.mtype : 1;

        data.method = options.method;
        data.seq = (options.seq === undefined) ? ++this._seq : options.seq;
        data.payload = options.payload;

        data = this._pkg.buildPkgData(data);
        if (callback) this._cbs.addCb(this._pkg.cbKey(data), callback, timeout);

        let buf = this._pkg.enCode(data);
        buf = this._cyr.enCode(buf);

        this._conn.write(buf);
    }

    sendNotify(options){
        if (!this.isOpen){
            this.emit('error', new Error('no connect'));
            return;
        }

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

    get isOpen(){
        return this._conn.isOpen;
    }

    get hasConnect(){
        return this._conn.isOpen || this._conn.isConnecting;
    }
}

function onConnect(){
    sendPubkey.call(this);
}

function sendPubkey(){
    if (this._cyr.crypto){
        let options = {
            flag: 1,
            method: '*key',
            payload: msgpack.encode({ publicKey:this._cyr.pubKey, streamMode:this._cyr.streamMode, bits:this._cyr.strength })
        };

        let self = this;
        this.sendQuest(options, function(data){
            onPubkey.call(self, data); 
        }, 10 * 1000);

        return;
    }

    if (this._intervalID){
        clearInterval(this._intervalID);
        this._intervalID = 0;
    }

    this.emit('connect');
}

function onPubkey(data){
    if (this._intervalID){
        clearInterval(this._intervalID);
        this._intervalID = 0;
    }

    this.emit('connect');
}

function onClose(){
    this._seq = 0;
    this._wpos = 0;
    this._peekData = null;

    this._buffer = Buffer.allocUnsafe(FPConfig.READ_BUFFER_LEN);
    this._cbs.removeCb();

    this.emit('close');

    if (this._autoReconnect){
        reConnect.call(this);
    }
}

function reConnect(){
    if (this._intervalID){
        clearInterval(this._intervalID);
        this._intervalID = 0;
    }

    let self = this;
    this._intervalID = setInterval(function(){
        self.connect();
    }, this._connectionTimeout);
}

function onData(chunk){
    let len = this._wpos + chunk.length;
    if (len > this._buffer.length){
        len = Math.max(len, 2 * FPConfig.READ_BUFFER_LEN);
        let buf = Buffer.allocUnsafe(len);
        this._buffer.copy(buf, 0, 0, this._wpos);
        this._buffer = buf;
    }

    this._wpos += chunk.copy(this._buffer, this._wpos, 0);

    if (this._wpos < 12){
        return;
    }

    if (!this._peekData){
        if (this._cyr.crypto){
            this._cyr.cryptoed = true;
        }
        
        this._peekData = this._cyr.peekHead(this._buffer);

        if (!this._peekData){
            this.conn.close(new Error('worng package!'));
            return;
        }
    }

    let diff = this._wpos - this._peekData.pkgLen;
    if (diff >= 0){
        let mbuf = Buffer.allocUnsafe(this._peekData.pkgLen);
        this._buffer.copy(mbuf, 0, 0, this._peekData.pkgLen);

        let len = Math.max(2 * diff, FPConfig.READ_BUFFER_LEN);
        let buf = Buffer.allocUnsafe(len);
        this._wpos = this._buffer.copy(buf, 0, this._peekData.pkgLen, this._peekData.pkgLen + diff);
        this._buffer = buf;

        delete this._peekData;
        this._peekData = null;

        mbuf = this._cyr.deCode(mbuf);

        let data = this._pkg.deCode(mbuf);

        if (this._pkg.isAnswer(data)){
            let cbkey = this._pkg.cbKey(data);
            this._cbs.execCb(cbkey, data);
        }

        if (this._pkg.isQuest(data)){
            let self = this;
            this._psr.service(data, function(payload, exception){
                sendAnswer.call(self, data.flag, data.seq, payload, exception);
            });
        }
    }
}

function sendAnswer(flag, seq, payload, exception){
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