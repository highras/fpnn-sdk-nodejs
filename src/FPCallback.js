'use strict'

const defer = require('co-defer');
const conf = require('./FPConfig');

const cbMap = {};
const exMap = {};

class FPCallback{

    constructor()
    {
        checkExpire.call(this);
    }

    addCallback(key, cb, timeout){
        if (!cbMap[key]){
            cbMap[key] = cb;
        } 

        if (!timeout){
            timeout = conf.SEND_TIMEOUT;
        }

        let expire = timeout + Date.now();
        exMap[key] = expire;
    }

    removeCallback(key){
        delayRemoveCallback.call(self, key);
    }

    removeAll(){
        for (let key in cbMap){
            delayCallback.call(this, key, { code:conf.ERROR_CODE.FPNN_EC_CORE_TIMEOUT, ex:'FPNN_EC_CORE_TIMEOUT' });
        }
    }

    findCallback(key){
        return cbMap[key];
    }

    callback(key, data){
        delayCallback.call(this, key, data);
    }
}

function checkExpire(){
    let self = this;
    defer.setInterval(function *(){
        for (let key in self.exMap){
            if (self.exMap[key] < Date.now()){
                continue;
            } 
            delayCallback.call(this, key, { code:conf.ERROR_CODE.FPNN_EC_CORE_TIMEOUT, ex:'FPNN_EC_CORE_TIMEOUT' });
        }
    }, conf.CHECK_CBS_INTERVAL);
}

function delayCallback(key, data){
    let self = this;
    defer.nextTick(function *(){
        callback.call(self, key, data);
    }); 
}

function callback(key, data){
    let cb = this.findCallback(key);
    if (cb){
        removeCallback.call(this, key);
        cb(data);
    }
}

function delayRemoveCallback(key){
    let self = this;
    defer.nextTick(function *(){
        removeCallback.call(self, key);
    }); 
}

function removeCallback(key){
    if (cbMap[key]) delete cbMap[key];
    if (exMap[key]) delete exMap[key];
}

module.exports = FPCallback