'use strict'

const Emitter = require('events').EventEmitter;
const net = require('net');
const FPConfig = require('./FPConfig');

class FPSocket {

    constructor(options) {

        this._host = options.host || null;
        this._port = options.port || 0;
        this._connectionTimeout = options.connectionTimeout || 10 * 1000;

        this._client = null;
        this._isConnect = false;
        this._writeID = 0;
        this._timeoutID = 0;
        this._queue = [];
    }

    get host() {  

        return this._host; 
    }

    get port() { 

        return this._port; 
    }

    write(buf) {

        if (buf) {

            this._queue.push(buf);
        } 

        if (!this._writeID) {

            let self = this;
            this._writeID = setInterval(function () {
    
                writeSocket.call(self);
            }, 0);
        }
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

        if (this._timeoutID) {

            clearTimeout(this._timeoutID);
        }

        this._timeoutID = setTimeout(function() {

            if (self.isConnecting) {

                self.close(new Error('connect timeout!'));
            }
        }, this._connectionTimeout);

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
}

function writeSocket() {

    if (!this.isOpen) {

        return;
    }

    while (this._queue.length) {

        if (this._client.write(this._queue[0])) {

            this._queue.shift();
            continue;
        }

        return;
    }
}

function onData(chunk) {

    this.emit('data', chunk);
}

function onConnect() {

    this._isConnect = true;

    if (this._timeoutID) {

        clearTimeout(this._timeoutID);
        this._timeoutID = 0;
    }

    this.emit('connect');
}

function onClose(had_error) {

    if (this._writeID) {

        clearInterval(this._writeID);
        this._writeID = 0;
    }

    if (this._timeoutID) {

        clearTimeout(this._timeoutID);
        this._timeoutID = 0;
    }

    if (had_error) {

        this.emit('error', had_error);
    }

    this._isConnect = false;
    this.emit('close');
}

function onError(err) {

    this.emit('error', err);
}

Object.setPrototypeOf(FPSocket.prototype, Emitter.prototype);
module.exports = FPSocket;