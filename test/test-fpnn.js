'use strict'

const path = require('path');
const fs = require('fs');
const msgpack = require("msgpack-lite");

const FPClient = require('../src/FPClient');

let client = new FPClient({ host: '35.167.185.139', port: 13013, autoReconnect: true, connectionTimeout: 10 * 1000 });

fs.readFile(path.resolve(__dirname, '../key/test-secp256k1-compressed-public.key'), (err, data) => {
    if (err) throw err;

    client.connectCryptor(data, null, 128, false);
    // client.connect();
});

client.on('connect', () => {
    let options = {
        flag: 1,
        method: 'httpDemo',
        payload: msgpack.encode({pid:10, sign:'', salt:1111111111111, from:122, to:123, mid:345, mtype:20, msg:'sss', attrs:''}),
    };

    // let options = {
    //     method: 'httpDemo',
    //     payload: JSON.stringify({pid:10, sign:'', salt:1111111111111, from:122, to:123, mid:345, mtype:20, msg:'sss', attrs:''}),
    // };

    client.sendQuest(options, (data) => {
        console.log(data);
        // console.log(msgpack.decode(data.payload));
    }, 10 * 1000);
});

client.on('error', (err) => {
    console.error(err);
});