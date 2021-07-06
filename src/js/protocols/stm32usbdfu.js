/*
    USB DFU uses:
    control transfers for communicating
    recipient is interface
    request type is class

    Descriptors seems to be broken in current chrome.usb API implementation (writing this while using canary 37.0.2040.0

    General rule to remember is that DFU doesn't like running specific operations while the device isn't in idle state
    that being said, it seems that certain level of CLRSTATUS is required before running another type of operation for
    example switching from DNLOAD to UPLOAD, etc, clearning the state so device is in dfuIDLE is highly recommended.
*/
'use strict';

var STM32DFU_protocol = function () {
    this.callback = null;
    this.hex = null;
    this.verify_hex = [];

    this.handle = null; // connection handle

    this.request = {
        DETACH:     0x00, // OUT, Requests the device to leave DFU mode and enter the application.
        DNLOAD:     0x01, // OUT, Requests data transfer from Host to the device in order to load them into device internal Flash. Includes also erase commands
        UPLOAD:     0x02, // IN,  Requests data transfer from device to Host in order to load content of device internal Flash into a Host file.
        GETSTATUS:  0x03, // IN,  Requests device to send status report to the Host (including status resulting from the last request execution and the state the device will enter immediately after this request).
        CLRSTATUS:  0x04, // OUT, Requests device to clear error status and move to next step
        GETSTATE:   0x05, // IN,  Requests the device to send only the state it will enter immediately after this request.
        ABORT:      0x06  // OUT, Requests device to exit the current state/operation and enter idle state immediately.
    };

    this.status = {
        OK:                 0x00, // No error condition is present.
        errTARGET:          0x01, // File is not targeted for use by this device.
        errFILE:            0x02, // File is for this device but fails some vendor-specific verification test
        errWRITE:           0x03, // Device is unable to write memory.
        errERASE:           0x04, // Memory erase function failed.
        errCHECK_ERASED:    0x05, // Memory erase check failed.
        errPROG:            0x06, // Program memory function failed.
        errVERIFY:          0x07, // Programmed memory failed verification.
        errADDRESS:         0x08, // Cannot program memory due to received address that is out of range.
        errNOTDONE:         0x09, // Received DFU_DNLOAD with wLength = 0, but device does not think it has all of the data yet.
        errFIRMWARE:        0x0A, // Device's firmware is corrupt. It cannot return to run-time (non-DFU) operations.
        errVENDOR:          0x0B, // iString indicates a vendor-specific error.
        errUSBR:            0x0C, // Device detected unexpected USB reset signaling.
        errPOR:             0x0D, // Device detected unexpected power on reset.
        errUNKNOWN:         0x0E, // Something went wrong, but the device does not know what it was.
        errSTALLEDPKT:      0x0F  // Device stalled an unexpected request.
    };

    this.state = {
        appIDLE:                0, // Device is running its normal application.
        appDETACH:              1, // Device is running its normal application, has received the DFU_DETACH request, and is waiting for a USB reset.
        dfuIDLE:                2, // Device is operating in the DFU mode and is waiting for requests.
        dfuDNLOAD_SYNC:         3, // Device has received a block and is waiting for the host to solicit the status via DFU_GETSTATUS.
        dfuDNBUSY:              4, // Device is programming a control-write block into its nonvolatile memories.
        dfuDNLOAD_IDLE:         5, // Device is processing a download operation. Expecting DFU_DNLOAD requests.
        dfuMANIFEST_SYNC:       6, // Device has received the final block of firmware from the host and is waiting for receipt of DFU_GETSTATUS to begin the Manifestation phase; or device has completed the Manifestation phase and is waiting for receipt of DFU_GETSTATUS.
        dfuMANIFEST:            7, // Device is in the Manifestation phase. (Not all devices will be able to respond to DFU_GETSTATUS when in this state.)
        dfuMANIFEST_WAIT_RESET: 8, // Device has programmed its memories and is waiting for a USB reset or a power on reset. (Devices that must enter this state clear bitManifestationTolerant to 0.)
        dfuUPLOAD_IDLE:         9, // The device is processing an upload operation. Expecting DFU_UPLOAD requests.
        dfuERROR:               10 // An error has occurred. Awaiting the DFU_CLRSTATUS request.
    };

    this.chipInfo = null; // information about chip's memory
    this.flash_layout = { 'start_address': 0, 'total_size': 0, 'sectors': []};
    this.transferSize = 2048; // Default USB DFU transfer size for F3,F4 and F7
};

