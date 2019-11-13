'use strict'

const crypto = require('crypto');

class FPManager {
    static get instance() {
        if (!this._instance) {
            this._instance = new FPManager();
        }
        return this._instance;
    }

    constructor() {
        this._interval = new IntervalTask();
        this._timer = new TimerTask();
        this._service = new ServiceTask();
    }

    addSecond(callback) {
        if (callback == null) {
            return;
        }
        this._interval.addSecond(callback);
    }

    removeSecond(callback) {
        if (callback == null) {
            return;
        }
        this._interval.removeSecond(callback);
    }

    asyncTask(callback, state) {
        if (!callback) {
            return;
        }
        this._service.addServiceTask(callback, state);
    }

    delayTask(milliSecond, callback, state) {
        if (milliSecond <= 0) {
            this.asyncTask(callback, state);
            return;
        }
        if (!callback) {
            return;
        }
        this._timer.addTimerTask(callback, milliSecond, state);

    }

    get milliTimestamp() {
        return Date.now();
    }

    get timestamp() {
        return Math.floor(Date.now() / 1000);
    }

    md5(data) {
        let hash = crypto.createHash('md5');
        hash.update(data);
        return hash.digest('hex');
    }
}

module.exports = FPManager;

class IntervalTask {
    constructor() {
        this._invalId = 0;
        this._secondCalls = [];

        this.startInterval();
    }

    startInterval() {
        if (this._invalId) {
            return
        }
        let self = this;
        this._invalId = setInterval(function () {
                self.callSecond();
            }, 1000);
    }

    stopInterval() {
        if (this._invalId) {
            clearInterval(this._invalId);
            this._invalId = 0;
        }
    }

    callSecond() {
        let ts = FPManager.instance.milliTimestamp;
        for (let key in this._secondCalls) {
            let callback = this._secondCalls[key];
            FPManager.instance.asyncTask(function (state) {
                callback && callback(ts);
            }, null);
        }
    }

    addSecond(callback) {
        if (this._secondCalls.length >= 500) {
            ErrorRecorder.recordError(new Error('Second Calls Limit!'));
            return;
        }
        this._secondCalls.push(callback);
    }

    removeSecond(callback) {
        let index = this._secondCalls.indexOf(callback);
        if (index != -1) {
            this._secondCalls.splice(index, 1);
        }
    }
}

class ServiceTask {
    constructor() {
        this._queue = [];
        this._tmoutId = 0;
    }

    addServiceTask(callback, state) {
        if (this._queue.length < 10000) {
            this._queue.push({
                st: state,
                cb: callback
            });
        }
        if (this._queue.length == 9998) {
            ErrorRecorder.recordError(new Error('Service Calls Limit!'));
        }
        this.checkTask();
    }

    checkTask() {
        if (this._queue.length > 0) {
            this.startTimeout();
        } else {
            this.stopTimeout();
        }
    }

    startTimeout() {
        if (this._tmoutId) {
            return
        }
        let self = this;
        this._tmoutId = setTimeout(function () {
                let task = self._queue.shift();
                self.checkTask();
                if (task) {
                    task.cb && task.cb(task.st);
                }
            }, 0);
    }

    stopTimeout() {
        if (this._tmoutId) {
            clearTimeout(this._tmoutId);
            this._tmoutId = 0;
        }
    }
}

class TimerTask {
    constructor() {
        this._tmoutId = 0;
        this._task = null;
        this._heap = new MinHeap(null, function (a, b) {
                return a.ts > b.ts;
            });
    }

    addTimerTask(callback, delay, state) {
        let ts = FPManager.instance.milliTimestamp + delay;
        let task = {
            ts: ts,
            st: state,
            cb: callback
        }
        if (!this._task) {
            this.setTask(task);
            return;
        }
        if (task.ts < this._task.ts) {
            this.stopTimeout();
            this._heap.push(this._task);
            this.setTask(task);
            return;
        }
        this._heap.push(task);
    }

    checkTask() {
        this._task = this._heap.pop();
        this.setTask(this._task);
    }

    setTask(task) {
        if (!task) {
            return;
        }
        let self = this;
        let delay = Math.max(0, (task.ts - FPManager.instance.milliTimestamp));
        if (this._tmoutId) {
            return
        }
        this._task = task;
        this._tmoutId = setTimeout(function () {
		        self._tmoutId = 0;
                self.checkTask();
                if (task) {
                    task.cb && task.cb(task.state);
                }
            }, delay);
    }

    stopTimeout() {
        if (this._tmoutId) {
            clearTimeout(this._tmoutId);
            this._tmoutId = 0;
        }
    }
}

class MinHeap {
    constructor(max, compare) {
        this.tree = !max ? [0] : (max < 65536 ? (max < 256 ? new Uint8Array(max) : new Uint16Array(max)) : new Uint32Array(max));
        this.p = Number(!!(this.cmp = compare || function (a, b) {
                    return a > b
                }));
    }

    peek() {
        return this.tree[1];
    }

    length() {
        return this.p - 1;
    }

    push(n) {
        var q = this.p++,
        p,
        v,
        t = this.tree,
        c = this.cmp;
        while ((p = q >> 1) > 0) {
            v = t[p];
            if (c(n, v))
                break;
            t[q] = v;
            q = p;
        }
        t[q] = n;
    }

    pop() {
        if (this.p == 1)
            return null;
        var t = this.tree,
        c = this.cmp,
        p = --this.p,
        r = t[1],
        b = t[p],
        n = 1,
        j,
        v;
        while ((j = n << 1) < p) {
            if (j + 1 <= p)
                if (c(t[j], t[j + 1]))
                    j++;
            v = t[j];
            if (c(v, b))
                break;
            t[n] = v;
            n = j;
        }
        t[n] = b;
        return r;
    }
}
