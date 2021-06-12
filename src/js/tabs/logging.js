import { millitime } from '../utils/common.js';

const logging = {};
logging.initialize = function (callback) {

    if (GUI.active_tab != 'logging') {
        GUI.active_tab = 'logging';
    }

    let requestedProperties = [];
    let samples = 0;
    let requests = 0;
    let logBuffer = [];

    if (CONFIGURATOR.connectionValid) {
        const getMotorData = function () {
            MSP.send_message(MSPCodes.MSP_MOTOR, false, false, loadHtml);
        };

        const loadHtml = function () {
            $('#content').load("./tabs/logging.html", process_html);
        };

        MSP.send_message(MSPCodes.MSP_RC, false, false, getMotorData);
    }

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        // UI hooks
        $('a.log_file').click(prepare_file);

        $('a.logging').click(function () {
            if (GUI.connected_to) {
                if (fileEntry != null) {
                    const clicks = $(this).data('clicks');

                    if (!clicks) {
                        // reset some variables before start
                        samples = 0;
                        requests = 0;
                        logBuffer = [];
                        requestedProperties = [];

                        $('.properties input:checked').each(function () {
                            requestedProperties.push($(this).prop('name'));
                        });

                        if (requestedProperties.length) {
                            // print header for the csv file
                            print_head();

                            const logDataPoll = function () {
                                if (requests) {
                                    // save current data (only after everything is initialized)
                                    crunch_data();
                                }

                                // request new
                                for (let i = 0; i < requestedProperties.length; i++, requests++) {
                                    MSP.send_message(MSPCodes[requestedProperties[i]]);
                                }
                            };

                            GUI.interval_add('log_data_poll', logDataPoll, parseInt($('select.speed').val()), true); // refresh rate goes here
                            GUI.interval_add('write_data', function write_data() {
                                if (logBuffer.length) { // only execute when there is actual data to write
                                    if (fileWriter.readyState == 0 || fileWriter.readyState == 2) {
                                        append_to_file(logBuffer.join('\n'));

                                        $('.samples').text(samples += logBuffer.length);

                                        logBuffer = [];
                                    } else {
                                        console.log('IO having trouble keeping up with the data flow');
                                    }
                                }
                            }, 1000);

                            $('.speed').prop('disabled', true);
                            $(this).text(i18n.getMessage('loggingStop'));
                            $(this).data("clicks", clicks !== true);
                        } else {
                            GUI.log(i18n.getMessage('loggingErrorOneProperty'));
                        }
                    } else {
                        GUI.interval_kill_all();

                        $('.speed').prop('disabled', false);
                        $(this).text(i18n.getMessage('loggingStart'));
                        $(this).data("clicks", !clicks);
                    }
                } else {
                    GUI.log(i18n.getMessage('loggingErrorLogFile'));
                }
            } else {
                GUI.log(i18n.getMessage('loggingErrorNotConnected'));
            }
        });

        ConfigStorage.get('logging_file_entry', function (result) {
            if (result.logging_file_entry) {
                chrome.fileSystem.restoreEntry(result.logging_file_entry, function (entry) {
                    if (checkChromeRuntimeError()) {
                        return;
                    }

                    fileEntry = entry;
                    prepare_writer(true);
                });
            }
        });

        GUI.content_ready(callback);
    }

    function print_head() {
        let head = "timestamp";

        for (let i = 0; i < requestedProperties.length; i++) {
            switch (requestedProperties[i]) {
                case 'MSP_RAW_IMU':
                    head += ',' + 'gyroscopeX';
                    head += ',' + 'gyroscopeY';
                    head += ',' + 'gyroscopeZ';

                    head += ',' + 'accelerometerX';
                    head += ',' + 'accelerometerY';
                    head += ',' + 'accelerometerZ';

                    head += ',' + 'magnetometerX';
                    head += ',' + 'magnetometerY';
                    head += ',' + 'magnetometerZ';
                    break;
                case 'MSP_ATTITUDE':
                    head += ',' + 'kinematicsX';
                    head += ',' + 'kinematicsY';
                    head += ',' + 'kinematicsZ';
                    break;
                case 'MSP_ALTITUDE':
                    head += ',' + 'altitude';
                    break;
                case 'MSP_RAW_GPS':
                    head += ',' + 'gpsFix';
                    head += ',' + 'gpsNumSat';
                    head += ',' + 'gpsLat';
                    head += ',' + 'gpsLon';
                    head += ',' + 'gpsAlt';
                    head += ',' + 'gpsSpeed';
                    head += ',' + 'gpsGroundCourse';
                    break;
                case 'MSP_ANALOG':
                    head += ',' + 'voltage';
                    head += ',' + 'amperage';
                    head += ',' + 'mAhdrawn';
                    head += ',' + 'rssi';
                    break;
                case 'MSP_RC':
                    for (let chan = 0; chan < FC.RC.active_channels; chan++) {
                        head += ',' + 'RC' + chan;
                    }
                    break;
                case 'MSP_MOTOR':
                    for (let motor = 0; motor < FC.MOTOR_DATA.length; motor++) {
                        head += ',' + 'Motor' + motor;
                    }
                    break;
                case 'MSP_DEBUG':
                    for (let debug = 0; debug < FC.SENSOR_DATA.debug.length; debug++) {
                        head += ',' + 'Debug' + debug;
                    }
                    break;
            }
        }

        append_to_file(head);
    }

    function crunch_data() {
        let sample = millitime();

        for (let i = 0; i < requestedProperties.length; i++) {
            switch (requestedProperties[i]) {
                case 'MSP_RAW_IMU':
                    sample += ',' + FC.SENSOR_DATA.gyroscope;
                    sample += ',' + FC.SENSOR_DATA.accelerometer;
                    sample += ',' + FC.SENSOR_DATA.magnetometer;
                    break;
                case 'MSP_ATTITUDE':
                    sample += ',' + FC.SENSOR_DATA.kinematics[0];
                    sample += ',' + FC.SENSOR_DATA.kinematics[1];
                    sample += ',' + FC.SENSOR_DATA.kinematics[2];
                    break;
                case 'MSP_ALTITUDE':
                    sample += ',' + FC.SENSOR_DATA.altitude;
                    break;
                case 'MSP_RAW_GPS':
                    sample += ',' + FC.GPS_DATA.fix;
                    sample += ',' + FC.GPS_DATA.numSat;
                    sample += ',' + (FC.GPS_DATA.lat / 10000000);
                    sample += ',' + (FC.GPS_DATA.lon / 10000000);
                    sample += ',' + FC.GPS_DATA.alt;
                    sample += ',' + FC.GPS_DATA.speed;
                    sample += ',' + FC.GPS_DATA.ground_course;
                    break;
                case 'MSP_ANALOG':
                    sample += ',' + FC.ANALOG.voltage;
                    sample += ',' + FC.ANALOG.amperage;
                    sample += ',' + FC.ANALOG.mAhdrawn;
                    sample += ',' + FC.ANALOG.rssi;
                    break;
                case 'MSP_RC':
                    for (let chan = 0; chan < FC.RC.active_channels; chan++) {
                        sample += ',' + FC.RC.channels[chan];
                    }
                    break;
                case 'MSP_MOTOR':
                    sample += ',' + FC.MOTOR_DATA;
                    break;
                case 'MSP_DEBUG':
                    sample += ',' + FC.SENSOR_DATA.debug;
                    break;
            }
        }

        logBuffer.push(sample);
    }


    // IO related methods
    let fileEntry = null;
    let fileWriter = null;

    function prepare_file() {
        const prefix = 'log';
        const suffix = 'csv';

        const filename = generateFilename(prefix, suffix);

        const accepts = [{
            description: suffix.toUpperCase() + ' files', extensions: [suffix],
        }];

        // create or load the file
        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename, accepts: accepts}, function(entry) {
            if (checkChromeRuntimeError()) {
                return;
            }

            fileEntry = entry;

            // echo/console log path specified
            chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
                console.log('Log file path: ' + path);
            });

            // change file entry from read only to read/write
            chrome.fileSystem.getWritableEntry(fileEntry, function(fileEntryWritable) {
                // check if file is writable
                chrome.fileSystem.isWritableEntry(fileEntryWritable, function(isWritable) {
                    if (isWritable) {
                        fileEntry = fileEntryWritable;

                        // save entry for next use
                        ConfigStorage.set({'logging_file_entry': chrome.fileSystem.retainEntry(fileEntry)});

                        // reset sample counter in UI
                        $('.samples').text(0);

                        prepare_writer();
                    } else {
                        console.log('File appears to be read only, sorry.');
                    }
                });
            });
        });
    }

    function prepare_writer(retaining) {
        fileEntry.createWriter(function (writer) {
            fileWriter = writer;

            fileWriter.onerror = function (e) {
                console.error(e);

                // stop logging if the procedure was/is still running
                if ($('a.logging').data('clicks')) $('a.logging').click();
            };

            fileWriter.onwriteend = function () {
                $('.size').text(bytesToSize(fileWriter.length));
            };

            if (retaining) {
                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    GUI.log(i18n.getMessage('loggingAutomaticallyRetained', [path]));
                });
            }

            // update log size in UI on fileWriter creation
            $('.size').text(bytesToSize(fileWriter.length));
        }, function (e) {
            // File is not readable or does not exist!
            console.error(e);

            if (retaining) {
                fileEntry = null;
            }
        });
    }

    function append_to_file(data) {
        if (fileWriter.position < fileWriter.length) {
            fileWriter.seek(fileWriter.length);
        }

        fileWriter.write(new Blob([data + '\n'], {type: 'text/plain'}));
    }
};

logging.cleanup = function (callback) {
    if (callback) callback();
};

// TODO: only for transition to modules, drop this eventually
window.TABS.logging = logging;

export {
    logging
};