STM32DFU_protocol.prototype.connect = function (device, hex, options, callback) {
    const self = this;
    self.hex = hex;
    self.callback = callback;

    self.options = {
        erase_chip: false,
        exitDfu: false,
    };

    if (options.exitDfu) {
        self.options.exitDfu = true;
    } else if (options.erase_chip) {
        self.options.erase_chip = true;
    }

    // reset and set some variables before we start
    self.upload_time_start = new Date().getTime();
    self.verify_hex = [];

    // reset progress bar to initial state
    TABS.firmware_flasher.flashingMessage(null, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL).flashProgress(0);

    chrome.usb.getDevices(device, function (result) {
        if (result.length) {
            console.log('USB DFU detected with ID: ' + result[0].device);

            self.openDevice(result[0]);
        } else {
            console.log('USB DFU not found');
            GUI.log(i18n.getMessage('stm32UsbDfuNotFound'));
        }
    });
};

STM32DFU_protocol.prototype.openDevice = function (device) {
    const self = this;

    chrome.usb.openDevice(device, function (handle) {
        if (checkChromeRuntimeError()) {
            console.log('Failed to open USB device!');
            GUI.log(i18n.getMessage('usbDeviceOpenFail'));
            if(GUI.operating_system === 'Linux') {
                GUI.log(i18n.getMessage('usbDeviceUdevNotice'));
            }
            return;
        }

        self.handle = handle;

        GUI.log(i18n.getMessage('usbDeviceOpened', handle.handle.toString()));
        console.log('Device opened with Handle ID: ' + handle.handle);
        self.claimInterface(0);
    });
};

STM32DFU_protocol.prototype.closeDevice = function () {
    const self = this;

    chrome.usb.closeDevice(this.handle, function closed() {
        if (checkChromeRuntimeError()) {
            console.log('Failed to close USB device!');
            GUI.log(i18n.getMessage('usbDeviceCloseFail'));
        }

        GUI.log(i18n.getMessage('usbDeviceClosed'));
        console.log('Device closed with Handle ID: ' + self.handle.handle);

        self.handle = null;
    });
};

STM32DFU_protocol.prototype.claimInterface = function (interfaceNumber) {
    const self = this;

    chrome.usb.claimInterface(this.handle, interfaceNumber, function claimed() {
        // Don't perform the error check on MacOS at this time as there seems to be a bug
        // where it always reports the Chrome error "Error claiming interface." even though
        // the interface is in fact successfully claimed.
        if (checkChromeRuntimeError() && (GUI.operating_system !== "MacOS")) {
            console.log('Failed to claim USB device!');
            self.cleanup();
        }

        console.log('Claimed interface: ' + interfaceNumber);

        if (self.options.exitDfu) {
            self.leave();
        } else {
            self.upload_procedure(0);
        }
    });
};

STM32DFU_protocol.prototype.releaseInterface = function (interfaceNumber) {
    const self = this;

    chrome.usb.releaseInterface(this.handle, interfaceNumber, function released() {
        console.log('Released interface: ' + interfaceNumber);

        self.closeDevice();
    });
};

STM32DFU_protocol.prototype.resetDevice = function (callback) {
    chrome.usb.resetDevice(this.handle, function (result) {
        console.log('Reset Device: ' + result);

        if (callback) callback();
    });
};

STM32DFU_protocol.prototype.getString = function (index, callback) {
    const self = this;

    chrome.usb.controlTransfer(self.handle, {
        'direction':    'in',
        'recipient':    'device',
        'requestType':  'standard',
        'request':      6,
        'value':        0x300 | index,
        'index':        0,  // specifies language
        'length':       255 // max length to retreive
    }, function (result) {
        if (checkChromeRuntimeError()) {
            console.log('USB getString failed! ' + result.resultCode);
            callback("", result.resultCode);
            return;
        }
        var view = new DataView(result.data);
        var length = view.getUint8(0);
        var descriptor = "";
        for (var i = 2; i < length; i += 2) {
            var charCode = view.getUint16(i, true);
            descriptor += String.fromCharCode(charCode);
        }
        callback(descriptor, result.resultCode);
    });
};

STM32DFU_protocol.prototype.getInterfaceDescriptors = function (interfaceNum, callback) {
    const self = this;

    chrome.usb.getConfiguration( this.handle, function (config) {
        if (checkChromeRuntimeError()) {
            console.log('USB getConfiguration failed!');
            callback([], -200);
            return;
        }

    var interfaceID = 0;
    var descriptorStringArray = [];
    var getDescriptorString = function () {
        if(interfaceID < config.interfaces.length) {
            self.getInterfaceDescriptor(interfaceID, function (descriptor, resultCode) {
                if (resultCode) {
                    callback([], resultCode);
                    return;
                }
                interfaceID++;
                self.getString(descriptor.iInterface, function (descriptorString, resultCode) {
                    if (resultCode) {
                        callback([], resultCode);
                        return;
                    }
                    if (descriptor.bInterfaceNumber == interfaceNum) {
                        descriptorStringArray.push(descriptorString);
                    }
                    getDescriptorString();
                });
            });
        } else {
            //console.log(descriptorStringArray);
            callback(descriptorStringArray, 0);
            return;
        }
    };
    getDescriptorString();
    });
};


