'use strict'

const Emitter = require('events').EventEmitter;
const net = require('net');
const FPConfig = require('./FPConfig');

class FPSocket {

    constructor(options) {

        this._host = options.host || null;
        this._port = options.port || 0;
        this._timeout = options.connectionTimeout || 10 * 1000;

        this._client = null;
        this._isConnect = false;
        this._connectTimeout = 0;
        this._queue = [];
    }

    get host() {  

        return this._host; 
    }

    get port() { 

        return this._port; 
    }

    write(buf) {

        if (buf && buf.length) {

            this._queue.push(buf);
        }

        writeSocket.call(this);
    }

    close(err) {
        
        if (err) {

            this.emit('error', err);
        }

        if (this._client) {
            
            this._client.destroy();
        }
    }

    open() {
         
        if (this.isConnecting || this.isOpen || !this._host || this._port < 0) {
            
            this.emit('error', new Error('has connected or worng endpoint!'));
            return;
        }

        let self = this;
        this._client = new net.Socket();

        this._client.on('connect', function() {

            onConnect.call(self);
        });

        this._client.on('close', function(had_error) {

            onClose.call(self, had_error);
        });

        this._client.on('error', function(err) {

            onError.call(self, err);
        });

        this._client.on('data', function(chunk) {

            onData.call(self, chunk);
        });

        if (this._connectTimeout) {

            clearTimeout(this._connectTimeout);
            this._connectTimeout = 0;
        }

        this._connectTimeout = setTimeout(function() {

            let err = new Error('connect timeout!');

            if (self.isOpen) {

                self.close(err);
                return;
            }

            if (self.isConnecting) {

                self.close(err);
                onClose.call(self, err);
                return;
            } 

            onClose.call(self, err);
        }, this._timeout);

        this._client.connect(this._port, this._host);
    }

    get isOpen() {

        return this._isConnect;
    }

    get isConnecting() {

        if (this._client) {

            return this._client.connecting;
        }

        return false;
    }

    destroy() {

        this.removeAllListeners();
        this.close();

        onClose.call(this);
    }
}

function writeSocket() {

    if (!this.isOpen) {

        return;
    }

    while (this._queue.length) {

        let buf = this._queue.shift();
        let success = this._client.write(buf);

        if (!success) {

            return;
        }
    }
}

function onData(chunk) {

    this.emit('data', chunk);
}

function onConnect() {

    this._isConnect = true;

    if (this._connectTimeout) {

        clearTimeout(this._connectTimeout);
        this._connectTimeout = 0;
    }

    writeSocket.call(this);
    this.emit('connect');
}

function onClose(had_error) {

    if (this._connectTimeout) {

        clearTimeout(this._connectTimeout);
        this._connectTimeout = 0;
    }

    if (had_error) {

        this.emit('error', had_error);
    }

    this._queue = [];
    this._isConnect = false;
    
    this.emit('close');
}

function onError(err) {

    this.emit('error', err);
}

Object.setPrototypeOf(FPSocket.prototype, Emitter.prototype);
module.exports = FPSocket;