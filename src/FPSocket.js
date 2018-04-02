'use strict'

const Emitter = require('events').EventEmitter;
const net = require('net');
const FPConfig = require('./FPConfig');

class FPSocket{
    constructor(options){
        this._host = options ? options.host : null;
        this._port = options ? options.port : 0;
        this._connectionTimeout = options ? options.connectionTimeout : 30 * 1000;

        this._client = null;
        this._isConnect = false;
        this._timeoutID = 0;
    }

    get host(){ 
        return this._host; 
    }

    get port(){ 
        return this._port; 
    }

    write(buf){
        if (buf) this._client.write(buf);
    }

    close(err){
        if (err){
            this.emit('error', err);
        }

        if (this._client){
            this._client.destroy();
        }
    }

    open(){
        if (this.isConnecting || this.isOpen || !this._host || this._port < 0){
            this.emit('error', { code:FPConfig.ERROR_CODE.FPNN_EC_CORE_INVALID_CONNECTION, ex:'FPNN_EC_CORE_INVALID_CONNECTION' });
            return;
        }

        let self = this;
        this._client = new net.Socket();

        this._client.on('connect', function(){
            onConnect.call(self);
        });

        this._client.on('close', function(had_error){
            onClose.call(self, had_error);
        });

        this._client.on('error', function(err){
            onError.call(self, err);
        });

        this._client.on('data', function(chunk){
            onData.call(self, chunk);
        });

        this._timeoutID = setTimeout(function(){
            if (self.isConnecting){
                self.close({ code:FPConfig.ERROR_CODE.FPNN_EC_CORE_TIMEOUT, ex:'FPNN_EC_CORE_TIMEOUT' });
            }
        }, this._connectionTimeout);

        this._client.connect(this._port, this._host);
    }

    get isOpen(){
        return this._isConnect;
    }

    get isConnecting(){
        if (this._client){
            return this._client.connecting;
        }

        return false;
    }
}

function onData(chunk){
    this.emit('data', chunk);
}

function onConnect(){
    this._isConnect = true;

    if (this._timeoutID){
        clearTimeout(this._timeoutID);
        this._timeoutID = 0;
    }

    this.emit('connect');
}

function onClose(had_error){
    if (this._timeoutID){
        clearTimeout(this._timeoutID);
        this._timeoutID = 0;
    }

    if (had_error){
        this.emit('error', { code:FPConfig.ERROR_CODE.FPNN_EC_CORE_INVALID_PACKAGE, ex:'FPNN_EC_CORE_INVALID_PACKAGE' });
    }

    this._isConnect = false;
    this.emit('close');
}

function onError(err){
    this.emit('error', err);
}

Object.setPrototypeOf(FPSocket.prototype, Emitter.prototype);
module.exports = FPSocket;