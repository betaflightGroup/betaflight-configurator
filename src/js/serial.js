'use strict';

const serial = {
    connected:      false,
    connectionId:   false,
    openCanceled:   false,
    bitrate:        0,
    bytesReceived:  0,
    bytesSent:      0,
    failed:         0,
    connectionType: 'serial', // 'serial' or 'tcp' or 'virtual'
    connectionIP:   '127.0.0.1',
    connectionPort: 5761,

    transmitting:   false,
    outputBuffer:   [],

    connect: function (path, options, callback) {
        const self = this;
        const testUrl = path.match(/^tcp:\/\/([A-Za-z0-9\.-]+)(?:\:(\d+))?$/);

        if (testUrl) {
            self.connectTcp(testUrl[1], testUrl[2], options, callback);
        } else if (path === 'virtual') {
            self.connectVirtual(callback);
        } else {
            self.connectSerial(path, options, callback);
        }
    },
    connectSerial: function (path, options, callback) {
        const self = this;
        self.connectionType = 'serial';

        chrome.serial.connect(path, options, function (connectionInfo) {
            if (connectionInfo && !self.openCanceled && !checkChromeRuntimeError()) {
                self.connected = true;
                self.connectionId = connectionInfo.connectionId;
                self.bitrate = connectionInfo.bitrate;
                self.bytesReceived = 0;
                self.bytesSent = 0;
                self.failed = 0;

                self.onReceive.addListener(function log_bytesReceived(info) {
                    self.bytesReceived += info.data.byteLength;
                });

                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                    switch (info.error) {
                        case 'system_error': // we might be able to recover from this one
                            if (!self.failed++) {
                                chrome.serial.setPaused(self.connectionId, false, function () {
                                    self.getInfo(function (getInfo) {
                                        if (getInfo) {
                                            if (!getInfo.paused) {
                                                console.log(`${self.connectionType}: connection recovered from last onReceiveError`);
                                                self.failed = 0;
                                            } else {
                                                console.log(`${self.connectionType}: connection did not recover from last onReceiveError, disconnecting`);
                                                GUI.log(i18n.getMessage('serialUnrecoverable'));
                                                self.errorHandler(getInfo.error, 'receive');
                                            }
                                        } else {
                                            checkChromeRuntimeError();
                                        }
                                    });
                                });
                            }
                            break;

                        case 'overrun':
                            // wait 50 ms and attempt recovery
                            self.error = info.error;
                            setTimeout(function() {
                                chrome.serial.setPaused(info.connectionId, false, function() {
                                    self.getInfo(function (_info) {
                                        if (_info) {
                                            if (_info.paused) {
                                                // assume unrecoverable, disconnect
                                                console.log(`${self.connectionType}: connection did not recover from ${self.error} condition, disconnecting`);
                                                GUI.log(i18n.getMessage('serialUnrecoverable'));
                                                self.errorHandler(_info.error, 'receive');
                                            }
                                            else {
                                                console.log(`${self.connectionType}: connection recovered from ${self.error} condition`);
                                            }
                                        }
                                    });
                                });
                            }, 50);
                            break;

                        case 'timeout':
                            // No data has been received for receiveTimeout milliseconds.
                            // We will do nothing.
                            break;

                        case 'frame_error':
                        case 'parity_error':
                            GUI.log(i18n.getMessage('serialError' + inflection.camelize(info.error)));
                            self.errorHandler(info.error, 'receive');
                            break;
                        case 'break': // This seems to be the error that is thrown under NW.js in Windows when the device reboots after typing 'exit' in CLI
                        case 'disconnected':
                        case 'device_lost':
                        default:
                            self.errorHandler(info.error, 'receive');
                            break;
                    }
                });

                console.log(`${self.connectionType}: connection opened with ID: ${connectionInfo.connectionId} , Baud: ${connectionInfo.bitrate}`);

                if (callback) {
                    callback(connectionInfo);
                }

            } else {

                if (connectionInfo && self.openCanceled) {
                    // connection opened, but this connect sequence was canceled
                    // we will disconnect without triggering any callbacks
                    self.connectionId = connectionInfo.connectionId;
                    console.log(`${self.connectionType}: connection opened with ID: ${connectionInfo.connectionId} , but request was canceled, disconnecting`);

                    // some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
                    setTimeout(function initialization() {
                        self.openCanceled = false;
                        self.disconnect(function resetUI() {
                            console.log(`${self.connectionType}: connect sequence was cancelled, disconnecting...`);
                        });
                    }, 150);
                } else if (self.openCanceled) {
                    // connection didn't open and sequence was canceled, so we will do nothing
                    console.log(`${self.connectionType}: connection didn\'t open and request was canceled`);
                    self.openCanceled = false;
                } else {
                    console.log(`${self.connectionType}: failed to open serial port`);
                }
                if (callback) {
                    callback(false);
                }
            }
        });
    },
    connectTcp: function (ip, port, options, callback) {
        const self = this;
        self.connectionIP = ip;
        self.connectionPort = port || 5761;
        self.connectionPort = parseInt(self.connectionPort);
        self.connectionType = 'tcp';

        chrome.sockets.tcp.create({
            persistent: false,
            name: 'Betaflight',
            bufferSize: 65535,
        }, function(createInfo) {
            if (createInfo && !self.openCanceled || !checkChromeRuntimeError()) {
                self.connectionId = createInfo.socketId;
                self.bitrate = 115200; // fake
                self.bytesReceived = 0;
                self.bytesSent = 0;
                self.failed = 0;

                chrome.sockets.tcp.connect(createInfo.socketId, self.connectionIP, self.connectionPort, function (result) {
                    if (result === 0 || !checkChromeRuntimeError()) {
                        chrome.sockets.tcp.setNoDelay(createInfo.socketId, true, function (noDelayResult) {
                            if (noDelayResult === 0 || !checkChromeRuntimeError()) {
                                self.onReceive.addListener(function log_bytesReceived(info) {
                                    self.bytesReceived += info.data.byteLength;
                                });
                                self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
                                    if (info.socketId !== self.connectionId) return;

                                    if (self.connectionType === 'tcp' && info.resultCode < 0) {
                                        self.errorHandler(info.resultCode, 'receive');
                                    }
                                });
                                self.connected = true;
                                console.log(`${self.connectionType}: connection opened with ID ${createInfo.socketId} , url: ${self.connectionIP}:${self.connectionPort}`);
                                if (callback) {
                                    callback(createInfo);
                                }
                            }
                        });
                    } else {
                        console.log(`${self.connectionType}: failed to connect with result ${result}`);
                        if (callback) {
                            callback(false);
                        }
                    }
                });
            }
        });
    },
    connectVirtual: function (callback) {
        const self = this;
        self.connectionType = 'virtual';

        if (!self.openCanceled) {
            self.connected = true;
            self.connectionId = 'virtual';
            self.bitrate = 115200;
            self.bytesReceived = 0;
            self.bytesSent = 0;
            self.failed = 0;

            callback();
        }
    },
    disconnect: function (callback) {
        const self = this;
        self.connected = false;
        self.emptyOutputBuffer();

        if (self.connectionId) {
            // remove listeners
            for (let i = (self.onReceive.listeners.length - 1); i >= 0; i--) {
                self.onReceive.removeListener(self.onReceive.listeners[i]);
            }

            for (let i = (self.onReceiveError.listeners.length - 1); i >= 0; i--) {
                self.onReceiveError.removeListener(self.onReceiveError.listeners[i]);
            }
            if (self.connectionType !== 'virtual') {
                if (self.connectionType === 'tcp') {
                    chrome.sockets.tcp.disconnect(self.connectionId, function () {
                        checkChromeRuntimeError();
                        console.log(`${self.connectionType}: disconnecting socket.`);
                    });
                }

                const disconnectFn = (self.connectionType === 'serial') ? chrome.serial.disconnect : chrome.sockets.tcp.close;
                disconnectFn(self.connectionId, function (result) {
                    checkChromeRuntimeError();

                    result = result || self.connectionType === 'tcp';
                    console.log(`${self.connectionType}: ${result ? 'closed' : 'failed to close'} connection with ID: ${self.connectionId}, Sent: ${self.bytesSent} bytes, Received: ${self.bytesReceived} bytes`);

                    self.connectionId = false;
                    self.bitrate = 0;

                    if (callback) callback(result);
                });
            } else {
                self.connectionId = false;
                CONFIGURATOR.virtualMode = false;
                self.connectionType = false;
                if (callback) {
                    callback(true);
                }
            }
        } else {
            // connection wasn't opened, so we won't try to close anything
            // instead we will rise canceled flag which will prevent connect from continueing further after being canceled
            self.openCanceled = true;
        }
    },
    getDevices: function (callback) {
        chrome.serial.getDevices(function (devices_array) {
            const devices = [];
            devices_array.forEach(function (device) {
                devices.push({
                              path: device.path,
                              displayName: device.displayName,
                             });
            });

            callback(devices);
        });
    },
    getInfo: function (callback) {
        const chromeType = (this.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
        chromeType.getInfo(this.connectionId, callback);
    },
    send: function (data, callback) {
        const self = this;
        self.outputBuffer.push({'data': data, 'callback': callback});

        function _send() {
            // store inside separate variables in case array gets destroyed
            const _data = self.outputBuffer[0].data;
            const _callback = self.outputBuffer[0].callback;

            if (!self.connected) {
                console.log(`${self.connectionType}: attempting to send when disconnected`);
                if (_callback) {
                    _callback({
                        bytesSent: 0,
                        error: 'undefined',
                    });
                }
                return;
            }

            const sendFn = (self.connectionType === 'serial') ? chrome.serial.send : chrome.sockets.tcp.send;
            sendFn(self.connectionId, _data, function (sendInfo) {
                checkChromeRuntimeError();

                if (sendInfo === undefined) {
                    console.log('undefined send error');
                    if (_callback) {
                        _callback({
                            bytesSent: 0,
                            error: 'undefined',
                        });
                    }
                    return;
                }

                if (self.connectionType === 'tcp' && sendInfo.resultCode < 0) {
                    self.errorHandler(sendInfo.resultCode, 'send');
                    return;
                }

                // track sent bytes for statistics
                self.bytesSent += sendInfo.bytesSent;

                // fire callback
                if (_callback) {
                    _callback(sendInfo);
                }

                // remove data for current transmission from the buffer
                self.outputBuffer.shift();

                // if there is any data in the queue fire send immediately, otherwise stop trasmitting
                if (self.outputBuffer.length) {
                    // keep the buffer withing reasonable limits
                    if (self.outputBuffer.length > 100) {
                        let counter = 0;

                        while (self.outputBuffer.length > 100) {
                            self.outputBuffer.pop();
                            counter++;
                        }

                        console.log(`${self.connectionType}: send buffer overflowing, dropped: ${counter} ${entries}`);
                    }

                    _send();
                } else {
                    self.transmitting = false;
                }
            });
        }

        if (!self.transmitting) {
            self.transmitting = true;
            _send();
        }
    },
    onReceive: {
        listeners: [],

        addListener: function (function_reference) {
            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            chromeType.onReceive.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            for (let i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chromeType.onReceive.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    onReceiveError: {
        listeners: [],

        addListener: function (function_reference) {
            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            chromeType.onReceiveError.addListener(function_reference);
            this.listeners.push(function_reference);
        },
        removeListener: function (function_reference) {
            const chromeType = (serial.connectionType === 'serial') ? chrome.serial : chrome.sockets.tcp;
            for (let i = (this.listeners.length - 1); i >= 0; i--) {
                if (this.listeners[i] == function_reference) {
                    chromeType.onReceiveError.removeListener(function_reference);

                    this.listeners.splice(i, 1);
                    break;
                }
            }
        }
    },
    emptyOutputBuffer: function () {
        this.outputBuffer = [];
        this.transmitting = false;
    },
    errorHandler: function (result, direction) {
        const self = this;

        self.connected = false;
        FC.CONFIG.armingDisabled = false;
        FC.CONFIG.runawayTakeoffPreventionDisabled = false;

        let message = 'error: UNDEFINED';
        if (self.connectionType === 'tcp') {
            switch (result){
                case -15:
                    // connection is lost, cannot write to it anymore, preventing further disconnect attempts
                    message = 'error: ERR_SOCKET_NOT_CONNECTED';
                    console.log(`${self.connectionType}: ${direction} ${message}: ${result}`);
                    self.connectionId = false;
                    return;
                case -21:
                    message = 'error: NETWORK_CHANGED';
                    break;
                case -100:
                    message = 'error: CONNECTION_CLOSED';
                    break;
                case -102:
                    message = 'error: CONNECTION_REFUSED';
                    break;
                case -105:
                    message = 'error: NAME_NOT_RESOLVED';
                    break;
                case -106:
                    message = 'error: INTERNET_DISCONNECTED';
                    break;
                case -109:
                    message = 'error: ADDRESS_UNREACHABLE';
                    break;
            }
        }
        console.log(`${self.connectionType}: ${direction} ${message}: ${result}`);

        if (GUI.connected_to || GUI.connecting_to) {
            $('a.connect').click();
        } else {
            self.disconnect();
        }
    },
};