STM32DFU_protocol.prototype.getInterfaceDescriptor = function (_interface, callback) {
    const self = this;
    chrome.usb.controlTransfer(this.handle, {
        'direction':    'in',
        'recipient':    'device',
        'requestType':  'standard',
        'request':      6,
        'value':        0x200,
        'index':        0,
        'length':       18 + _interface * 9
    }, function (result) {
        if (checkChromeRuntimeError()) {
            console.log('USB getInterfaceDescriptor failed! ' + result.resultCode);
            callback({}, result.resultCode);
            return;
        }

        var buf = new Uint8Array(result.data, 9 + _interface * 9);
        var descriptor = {
            'bLength':            buf[0],
            'bDescriptorType':    buf[1],
            'bInterfaceNumber':   buf[2],
            'bAlternateSetting':  buf[3],
            'bNumEndpoints':      buf[4],
            'bInterfaceClass':    buf[5],
            'bInterfaceSubclass': buf[6],
            'bInterfaceProtocol': buf[7],
            'iInterface':         buf[8]
        };

        callback(descriptor, result.resultCode);
    });
};

STM32DFU_protocol.prototype.getFunctionalDescriptor = function (_interface, callback) {
    const self = this;
    chrome.usb.controlTransfer(this.handle, {
        'direction':    'in',
        'recipient':    'interface',
        'requestType':  'standard',
        'request':      6,
        'value':        0x2100,
        'index':        0,
        'length':       255
    }, function (result) {
        if (checkChromeRuntimeError()) {
            console.log('USB getFunctionalDescriptor failed! ' + result.resultCode);
            callback({}, result.resultCode);
            return;
        }

        var buf = new Uint8Array(result.data);

        var descriptor = {
            'bLength':            buf[0],
            'bDescriptorType':    buf[1],
            'bmAttributes':       buf[2],
            'wDetachTimeOut':     (buf[4] << 8)|buf[3],
            'wTransferSize':      (buf[6] << 8)|buf[5],
            'bcdDFUVersion':      buf[7]
        };

        callback(descriptor, result.resultCode);
    });
};

STM32DFU_protocol.prototype.getChipInfo = function (_interface, callback) {
    const self = this;

    self.getInterfaceDescriptors(0, function (descriptors, resultCode) {
        if (resultCode) {
            callback({}, resultCode);
            return;
        }

        // Keep this for new MCU debugging
        // console.log('Descriptors: ' + descriptors);

        var parseDescriptor = function(str) {
            // F303: "@Internal Flash  /0x08000000/128*0002Kg"
            // F40x: "@Internal Flash  /0x08000000/04*016Kg,01*064Kg,07*128Kg"
            // F72x: "@Internal Flash  /0x08000000/04*016Kg,01*64Kg,03*128Kg"
            // F74x: "@Internal Flash  /0x08000000/04*032Kg,01*128Kg,03*256Kg"

            // H750 SPRacing H7 EXST: "@External Flash /0x90000000/998*128Kg,1*128Kg,4*128Kg,21*128Ka"
            // H750 SPRacing H7 EXST: "@External Flash /0x90000000/1001*128Kg,3*128Kg,20*128Ka" - Early BL firmware with incorrect string, treat as above.

            // H750 Partitions: Flash, Config, Firmware, 1x BB Management block + x BB Replacement blocks)
            if (str == "@External Flash /0x90000000/1001*128Kg,3*128Kg,20*128Ka") {
                str = "@External Flash /0x90000000/998*128Kg,1*128Kg,4*128Kg,21*128Ka";
            }

            // split main into [location, start_addr, sectors]

            var tmp0 = str.replace(/[^\x20-\x7E]+/g, "");
            var tmp1 = tmp0.split('/');

            // G474 (and may be other G4 variants) returns
            // "@Option Bytes   /0x1FFF7800/01*048 e/0x1FFFF800/01*048 e"
            // for two banks of options bytes which may be fine in terms of descriptor syntax,
            // but as this splits into an array of size 5 instead of 3, it induces an length error.
            // Here, we blindly trim the array length to 3. While doing so may fail to
            // capture errornous patterns, but it is good to avoid this known and immediate
            // error.
            // May need to preserve the second bank if the configurator starts to really
            // support option bytes.

            if (tmp1.length > 3) {
                console.log('parseDescriptor: shrinking long descriptor "' + str + '"');
                tmp1.length = 3;
            }
            if (!tmp1[0].startsWith("@")) {
                return null;
            }
            var type = tmp1[0].trim().replace('@', '');
            var start_address = parseInt(tmp1[1]);

            // split sectors into array
            var sectors = [];
            var total_size = 0;
            var tmp2 = tmp1[2].split(',');
            if (tmp2.length < 1) {
                return null;
            }
            for (var i = 0; i < tmp2.length; i++) {
                // split into [num_pages, page_size]
                var tmp3 = tmp2[i].split('*');
                if (tmp3.length != 2) {
                    return null;
                }
                var num_pages = parseInt(tmp3[0]);
                var page_size = parseInt(tmp3[1]);
                if (!page_size) {
                    return null;
                }
                var unit = tmp3[1].slice(-2, -1);
                switch (unit) {
                    case 'M':
                        page_size *= 1024; //  fall through to K as well
                    case 'K':
                        page_size *= 1024;
                        break;
                }

                sectors.push({
                    'num_pages'    : num_pages,
                    'start_address': start_address + total_size,
                    'page_size'    : page_size,
                    'total_size'   : num_pages * page_size
                });

                total_size += num_pages * page_size;
            }

            var memory = {
                'type'         : type,
                'start_address': start_address,
                'sectors'      : sectors,
                'total_size'   : total_size
            };
        return memory;
    };
    var chipInfo = descriptors.map(parseDescriptor).reduce(function(o, v, i) {
        o[v.type.toLowerCase().replace(' ', '_')] = v;
        return o;
    }, {});
        callback(chipInfo, resultCode);
    });
};

