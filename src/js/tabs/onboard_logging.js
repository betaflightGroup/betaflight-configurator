import { i18n } from "../localization";

let sdcardTimer;

const onboard_logging = {
    blockSize: 128,
    writeError: false,

    BLOCK_SIZE: 4096,
    VCP_BLOCK_SIZE_3_0: 512,
    VCP_BLOCK_SIZE: 4096
};

onboard_logging.initialize = function (callback) {
    const self = this;
    let saveCancelled, eraseCancelled;

    if (GUI.active_tab !== 'onboard_logging') {
        GUI.active_tab = 'onboard_logging';
    }

    if (CONFIGURATOR.connectionValid) {

        MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, function() {
            MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, function() {
                MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, function() {
                    MSP.send_message(MSPCodes.MSP_BLACKBOX_CONFIG, false, false, function() {
                        MSP.send_message(MSPCodes.MSP_ADVANCED_CONFIG, false, false, function() {
                            MSP.send_message(MSPCodes.MSP_NAME, false, false, load_html);
                        });
                    });
                });
            });
        });
    }

    function gcd(a, b) {
        if (b === 0)
            return a;

        return gcd(b, a % b);
    }

    function save_to_eeprom() {
        MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
    }

    function reboot() {
        GUI.log(i18n.getMessage('configurationEepromSaved'));

        GUI.tab_switch_cleanup(function() {
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
            reinitialiseConnection(self);
        });
    }

    function load_html() {
        $('#content').load("./tabs/onboard_logging.html", function() {
            // translate to user-selected language
            i18n.localizePage();

            const dataflashPresent = FC.DATAFLASH.totalSize > 0;
            let blackboxSupport;

            /*
             * Pre-1.11.0 firmware supported DATAFLASH API (on targets with SPI flash) but not the BLACKBOX config API.
             *
             * The best we can do on those targets is check the BLACKBOX feature bit to identify support for Blackbox instead.
             */
            if ((FC.BLACKBOX.supported || FC.DATAFLASH.supported) && (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_33) || FC.FEATURE_CONFIG.features.isEnabled('BLACKBOX'))) {
                blackboxSupport = 'yes';
            } else {
                blackboxSupport = 'no';
            }

            $(".tab-onboard_logging")
                .addClass("serial-supported")
                .toggleClass("dataflash-supported", FC.DATAFLASH.supported)
                .toggleClass("dataflash-present", dataflashPresent)
                .toggleClass("sdcard-supported", FC.SDCARD.supported)
                .toggleClass("blackbox-config-supported", FC.BLACKBOX.supported)

                .toggleClass("blackbox-supported", blackboxSupport === 'yes')
                .toggleClass("blackbox-maybe-supported", blackboxSupport === 'maybe')
                .toggleClass("blackbox-unsupported", blackboxSupport === 'no');

            if (dataflashPresent) {
                // UI hooks
                $('.tab-onboard_logging a.erase-flash').click(ask_to_erase_flash);

                $('.tab-onboard_logging a.erase-flash-confirm').click(flash_erase);
                $('.tab-onboard_logging a.erase-flash-cancel').click(flash_erase_cancel);

                $('.tab-onboard_logging a.save-flash').click(flash_save_begin);
                $('.tab-onboard_logging a.save-flash-cancel').click(flash_save_cancel);
                $('.tab-onboard_logging a.save-flash-dismiss').click(dismiss_saving_dialog);
            }

            const deviceSelect = $(".blackboxDevice select");
            const loggingRatesSelect = $(".blackboxRate select");
            const debugModeSelect = $(".blackboxDebugMode select");

            if (FC.BLACKBOX.supported) {
                $(".tab-onboard_logging a.save-settings").click(function() {
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                        FC.BLACKBOX.blackboxSampleRate = parseInt(loggingRatesSelect.val(), 10);
                    } else if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                        FC.BLACKBOX.blackboxPDenom = parseInt(loggingRatesSelect.val(), 10);
                    } else {
                        const rate = loggingRatesSelect.val().split('/');
                        FC.BLACKBOX.blackboxRateNum = parseInt(rate[0], 10);
                        FC.BLACKBOX.blackboxRateDenom = parseInt(rate[1], 10);
                    }
                    FC.BLACKBOX.blackboxDevice = parseInt(deviceSelect.val(), 10);
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                        FC.PID_ADVANCED_CONFIG.debugMode = parseInt(debugModeSelect.val());
                        MSP.send_message(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG), false, save_to_eeprom);
                    }
                    MSP.send_message(MSPCodes.MSP_SET_BLACKBOX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BLACKBOX_CONFIG), false, save_to_eeprom);
                });
            }

            populateLoggingRates(loggingRatesSelect);
            populateDevices(deviceSelect);
            populateDebugModes(debugModeSelect);

            deviceSelect.change(function() {
                if ($(this).val() === "0") {
                    $("div.blackboxRate").hide();
                } else {
                    $("div.blackboxRate").show();
                }
            }).change();

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
                if ((FC.SDCARD.supported && deviceSelect.val() == 2) || (FC.DATAFLASH.supported && deviceSelect.val() == 1)) {

                    $(".tab-onboard_logging")
                        .toggleClass("msc-supported", true);

                    $('a.onboardLoggingRebootMsc').click(function () {
                         analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'RebootMsc');

                        const buffer = [];
                        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                            if (GUI.operating_system === "Linux") {
                                // Reboot into MSC using UTC time offset instead of user timezone
                                // Linux seems to expect that the FAT file system timestamps are UTC based
                                buffer.push(mspHelper.REBOOT_TYPES.MSC_UTC);
                            } else {
                                buffer.push(mspHelper.REBOOT_TYPES.MSC);
                            }
                        } else {
                            buffer.push(mspHelper.REBOOT_TYPES.MSC);
                        }
                        MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
                    });
                }
            }

            update_html();

            GUI.content_ready(callback);
        });
    }

    function populateDevices(deviceSelect) {
        deviceSelect.empty();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_33)) {
            deviceSelect.append('<option value="0">' + i18n.getMessage('blackboxLoggingNone') + '</option>');
            if (FC.DATAFLASH.supported) {
                deviceSelect.append('<option value="1">' + i18n.getMessage('blackboxLoggingFlash') + '</option>');
            }
            if (FC.SDCARD.supported) {
                deviceSelect.append('<option value="2">' + i18n.getMessage('blackboxLoggingSdCard') + '</option>');
            }
            deviceSelect.append('<option value="3">' + i18n.getMessage('blackboxLoggingSerial') + '</option>');
        } else {
            deviceSelect.append('<option value="0">' + i18n.getMessage('blackboxLoggingSerial') + '</option>');
            if (FC.DATAFLASH.ready) {
                deviceSelect.append('<option value="1">' + i18n.getMessage('blackboxLoggingFlash') + '</option>');
            }
            if (FC.SDCARD.supported) {
                deviceSelect.append('<option value="2">' + i18n.getMessage('blackboxLoggingSdCard') + '</option>');
            }
        }

        deviceSelect.val(FC.BLACKBOX.blackboxDevice);
    }

    function populateLoggingRates(loggingRatesSelect) {

        // Offer a reasonable choice of logging rates (if people want weird steps they can use CLI)
        let loggingRates = [];

        let pidRate;
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            pidRate = FC.CONFIG.sampleRateHz / FC.PID_ADVANCED_CONFIG.pid_process_denom;

        } else {

            let pidRateBase = 8000;

            if (semver.gte(FC.CONFIG.apiVersion, "1.25.0") && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_41) && FC.PID_ADVANCED_CONFIG.gyroUse32kHz !== 0) {
                pidRateBase = 32000;
            }
            pidRate = pidRateBase / FC.PID_ADVANCED_CONFIG.gyro_sync_denom / FC.PID_ADVANCED_CONFIG.pid_process_denom;
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            const sampleRateNum=5;
            for (let i = 0; i < sampleRateNum; i++) {
                let loggingFrequency = Math.round(pidRate / (2**i));
                let loggingFrequencyUnit = "Hz";
                if (gcd(loggingFrequency, 1000) === 1000) {
                    loggingFrequency /= 1000;
                    loggingFrequencyUnit = "kHz";
                }
                loggingRatesSelect.append(`<option value="${i}">1/${2**i} (${loggingFrequency}${loggingFrequencyUnit})</option>`);
            }
            loggingRatesSelect.val(FC.BLACKBOX.blackboxSampleRate);
        } else if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            loggingRates = [
                {text: "Disabled", hz: 0,     p_denom: 0},
                {text: "500 Hz",   hz: 500,   p_denom: 16},
                {text: "1 kHz",    hz: 1000,  p_denom: 32},
                {text: "1.5 kHz",  hz: 1500,  p_denom: 48},
                {text: "2 kHz",    hz: 2000,  p_denom: 64},
                {text: "4 kHz",    hz: 4000,  p_denom: 128},
                {text: "8 kHz",    hz: 8000,  p_denom: 256},
                {text: "16 kHz",   hz: 16000, p_denom: 512},
                {text: "32 kHz",   hz: 32000, p_denom: 1024},
            ];

            $.each(loggingRates, function(index, item) {
                if (pidRate >= item.hz || item.hz == 0) {
                    loggingRatesSelect.append(new Option(item.text, item.p_denom));
                }
            });

            loggingRatesSelect.val(FC.BLACKBOX.blackboxPDenom);
        }
        else {
            loggingRates = [
                    {num: 1, denom: 1},
                    {num: 1, denom: 2},
                    {num: 1, denom: 3},
                    {num: 1, denom: 4},
                    {num: 1, denom: 5},
                    {num: 1, denom: 6},
                    {num: 1, denom: 7},
                    {num: 1, denom: 8},
                    {num: 1, denom: 16},
                    {num: 1, denom: 32}
                ];


            for (let i = 0; i < loggingRates.length; i++) {
                let loggingRate = Math.round(pidRate / loggingRates[i].denom);
                let loggingRateUnit = " Hz";
                if (loggingRate !== Infinity) {
                    if (gcd(loggingRate, 1000) === 1000) {
                        loggingRate /= 1000;
                        loggingRateUnit = " kHz";
                    }
                }
                loggingRatesSelect.append('<option value="' + loggingRates[i].num + '/' + loggingRates[i].denom + '">'
                    + loggingRate + loggingRateUnit + ' (' + Math.round(loggingRates[i].num / loggingRates[i].denom * 100) + '%)</option>');

            }
            loggingRatesSelect.val(FC.BLACKBOX.blackboxRateNum + '/' + FC.BLACKBOX.blackboxRateDenom);
        }
    }

    function populateDebugModes(debugModeSelect) {
        let debugModes = [];

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            $('.blackboxDebugMode').show();

            debugModes = [
                {text: "NONE"},
                {text: "CYCLETIME"},
                {text: "BATTERY"},
                {text: "GYRO_FILTERED"},
                {text: "ACCELEROMETER"},
                {text: "PIDLOOP"},
                {text: "GYRO_SCALED"},
                {text: "RC_INTERPOLATION"},
                {text: "ANGLERATE"},
                {text: "ESC_SENSOR"},
                {text: "SCHEDULER"},
                {text: "STACK"},
                {text: "ESC_SENSOR_RPM"},
                {text: "ESC_SENSOR_TMP"},
                {text: "ALTITUDE"},
                {text: "FFT"},
                {text: "FFT_TIME"},
                {text: "FFT_FREQ"},
                {text: "RX_FRSKY_SPI"},
                {text: "RX_SFHSS_SPI"},
                {text: "GYRO_RAW"},
                {text: "DUAL_GYRO_RAW"},
                {text: "DUAL_GYRO_DIFF"},
                {text: "MAX7456_SIGNAL"},
                {text: "MAX7456_SPICLOCK"},
                {text: "SBUS"},
                {text: "FPORT"},
                {text: "RANGEFINDER"},
                {text: "RANGEFINDER_QUALITY"},
                {text: "LIDAR_TF"},
                {text: "ADC_INTERNAL"},
                {text: "RUNAWAY_TAKEOFF"},
                {text: "SDIO"},
                {text: "CURRENT_SENSOR"},
                {text: "USB"},
                {text: "SMARTAUDIO"},
                {text: "RTH"},
                {text: "ITERM_RELAX"},
                {text: "ACRO_TRAINER"},
                {text: "RC_SMOOTHING"},
                {text: "RX_SIGNAL_LOSS"},
                {text: "RC_SMOOTHING_RATE"},
                {text: "ANTI_GRAVITY"},
                {text: "DYN_LPF"},
                {text: "RX_SPEKTRUM_SPI"},
                {text: "DSHOT_RPM_TELEMETRY"},
                {text: "RPM_FILTER"},
                {text: "D_MIN"},
                {text: "AC_CORRECTION"},
                {text: "AC_ERROR"},
                {text: "DUAL_GYRO_SCALED"},
                {text: "DSHOT_RPM_ERRORS"},
                {text: "CRSF_LINK_STATISTICS_UPLINK"},
                {text: "CRSF_LINK_STATISTICS_PWR"},
                {text: "CRSF_LINK_STATISTICS_DOWN"},
                {text: "BARO"},
                {text: "GPS_RESCUE_THROTTLE_PID"},
                {text: "DYN_IDLE"},
                {text: "FF_LIMIT"},
                {text: "FF_INTERPOLATED"},
                {text: "BLACKBOX_OUTPUT"},
                {text: "GYRO_SAMPLE"},
                {text: "RX_TIMING"},
                {text: "D_LPF"},
                {text: "VTX_TRAMP"},
            ];

            for (let i = 0; i < FC.PID_ADVANCED_CONFIG.debugModeCount; i++) {
                if (i < debugModes.length) {
                    debugModeSelect.append(new Option(debugModes[i].text, i));
                } else {
                    debugModeSelect.append(new Option(i18n.getMessage('onboardLoggingDebugModeUnknown'), i));
                }
            }

            debugModeSelect.val(FC.PID_ADVANCED_CONFIG.debugMode);

            // Convert to select2 and order alphabetic
            debugModeSelect.select2({
                sorter(data) {
                    return data.sort(function(a, b) {
                        if (a.text === "NONE" || b.text === i18n.getMessage('onboardLoggingDebugModeUnknown')) {
                            return -1;
                        } else if (b.text ==="NONE" || a.text === i18n.getMessage('onboardLoggingDebugModeUnknown')) {
                            return 1;
                        } else {
                            return a.text.localeCompare(b.text);
                        }
                    });
                },
            });

        } else {
            $('.blackboxDebugMode').hide();
        }
    }

    function formatFilesizeKilobytes(kilobytes) {
        if (kilobytes < 1024) {
            return Math.round(kilobytes) + "kB";
        }

        const megabytes = kilobytes / 1024;
        let gigabytes;

        if (megabytes < 900) {
            return megabytes.toFixed(1) + "MB";
        } else {
            gigabytes = megabytes / 1024;

            return gigabytes.toFixed(1) + "GB";
        }
    }

    function formatFilesizeBytes(bytes) {
        if (bytes < 1024) {
            return bytes + "B";
        }
        return formatFilesizeKilobytes(bytes / 1024);
    }

    function update_bar_width(bar, value, total, label, valuesAreKilobytes) {
        if (value > 0) {
            bar.css({
                width: (value / total * 100) + "%",
                display: 'block'
            });

            $("div", bar).text((label ? label + " " : "") + (valuesAreKilobytes ? formatFilesizeKilobytes(value) : formatFilesizeBytes(value)));
        } else {
            bar.css({
                display: 'none'
            });
        }
    }

    function update_html() {
        const dataflashPresent = FC.DATAFLASH.totalSize > 0;

        update_bar_width($(".tab-onboard_logging .dataflash-used"), FC.DATAFLASH.usedSize, FC.DATAFLASH.totalSize, i18n.getMessage('dataflashUsedSpace'), false);
        update_bar_width($(".tab-onboard_logging .dataflash-free"), FC.DATAFLASH.totalSize - FC.DATAFLASH.usedSize, FC.DATAFLASH.totalSize, i18n.getMessage('dataflashFreeSpace'), false);

        update_bar_width($(".tab-onboard_logging .sdcard-other"), FC.SDCARD.totalSizeKB - FC.SDCARD.freeSizeKB, FC.SDCARD.totalSizeKB, i18n.getMessage('dataflashUnavSpace'), true);
        update_bar_width($(".tab-onboard_logging .sdcard-free"), FC.SDCARD.freeSizeKB, FC.SDCARD.totalSizeKB, i18n.getMessage('dataflashLogsSpace'), true);

        $(".btn a.erase-flash, .btn a.save-flash").toggleClass("disabled", FC.DATAFLASH.usedSize === 0);

        $(".tab-onboard_logging")
            .toggleClass("sdcard-error", FC.SDCARD.state === MSP.SDCARD_STATE_FATAL)
            .toggleClass("sdcard-initializing", FC.SDCARD.state === MSP.SDCARD_STATE_CARD_INIT || FC.SDCARD.state === MSP.SDCARD_STATE_FS_INIT)
            .toggleClass("sdcard-ready", FC.SDCARD.state === MSP.SDCARD_STATE_READY);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
            const mscIsReady = dataflashPresent || (FC.SDCARD.state === MSP.SDCARD_STATE_READY);
            $(".tab-onboard_logging")
                .toggleClass("msc-not-ready", !mscIsReady);

            if (!mscIsReady) {
                $('a.onboardLoggingRebootMsc').addClass('disabled');
            } else {
                $('a.onboardLoggingRebootMsc').removeClass('disabled');
            }
        }

        let loggingStatus;
        switch (FC.SDCARD.state) {
            case MSP.SDCARD_STATE_NOT_PRESENT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusNoCard'));
                loggingStatus = 'SdCard: NotPresent';
            break;
            case MSP.SDCARD_STATE_FATAL:
                $(".sdcard-status").html(i18n.getMessage('sdcardStatusReboot'));
                loggingStatus = 'SdCard: Error';
            break;
            case MSP.SDCARD_STATE_READY:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusReady'));
                loggingStatus = 'SdCard: Ready';
            break;
            case MSP.SDCARD_STATE_CARD_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusStarting'));
                loggingStatus = 'SdCard: Init';
            break;
            case MSP.SDCARD_STATE_FS_INIT:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusFileSystem'));
                loggingStatus = 'SdCard: FsInit';
            break;
            default:
                $(".sdcard-status").text(i18n.getMessage('sdcardStatusUnknown',[FC.SDCARD.state]));
        }

        if (dataflashPresent && FC.SDCARD.state === MSP.SDCARD_STATE_NOT_PRESENT) {
            loggingStatus = 'Dataflash';
            analytics.setFlightControllerData(analytics.DATA.LOG_SIZE, FC.DATAFLASH.usedSize);
        }
        analytics.setFlightControllerData(analytics.DATA.LOGGING_STATUS, loggingStatus);

        if (FC.SDCARD.supported && !sdcardTimer) {
            // Poll for changes in SD card status
            sdcardTimer = setTimeout(function() {
                sdcardTimer = false;
                if (CONFIGURATOR.connectionValid) {
                    MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, function() {
                        update_html();
                    });
                }
            }, 2000);
        }
    }

    // IO related methods
    function flash_save_cancel() {
        saveCancelled = true;
    }

    function show_saving_dialog() {
        $(".dataflash-saving progress").attr("value", 0);
        saveCancelled = false;
        $(".dataflash-saving").removeClass("done");

        $(".dataflash-saving")[0].showModal();
    }

    function dismiss_saving_dialog() {
        $(".dataflash-saving")[0].close();
    }

    function mark_saving_dialog_done(startTime, totalBytes, totalBytesCompressed) {
        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'SaveDataflash');

        const totalTime = (new Date().getTime() - startTime) / 1000;
        console.log('Received ' + totalBytes + ' bytes in ' + totalTime.toFixed(2) + 's ('
            + (totalBytes / totalTime / 1024).toFixed(2) + 'kB / s) with block size ' + self.blockSize + '.');
        if (!isNaN(totalBytesCompressed)) {
            console.log('Compressed into', totalBytesCompressed, 'bytes with mean compression factor of', totalBytes / totalBytesCompressed);
        }

        $(".dataflash-saving").addClass("done");
    }

    function flash_update_summary(onDone) {
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, function() {
            update_html();

            if (onDone) {
                onDone();
            }
        });
    }

    function flash_save_begin() {
        if (GUI.connected_to) {
            if (FC.boardHasVcp()) {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
                    self.blockSize = self.VCP_BLOCK_SIZE;
                } else {
                    self.blockSize = self.VCP_BLOCK_SIZE_3_0;
                }
            } else {
                self.blockSize = self.BLOCK_SIZE;
            }

            // Begin by refreshing the occupied size in case it changed while the tab was open
            flash_update_summary(function() {
                const maxBytes = FC.DATAFLASH.usedSize;

                prepare_file(function(fileWriter) {
                    let nextAddress = 0;
                    let totalBytesCompressed = 0;

                    show_saving_dialog();

                    function onChunkRead(chunkAddress, chunkDataView, bytesCompressed) {
                        if (chunkDataView !== null) {
                            // Did we receive any data?
                            if (chunkDataView.byteLength > 0) {
                                nextAddress += chunkDataView.byteLength;
                                if (isNaN(bytesCompressed) || isNaN(totalBytesCompressed)) {
                                    totalBytesCompressed = null;
                                } else {
                                    totalBytesCompressed += bytesCompressed;
                                }

                                $(".dataflash-saving progress").attr("value", nextAddress / maxBytes * 100);

                                const blob = new Blob([chunkDataView]);

                                fileWriter.onwriteend = function(e) {
                                    if (saveCancelled || nextAddress >= maxBytes) {
                                        if (saveCancelled) {
                                            dismiss_saving_dialog();
                                        } else {
                                            mark_saving_dialog_done(startTime, nextAddress, totalBytesCompressed);
                                        }
                                    } else {
                                        if (!self.writeError) {
                                            mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                                        } else {
                                            dismiss_saving_dialog();
                                        }
                                    }
                                };

                                fileWriter.write(blob);
                            } else {
                                // A zero-byte block indicates end-of-file, so we're done
                                mark_saving_dialog_done(startTime, nextAddress, totalBytesCompressed);
                            }
                        } else {
                            // There was an error with the received block (address didn't match the one we asked for), retry
                            mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                        }
                    }

                    const startTime = new Date().getTime();
                    // Fetch the initial block
                    mspHelper.dataflashRead(nextAddress, self.blockSize, onChunkRead);
                });
            });
        }
    }

    function prepare_file(onComplete) {

        const prefix = 'BLACKBOX_LOG';
        const suffix = 'BBL';

        const filename = generateFilename(prefix, suffix);

        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename,
                accepts: [{description: suffix.toUpperCase() + ' files', extensions: [suffix]}]}, function(fileEntry) {
            if (checkChromeRuntimeError()) {
                if (chrome.runtime.lastError.message !== "User cancelled") {
                    GUI.log(i18n.getMessage('dataflashFileWriteFailed'));
                }
                return;
            }

            // echo/console log path specified
            chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
                console.log('Dataflash dump file path: ' + path);
            });

            fileEntry.createWriter(function (fileWriter) {
                fileWriter.onerror = function (e) {
                    GUI.log('<strong><span class="message-negative">' + i18n.getMessage('error', { errorMessage: e.target.error.message }) + '</span class="message-negative></strong>');

                    console.error(e);

                    // stop logging if the procedure was/is still running
                    self.writeError = true;
                };

                onComplete(fileWriter);
            }, function (e) {
                // File is not readable or does not exist!
                console.error(e);
                GUI.log(i18n.getMessage('dataflashFileWriteFailed'));
            });
        });
    }

    function ask_to_erase_flash() {
        eraseCancelled = false;
        $(".dataflash-confirm-erase").removeClass('erasing');

        $(".dataflash-confirm-erase")[0].showModal();
    }

    function poll_for_erase_completion() {
        flash_update_summary(function() {
            if (CONFIGURATOR.connectionValid && !eraseCancelled) {
                if (FC.DATAFLASH.ready) {
                    $(".dataflash-confirm-erase")[0].close();
                } else {
                    setTimeout(poll_for_erase_completion, 500);
                }
            }
        });
    }

    function flash_erase() {
        $(".dataflash-confirm-erase").addClass('erasing');

        MSP.send_message(MSPCodes.MSP_DATAFLASH_ERASE, false, false, poll_for_erase_completion);
    }

    function flash_erase_cancel() {
        eraseCancelled = true;
        $(".dataflash-confirm-erase")[0].close();
    }
};

onboard_logging.cleanup = function (callback) {
    analytics.setFlightControllerData(analytics.DATA.LOGGING_STATUS, undefined);
    analytics.setFlightControllerData(analytics.DATA.LOG_SIZE, undefined);

    if (sdcardTimer) {
        clearTimeout(sdcardTimer);
        sdcardTimer = false;
    }

    if (callback) {
        callback();
    }
};

onboard_logging.mscRebootFailedCallback = function () {
    $(".tab-onboard_logging")
        .toggleClass("msc-supported", false);

    showErrorDialog(i18n.getMessage('operationNotSupported'));
};

window.TABS.onboard_logging = onboard_logging;
export {
    onboard_logging,
};
