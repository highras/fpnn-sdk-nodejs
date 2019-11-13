'use strict'

class ErrorRecorder {
    static get instance() {
        if (!this._instance) {
            this._instance = new ErrorRecorder();
        }
        return this._instance;
    }

    constructor() {
        this._recorder = null;
    }

    set recorder(value) {
        this._recorder = value;
    }

    recordError(err) {
        if (!this._recorder) {
            this._recorder = new ErrorRecorder.BaseRecorder();
        }

        this._recorder.recordError && this._recorder.recordError(err);
    }
}

ErrorRecorder.BaseRecorder = class {
    recordError(err) {
        console.error(err);
    }
};

module.exports = ErrorRecorder;
