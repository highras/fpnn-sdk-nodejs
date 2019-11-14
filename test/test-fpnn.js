'use strict'

const fs = require('fs');
const path = require('path');
const msgpack = require("msgpack-lite");
const FPClient = require('../src/fpnn/FPClient');

let onError = function (err) {
    console.error(err);
}
let onClose = function (err) {
    console.log('close!');
}
let onConnect = function () {
    console.log('connect!');

    let options = {
        flag: 1,
        method: 'httpDemo',
        payload: msgpack.encode({
            pid: 10,
            sign: '',
            salt: 1111111111111,
            from: 122,
            to: 123,
            mid: 345,
            mtype: 20,
            msg: 'sss',
            attrs: ''
        }),
    };

    // let options = {
    //     method: 'httpDemo',
    //     payload: JSON.stringify({pid:10, sign:'', salt:1111111111111, from:122, to:123, mid:345, mtype:20, msg:'sss', attrs:''}),
    // };

    client.sendQuest(options, function (data) {
        // console.log('callback:', data);
        console.log('payload:', msgpack.decode(data.payload));
    }, 10 * 1000);
}

let client = new FPClient({
        host: '52.83.245.22',
        port: 13013,
        connectionTimeout: 10 * 1000,
        onConnect: onConnect,
        onClose: onClose,
        onError: onError
    });

fs.readFile(path.resolve(__dirname, '../key/test-secp256k1-compressed-public.key-false'), function (err, data) {
    if (err) {
        // console.error(err);
    }

    let res = client.encryptor('secp256k1', data, false, 128);
    if (res) {
        client.connect(function (fpEncryptor) {
            return msgpack.encode({
                publicKey: fpEncryptor.pubKey,
                streamMode: fpEncryptor.streamMode,
                bits: fpEncryptor.strength
            });
        });
    } else {
        client.connect();
    }
});