STM32DFU_protocol.prototype.controlTransfer = function (direction, request, value, _interface, length, data, callback, _timeout) {
    const self = this;

    // timeout support was added in chrome v43
    var timeout;
    if (typeof _timeout === "undefined") {
        timeout = 0; // default is 0 (according to chrome.usb API)
    } else {
        timeout = _timeout;
    }

    if (direction == 'in') {
        // data is ignored
        chrome.usb.controlTransfer(this.handle, {
            'direction':    'in',
            'recipient':    'interface',
            'requestType':  'class',
            'request':      request,
            'value':        value,
            'index':        _interface,
            'length':       length,
            'timeout':      timeout
        }, function (result) {
            if (checkChromeRuntimeError()) {
                console.log('USB controlTransfer IN failed for request ' + request + '!');
            }
            if (result.resultCode) console.log('USB transfer result code: ' + result.resultCode);

            var buf = new Uint8Array(result.data);
            callback(buf, result.resultCode);
        });
    } else {
        // length is ignored
        if (data) {
            var arrayBuf = new ArrayBuffer(data.length);
            var arrayBufView = new Uint8Array(arrayBuf);
            arrayBufView.set(data);
        } else {
            var arrayBuf = new ArrayBuffer(0);
        }

        chrome.usb.controlTransfer(this.handle, {
            'direction':    'out',
            'recipient':    'interface',
            'requestType':  'class',
            'request':      request,
            'value':        value,
            'index':        _interface,
            'data':         arrayBuf,
            'timeout':      timeout
        }, function (result) {
            if (checkChromeRuntimeError()) {
                console.log('USB controlTransfer OUT failed for request ' + request + '!');
            }
            if (result.resultCode) console.log('USB transfer result code: ' + result.resultCode);

            callback(result);
        });
    }
};

// routine calling DFU_CLRSTATUS until device is in dfuIDLE state
STM32DFU_protocol.prototype.clearStatus = function (callback) {
    const self = this;

    function check_status() {
        self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
            if (data[4] == self.state.dfuIDLE) {
                callback(data);
            } else {
                var delay = data[1] | (data[2] << 8) | (data[3] << 16);

                setTimeout(clear_status, delay);
            }
        });
    }

    function clear_status() {
        self.controlTransfer('out', self.request.CLRSTATUS, 0, 0, 0, 0, check_status);
    }

    check_status();
};

STM32DFU_protocol.prototype.loadAddress = function (address, callback, abort) {
    const self = this;

    self.controlTransfer('out', self.request.DNLOAD, 0, 0, 0, [0x21, address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff, (address >> 24) & 0xff], function () {
        self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
            if (data[4] == self.state.dfuDNBUSY) {
                var delay = data[1] | (data[2] << 8) | (data[3] << 16);

                setTimeout(function () {
                    self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                        if (data[4] == self.state.dfuDNLOAD_IDLE) {
                            callback(data);
                        } else {
                            console.log('Failed to execute address load');
                            if(typeof abort === "undefined" || abort) {
                                self.cleanup();
                            } else {
                                callback(data);
                            }
                        }
                    });
                }, delay);
            } else {
                console.log('Failed to request address load');
                self.cleanup();
            }
        });
    });
};

// first_array = usually hex_to_flash array
// second_array = usually verify_hex array
// result = true/false
STM32DFU_protocol.prototype.verify_flash = function (first_array, second_array) {
    for (var i = 0; i < first_array.length; i++) {
        if (first_array[i] != second_array[i]) {
            console.log('Verification failed on byte: ' + i + ' expected: 0x' + first_array[i].toString(16) + ' received: 0x' + second_array[i].toString(16));
            return false;
        }
    }

    console.log('Verification successful, matching: ' + first_array.length + ' bytes');

    return true;
};

