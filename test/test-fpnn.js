'use strict'

const path = require('path');
const fs = require('fs');
const msgpack = require("msgpack-lite");

const FPClient = require('../src/FPClient');

let client = new FPClient({ host: '35.167.185.139', port: 13013, autoReconnect: true, connectionTimeout: 10 * 1000 });

fs.readFile(path.resolve(__dirname, '../key/test-secp256k1-compressed-public.key'), function(err, data) {

    if (err) {

        throw err;
    }

    client.encryptor('secp256k1', data, false, 128);
    client.connect(function(fpEncryptor) {

        return msgpack.encode({ 
            publicKey:fpEncryptor.pubKey, 
            streamMode:fpEncryptor.streamMode, 
            bits:fpEncryptor.strength 
        });
    });
});

client.on('connect', function() {

    let options = {
        flag: 1,
        method: 'httpDemo',
        payload: msgpack.encode({pid:10, sign:'', salt:1111111111111, from:122, to:123, mid:345, mtype:20, msg:'sss', attrs:''}),
    };

    // let options = {
    //     method: 'httpDemo',
    //     payload: JSON.stringify({pid:10, sign:'', salt:1111111111111, from:122, to:123, mid:345, mtype:20, msg:'sss', attrs:''}),
    // };

    client.sendQuest(options, function(data) {

        console.log(data);
        // console.log(msgpack.decode(data.payload));
    }, 10 * 1000);
});

client.on('error', function(err) {

    console.error(err);
});