STM32DFU_protocol.prototype.isBlockUsable = function(startAddress, length) {
    const self = this;

    let result = false;

    let searchAddress = startAddress;
    let remainingLength = length;

    let restart;
    do {
        restart = false;

        for (const sector of self.flash_layout.sectors) {
            const sectorStart = sector.start_address;
            const sectorLength = sector.num_pages * sector.page_size;
            const sectorEnd = sectorStart + sectorLength - 1; // - 1 for inclusive

            const addressInSector = (searchAddress >= sectorStart) && (searchAddress <= sectorEnd);

            if (addressInSector) {
                const endAddress = searchAddress + remainingLength - 1; // - 1 for inclusive

                const endAddressInSector = (endAddress <= sectorEnd);
                if (endAddressInSector) {
                    result = true;
                    restart = false;
                    break;
                }

                // some of the block is in this sector, search for the another sector that contains the next part of the block
                searchAddress = sectorEnd + 1;
                remainingLength -= sectorLength;
                restart = true;
                break;
            }
        }
    } while (restart);

    return result;
};

STM32DFU_protocol.prototype.upload_procedure = function (step) {
    const self = this;

    switch (step) {
        case 0:
            self.getChipInfo(0, function (chipInfo, resultCode) {
                if (resultCode != 0 || typeof chipInfo === "undefined") {
                    console.log('Failed to detect chip info, resultCode: ' + resultCode);
                    self.cleanup();
                } else {
                    let nextAction;

                    if (typeof chipInfo.internal_flash !== "undefined") {
                        // internal flash
                        nextAction = 1;

                        self.chipInfo = chipInfo;
                        self.flash_layout = chipInfo.internal_flash;

                    } else if (typeof chipInfo.external_flash !== "undefined") {
                        // external flash
                        nextAction = 2; // no option bytes

                        self.chipInfo = chipInfo;
                        self.flash_layout = chipInfo.external_flash;
                    } else {
                        console.log('Failed to detect internal or external flash');
                        self.cleanup();
                    }

                    if (typeof nextAction !== "undefined") {
                        GUI.log(i18n.getMessage('dfu_device_flash_info', (self.flash_layout.total_size / 1024).toString()));

                        // verify all addresses in the hex are writable.

                        const unusableBlocks = [];

                        for (const block of self.hex.data) {
                            const usable = self.isBlockUsable(block.address, block.bytes);
                            if (!usable) {
                                unusableBlocks.push(block);
                            }
                        }

                        if (unusableBlocks.length > 0) {
                            GUI.log(i18n.getMessage('dfu_hex_address_errors'));
                            self.cleanup();
                        } else {
                            self.getFunctionalDescriptor(0, function (descriptor, resultCode) {
                                self.transferSize = resultCode ? 2048 : descriptor.wTransferSize;
                                console.log('Using transfer size: ' + self.transferSize);
                                self.clearStatus(function () {
                                    self.upload_procedure(nextAction);
                                });
                            });
                        }
                    }
                }
            });
            break;
        case 1:
            if (typeof self.chipInfo.option_bytes === "undefined") {
                console.log('Failed to detect option bytes');
                self.cleanup();
            }

            var unprotect = function() {
                console.log('Initiate read unprotect');
                let messageReadProtected = i18n.getMessage('stm32ReadProtected');
                GUI.log(messageReadProtected);
                TABS.firmware_flasher.flashingMessage(messageReadProtected, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.ACTION);

                self.controlTransfer('out', self.request.DNLOAD, 0, 0, 0, [0x92], function () { // 0x92 initiates read unprotect
                    self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                        if (data[4] == self.state.dfuDNBUSY) { // completely normal
                            var delay = data[1] | (data[2] << 8) | (data[3] << 16);
                            var total_delay = delay + 20000; // wait at least 20 seconds to make sure the user does not disconnect the board while erasing the memory
                            var timeSpentWaiting = 0;
                            var incr = 1000; // one sec increments
                            var waitForErase = setInterval(function () {

                                TABS.firmware_flasher.flashProgress(Math.min(timeSpentWaiting / total_delay, 1) * 100);

                                if(timeSpentWaiting < total_delay) {
                                    timeSpentWaiting += incr;
                                    return;
                                }
                                clearInterval(waitForErase);
                                self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data, error) { // should stall/disconnect
                                    if(error) { // we encounter an error, but this is expected. should be a stall.
                                        console.log('Unprotect memory command ran successfully. Unplug flight controller. Connect again in DFU mode and try flashing again.');
                                        GUI.log(i18n.getMessage('stm32UnprotectSuccessful'));

                                        let messageUnprotectUnplug = i18n.getMessage('stm32UnprotectUnplug');
                                        GUI.log(messageUnprotectUnplug);

                                        TABS.firmware_flasher.flashingMessage(messageUnprotectUnplug, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.ACTION)
                                                             .flashProgress(0);

                                    } else { // unprotecting the flight controller did not work. It did not reboot.
                                        console.log('Failed to execute unprotect memory command');

                                        GUI.log(i18n.getMessage('stm32UnprotectFailed'));
                                        TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32UnprotectFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                                        console.log(data);
                                        self.cleanup();
                                    }
                                }, 2000); // this should stall/disconnect anyways. so we only wait 2 sec max.
                            }, incr);
                        } else {
                                console.log('Failed to initiate unprotect memory command');
                                let messageUnprotectInitFailed = i18n.getMessage('stm32UnprotectInitFailed');
                                GUI.log(messageUnprotectInitFailed);
                                TABS.firmware_flasher.flashingMessage(messageUnprotectInitFailed, TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                                self.cleanup();
                        }
                    });
                });
            };

            var tryReadOB = function() {
                // the following should fail if read protection is active
                self.controlTransfer('in', self.request.UPLOAD, 2, 0, self.chipInfo.option_bytes.total_size, 0, function (ob_data, errcode) {
                if(errcode) {
                    console.log('USB transfer error while reading option bytes: ' + errcode1);
                    self.cleanup();
                    return;
                }
                self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                    if (data[4] == self.state.dfuUPLOAD_IDLE && ob_data.length == self.chipInfo.option_bytes.total_size) {
                        console.log('Option bytes read successfully');
                        console.log('Chip does not appear read protected');
                        GUI.log(i18n.getMessage('stm32NotReadProtected'));
                        // it is pretty safe to continue to erase flash
                        self.clearStatus(function() {
                            self.upload_procedure(2);
                        });
                        /* // this snippet is to protect the flash memory (only for the brave)
                        ob_data[1] = 0x0;
                        var writeOB = function() {
                            self.controlTransfer('out', self.request.DNLOAD, 2, 0, 0, ob_data, function () {
                                self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                                    if (data[4] == self.state.dfuDNBUSY) {
                                    var delay = data[1] | (data[2] << 8) | (data[3] << 16);

                                    setTimeout(function () {
                                        self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                                        if (data[4] == self.state.dfuDNLOAD_IDLE) {
                                            console.log('Failed to write ob');
                                            self.cleanup();
                                        } else {
                                            console.log('Success writing ob');
                                            self.cleanup();
                                        }
                                        });
                                    }, delay);
                                    } else {
                                    console.log('Failed to initiate write ob');
                                    self.cleanup();
                                    }
                                });
                            });
                        }
                        self.clearStatus(function () {
                            self.loadAddress(self.chipInfo.option_bytes.start_address, function () {
                                self.clearStatus(writeOB);
                            });
                        }); // */
                    } else {
                        console.log('Option bytes could not be read. Quite possibly read protected.');
                        self.clearStatus(unprotect);
                    }
                    });
                    });
            };

            var initReadOB = function (loadAddressResponse) {
                // contrary to what is in the docs. Address load should in theory work even if read protection is active
                // if address load fails with this specific error though, it is very likely bc of read protection
                if(loadAddressResponse[4] == self.state.dfuERROR && loadAddressResponse[0] == self.status.errVENDOR) {
                    // read protected
                    GUI.log(i18n.getMessage('stm32AddressLoadFailed'));
                    self.clearStatus(unprotect);
                    return;
                } else if(loadAddressResponse[4] == self.state.dfuDNLOAD_IDLE) {
                    console.log('Address load for option bytes sector succeeded.');
                    self.clearStatus(tryReadOB);
                } else {
                    GUI.log(i18n.getMessage('stm32AddressLoadUnknown'));
                    self.cleanup();
                }
            };

            self.clearStatus(function () {
            // load address fails if read protection is active unlike as stated in the docs
            self.loadAddress(self.chipInfo.option_bytes.start_address, initReadOB, false);
            });
            break;
        case 2:
            // erase
                // find out which pages to erase
                var erase_pages = [];
                for (var i = 0; i < self.flash_layout.sectors.length; i++) {
                    for (var j = 0; j < self.flash_layout.sectors[i].num_pages; j++) {
                        if (self.options.erase_chip) {
                            // full chip erase
                            erase_pages.push({'sector': i, 'page': j});
                        } else {
                            // local erase
                        var page_start = self.flash_layout.sectors[i].start_address + j * self.flash_layout.sectors[i].page_size;
                        var page_end = page_start + self.flash_layout.sectors[i].page_size - 1;
                        for (var k = 0; k < self.hex.data.length; k++) {
                            var starts_in_page = self.hex.data[k].address >= page_start && self.hex.data[k].address <= page_end;
                            var end_address = self.hex.data[k].address + self.hex.data[k].bytes - 1;
                            var ends_in_page = end_address >= page_start && end_address <= page_end;
                            var spans_page = self.hex.data[k].address < page_start && end_address > page_end;
                            if (starts_in_page || ends_in_page || spans_page) {
                                var idx = erase_pages.findIndex(function (element, index, array) {
                                    return element.sector == i && element.page == j;
                                });
                                if (idx == -1)
                                    erase_pages.push({'sector': i, 'page': j});
                            }
                        }
                    }
                  }
                }

                if (erase_pages.length === 0) {
                    console.log('Aborting, No flash pages to erase');
                    TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32InvalidHex'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);
                    self.cleanup();
                    break;
                }


                TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Erase'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);
                console.log('Executing local chip erase', erase_pages);

                var page = 0;
                var total_erased = 0; // bytes

                var erase_page_next = function() {
                    TABS.firmware_flasher.flashProgress((page + 1) / erase_pages.length * 100);
                    page++;

                    if(page == erase_pages.length) {
                        console.log("Erase: complete");
                        GUI.log(i18n.getMessage('dfu_erased_kilobytes', (total_erased / 1024).toString()));
                        self.upload_procedure(4);
                    } else {
                        erase_page();
                    }
                };

                var erase_page = function() {
                    var page_addr = erase_pages[page].page * self.flash_layout.sectors[erase_pages[page].sector].page_size +
                            self.flash_layout.sectors[erase_pages[page].sector].start_address;
                    var cmd = [0x41, page_addr & 0xff, (page_addr >> 8) & 0xff, (page_addr >> 16) & 0xff, (page_addr >> 24) & 0xff];
                    total_erased += self.flash_layout.sectors[erase_pages[page].sector].page_size;
                    console.log('Erasing. sector ' + erase_pages[page].sector +
                                ', page ' + erase_pages[page].page + ' @ 0x' + page_addr.toString(16));

                    self.controlTransfer('out', self.request.DNLOAD, 0, 0, 0, cmd, function () {
                        self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                            if (data[4] == self.state.dfuDNBUSY) { // completely normal
                                var delay = data[1] | (data[2] << 8) | (data[3] << 16);

                                setTimeout(function () {
                                    self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {

                                        if (data[4] == self.state.dfuDNBUSY) {

                                            //
                                            // H743 Rev.V (probably other H7 Rev.Vs also) remains in dfuDNBUSY state after the specified delay time.
                                            // STM32CubeProgrammer deals with behavior with an undocumented procedure as follows.
                                            //     1. Issue DFU_CLRSTATUS, which ends up with (14,10) = (errUNKNOWN, dfuERROR)
                                            //     2. Issue another DFU_CLRSTATUS which delivers (0,2) = (OK, dfuIDLE)
                                            //     3. Treat the current erase successfully finished.
                                            // Here, we call clarStatus to get to the dfuIDLE state.
                                            //

                                            console.log('erase_page: dfuDNBUSY after timeout, clearing');

                                            self.clearStatus(function() {
                                                self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                                                    if (data[4] == self.state.dfuIDLE) {
                                                        erase_page_next();
                                                    } else {
                                                        console.log('Failed to erase page 0x' + page_addr.toString(16) + ' (did not reach dfuIDLE after clearing');
                                                        self.cleanup();
                                                    }
                                                });
                                            });
                                        } else if (data[4] == self.state.dfuDNLOAD_IDLE) {
                                            erase_page_next();
                                        } else {
                                            console.log('Failed to erase page 0x' + page_addr.toString(16));
                                            self.cleanup();
                                        }
                                    });
                                }, delay);
                            } else {
                                console.log('Failed to initiate page erase, page 0x' + page_addr.toString(16));
                                self.cleanup();
                            }
                        });
                    });
                };

                // start
                erase_page();
            break;

        case 4:
            // upload
            // we dont need to clear the state as we are already using DFU_DNLOAD
            console.log('Writing data ...');
            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Flashing'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

            var blocks = self.hex.data.length - 1;
            var flashing_block = 0;
            var address = self.hex.data[flashing_block].address;

            var bytes_flashed = 0;
            var bytes_flashed_total = 0; // used for progress bar
            var wBlockNum = 2; // required by DFU

            var write = function () {
                if (bytes_flashed < self.hex.data[flashing_block].bytes) {
                    var bytes_to_write = ((bytes_flashed + self.transferSize) <= self.hex.data[flashing_block].bytes) ? self.transferSize : (self.hex.data[flashing_block].bytes - bytes_flashed);

                    var data_to_flash = self.hex.data[flashing_block].data.slice(bytes_flashed, bytes_flashed + bytes_to_write);

                    address += bytes_to_write;
                    bytes_flashed += bytes_to_write;
                    bytes_flashed_total += bytes_to_write;

                    self.controlTransfer('out', self.request.DNLOAD, wBlockNum++, 0, 0, data_to_flash, function () {
                        self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                            if (data[4] == self.state.dfuDNBUSY) {
                                var delay = data[1] | (data[2] << 8) | (data[3] << 16);

                                setTimeout(function () {
                                    self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                                        if (data[4] == self.state.dfuDNLOAD_IDLE) {
                                            // update progress bar
                                            TABS.firmware_flasher.flashProgress(bytes_flashed_total / (self.hex.bytes_total * 2) * 100);

                                            // flash another page
                                            write();
                                        } else {
                                            console.log('Failed to write ' + bytes_to_write + 'bytes to 0x' + address.toString(16));
                                            self.cleanup();
                                        }
                                    });
                                }, delay);
                            } else {
                                console.log('Failed to initiate write ' + bytes_to_write + 'bytes to 0x' + address.toString(16));
                                self.cleanup();
                            }
                        });
                    });
                } else {
                    if (flashing_block < blocks) {
                        // move to another block
                        flashing_block++;

                        address = self.hex.data[flashing_block].address;
                        bytes_flashed = 0;
                        wBlockNum = 2;

                        self.loadAddress(address, write);
                    } else {
                        // all blocks flashed
                        console.log('Writing: done');

                        // proceed to next step
                        self.upload_procedure(5);
                    }
                }
            };

            // start
            self.loadAddress(address, write);

            break;
        case 5:
            // verify
            console.log('Verifying data ...');
            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32Verifying'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.NEUTRAL);

            var blocks = self.hex.data.length - 1;
            var reading_block = 0;
            var address = self.hex.data[reading_block].address;

            var bytes_verified = 0;
            var bytes_verified_total = 0; // used for progress bar
            var wBlockNum = 2; // required by DFU

            // initialize arrays
            for (var i = 0; i <= blocks; i++) {
                self.verify_hex.push([]);
            }

            // start
            self.clearStatus(function () {
                self.loadAddress(address, function () {
                    self.clearStatus(read);
                });
            });

            var read = function () {
                if (bytes_verified < self.hex.data[reading_block].bytes) {
                    var bytes_to_read = ((bytes_verified + self.transferSize) <= self.hex.data[reading_block].bytes) ? self.transferSize : (self.hex.data[reading_block].bytes - bytes_verified);

                    self.controlTransfer('in', self.request.UPLOAD, wBlockNum++, 0, bytes_to_read, 0, function (data, code) {
                        for (var i = 0; i < data.length; i++) {
                            self.verify_hex[reading_block].push(data[i]);
                        }

                        address += bytes_to_read;
                        bytes_verified += bytes_to_read;
                        bytes_verified_total += bytes_to_read;

                        // update progress bar
                        TABS.firmware_flasher.flashProgress((self.hex.bytes_total + bytes_verified_total) / (self.hex.bytes_total * 2) * 100);

                        // verify another page
                        read();
                    });
                } else {
                    if (reading_block < blocks) {
                        // move to another block
                        reading_block++;

                        address = self.hex.data[reading_block].address;
                        bytes_verified = 0;
                        wBlockNum = 2;

                        self.clearStatus(function () {
                            self.loadAddress(address, function () {
                                self.clearStatus(read);
                            });
                        });
                    } else {
                        // all blocks read, verify

                        var verify = true;
                        for (var i = 0; i <= blocks; i++) {
                            verify = self.verify_flash(self.hex.data[i].data, self.verify_hex[i]);

                            if (!verify) break;
                        }

                        if (verify) {
                            console.log('Programming: SUCCESSFUL');
                            // update progress bar
                            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ProgrammingSuccessful'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.VALID);

                            // proceed to next step
                            self.leave();
                        } else {
                            console.log('Programming: FAILED');
                            // update progress bar
                            TABS.firmware_flasher.flashingMessage(i18n.getMessage('stm32ProgrammingFailed'), TABS.firmware_flasher.FLASH_MESSAGE_TYPES.INVALID);

                            // disconnect
                            self.cleanup();
                        }
                    }
                }
            };
            break;
    }
};

STM32DFU_protocol.prototype.leave = function () {
    // leave DFU

    const self = this;

    let address;
    if (self.hex) {
        address = self.hex.data[0].address;
    } else {
        // Assuming we're running off internal flash
        address =  0x08000000;
    }

    self.clearStatus(function () {
        self.loadAddress(address, function () {
            // 'downloading' 0 bytes to the program start address followed by a GETSTATUS is used to trigger DFU exit on STM32
            self.controlTransfer('out', self.request.DNLOAD, 0, 0, 0, 0, function () {
                self.controlTransfer('in', self.request.GETSTATUS, 0, 0, 6, 0, function (data) {
                    self.cleanup();
                });
            });
        });
    });
};

STM32DFU_protocol.prototype.cleanup = function () {
    const self = this;

    self.releaseInterface(0);

    GUI.connect_lock = false;

    var timeSpent = new Date().getTime() - self.upload_time_start;

    console.log('Script finished after: ' + (timeSpent / 1000) + ' seconds');

    if (self.callback) {
        self.callback();
    }
};

// initialize object
var STM32DFU = new STM32DFU_protocol();
