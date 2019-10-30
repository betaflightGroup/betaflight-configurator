'use strict';

function MspHelper () {
  var self = this;

  // 0 based index, must be identical to 'baudRates' in 'src/main/io/serial.c' in betaflight
  self.BAUD_RATES = ['AUTO', '9600', '19200', '38400', '57600', '115200',
    '230400', '250000', '400000', '460800', '500000', '921600', '1000000',
    '1500000', '2000000', '2470000'];
  // needs to be identical to 'serialPortFunction_e' in 'src/main/io/serial.h' in betaflight
  self.SERIAL_PORT_FUNCTIONS = {
    'MSP': 0,
    'GPS': 1,
    'TELEMETRY_FRSKY': 2,
    'TELEMETRY_HOTT': 3,
    'TELEMETRY_MSP': 4,
    'TELEMETRY_LTM': 4, // LTM replaced MSP
    'TELEMETRY_SMARTPORT': 5,
    'RX_SERIAL': 6,
    'BLACKBOX': 7,
    'TELEMETRY_MAVLINK': 9,
    'ESC_SENSOR': 10,
    'TBS_SMARTAUDIO': 11,
    'TELEMETRY_IBUS': 12,
    'IRC_TRAMP': 13,
    'RUNCAM_DEVICE_CONTROL': 14, // support communitate with RunCam Device
    'LIDAR_TF': 15
  };

    self.REBOOT_TYPES = {
        FIRMWARE: 0,
        BOOTLOADER: 1,
        MSC: 2,
        MSC_UTC: 3
    };

    self.RESET_TYPES = {
        BASE_DEFAULTS: 0,
        CUSTOM_DEFAULTS: 1,
    };

    self.SIGNATURE_LENGTH = 32;

    self.mspMultipleCache = [];
}

MspHelper.prototype.reorderPwmProtocols = function (protocol) {
    var result = protocol;
    if (semver.lt(CONFIG.apiVersion, "1.26.0")) {
        switch (protocol) {
            case 5:
                result = 7;

                break;
            case 7:
                result = 5;

                break;
            default:
                break;
        }
    }

    return result;
}

MspHelper.prototype.process_data = function(dataHandler) {
    var self = this;

    var data = dataHandler.dataView; // DataView (allowing us to view arrayBuffer as struct/union)
    var code = dataHandler.code;
    if (code === 0) {
        debugger;
    }
    var crcError = dataHandler.crcError;
    if (!crcError) {
        if (!dataHandler.unsupported) switch (code) {
            case MSPCodes.MSP_STATUS:
                CONFIG.cycleTime = data.readU16();
                CONFIG.i2cError = data.readU16();
                CONFIG.activeSensors = data.readU16();
                CONFIG.mode = data.readU32();
                CONFIG.profile = data.readU8();

                TABS.pid_tuning.checkUpdateProfile(false);

                sensor_status(CONFIG.activeSensors);
                $('span.i2c-error').text(CONFIG.i2cError);
                $('span.cycle-time').text(CONFIG.cycleTime);
                break;
            case MSPCodes.MSP_STATUS_EX:
                CONFIG.cycleTime = data.readU16();
                CONFIG.i2cError = data.readU16();
                CONFIG.activeSensors = data.readU16();
                CONFIG.mode = data.readU32();
                CONFIG.profile = data.readU8();
                CONFIG.cpuload = data.readU16();
                if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
                    CONFIG.numProfiles = data.readU8();
                    CONFIG.rateProfile = data.readU8();

                    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                      // Read flight mode flags
                      var byteCount = data.readU8();
                      for (var i = 0; i < byteCount; i++) {
                        data.readU8();
                      }

                      // Read arming disable flags
                      CONFIG.armingDisableCount = data.readU8(); // Flag count
                      CONFIG.armingDisableFlags = data.readU32();
                    }

                    TABS.pid_tuning.checkUpdateProfile(true);
                }

                sensor_status(CONFIG.activeSensors);
                $('span.i2c-error').text(CONFIG.i2cError);
                $('span.cycle-time').text(CONFIG.cycleTime);
                $('span.cpu-load').text(i18n.getMessage('statusbar_cpu_load', [CONFIG.cpuload]));
                break;

            case MSPCodes.MSP_RAW_IMU:
                // 512 for mpu6050, 256 for mma
                // currently we are unable to differentiate between the sensor types, so we are goign with 512
                SENSOR_DATA.accelerometer[0] = data.read16() / 512;
                SENSOR_DATA.accelerometer[1] = data.read16() / 512;
                SENSOR_DATA.accelerometer[2] = data.read16() / 512;

                // properly scaled
                SENSOR_DATA.gyroscope[0] = data.read16() * (4 / 16.4);
                SENSOR_DATA.gyroscope[1] = data.read16() * (4 / 16.4);
                SENSOR_DATA.gyroscope[2] = data.read16() * (4 / 16.4);

                // no clue about scaling factor
                SENSOR_DATA.magnetometer[0] = data.read16() / 1090;
                SENSOR_DATA.magnetometer[1] = data.read16() / 1090;
                SENSOR_DATA.magnetometer[2] = data.read16() / 1090;
                break;
            case MSPCodes.MSP_SERVO:
                var servoCount = data.byteLength / 2;
                for (var i = 0; i < servoCount; i++) {
                    SERVO_DATA[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_MOTOR:
                var motorCount = data.byteLength / 2;
                for (var i = 0; i < motorCount; i++) {
                    MOTOR_DATA[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_MOTOR_TELEMETRY:
                var telemMotorCount = data.readU8();
                for (let i = 0; i < telemMotorCount; i++) {
                    MOTOR_TELEMETRY_DATA.rpm[i] = data.readU32();   // RPM
                    MOTOR_TELEMETRY_DATA.invalidPercent[i] = data.readU16();   // 10000 = 100.00%
                    MOTOR_TELEMETRY_DATA.temperature[i] = data.readU8();       // degrees celsius
                    MOTOR_TELEMETRY_DATA.voltage[i] = data.readU16();          // 0.01V per unit
                    MOTOR_TELEMETRY_DATA.current[i] = data.readU16();          // 0.01A per unit
                    MOTOR_TELEMETRY_DATA.consumption[i] = data.readU16();      // mAh
                }
                break;
            case MSPCodes.MSP_RC:
                RC.active_channels = data.byteLength / 2;
                for (var i = 0; i < RC.active_channels; i++) {
                    RC.channels[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_RAW_GPS:
                GPS_DATA.fix = data.readU8();
                GPS_DATA.numSat = data.readU8();
                GPS_DATA.lat = data.read32();
                GPS_DATA.lon = data.read32();
                GPS_DATA.alt = data.readU16();
                GPS_DATA.speed = data.readU16();
                GPS_DATA.ground_course = data.readU16();
                break;
            case MSPCodes.MSP_COMP_GPS:
                GPS_DATA.distanceToHome = data.readU16();
                GPS_DATA.directionToHome = data.readU16();
                GPS_DATA.update = data.readU8();
                break;
            case MSPCodes.MSP_ATTITUDE:
                SENSOR_DATA.kinematics[0] = data.read16() / 10.0; // x
                SENSOR_DATA.kinematics[1] = data.read16() / 10.0; // y
                SENSOR_DATA.kinematics[2] = data.read16(); // z
                break;
            case MSPCodes.MSP_ALTITUDE:
                SENSOR_DATA.altitude = parseFloat((data.read32() / 100.0).toFixed(2)); // correct scale factor
                break;
            case MSPCodes.MSP_SONAR:
                SENSOR_DATA.sonar = data.read32();
                break;
            case MSPCodes.MSP_ANALOG:
                ANALOG.voltage = data.readU8() / 10.0;
                ANALOG.mAhdrawn = data.readU16();
                ANALOG.rssi = data.readU16(); // 0-1023
                ANALOG.amperage = data.read16() / 100; // A
                ANALOG.last_received_timestamp = Date.now();
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    ANALOG.voltage = data.readU16() / 100;
                }
                break;
            case MSPCodes.MSP_VOLTAGE_METERS:
                VOLTAGE_METERS = [];
                var voltageMeterLength = 2;
                for (var i = 0; i < (data.byteLength / voltageMeterLength); i++) {
                    var voltageMeter = {};
                    voltageMeter.id = data.readU8();
                    voltageMeter.voltage = data.readU8() / 10.0;

                    VOLTAGE_METERS.push(voltageMeter)
                }
                break;
            case MSPCodes.MSP_CURRENT_METERS:

                CURRENT_METERS = [];
                var currentMeterLength = 5;
                for (var i = 0; i < (data.byteLength / currentMeterLength); i++) {
                    var currentMeter = {};
                    currentMeter.id = data.readU8();
                    currentMeter.mAhDrawn = data.readU16(); // mAh
                    currentMeter.amperage = data.readU16() / 1000; // A

                    CURRENT_METERS.push(currentMeter);
                }
                break;
            case MSPCodes.MSP_BATTERY_STATE:
                BATTERY_STATE.cellCount = data.readU8();
                BATTERY_STATE.capacity = data.readU16(); // mAh

                BATTERY_STATE.voltage = data.readU8() / 10.0; // V
                BATTERY_STATE.mAhDrawn = data.readU16(); // mAh
                BATTERY_STATE.amperage = data.readU16() / 100; // A
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    BATTERY_STATE.batteryState = data.readU8();
                    BATTERY_STATE.voltage = data.readU16() / 100;
                }
                break;

            case MSPCodes.MSP_VOLTAGE_METER_CONFIG:
                if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
                    MISC.vbatscale = data.readU8(); // 10-200
                    MISC.vbatmincellvoltage = data.readU8() / 10; // 10-50
                    MISC.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                    MISC.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                    if (semver.gte(CONFIG.apiVersion, "1.23.0")) {
                        MISC.batterymetertype = data.readU8();
                    }
                } else {
                    VOLTAGE_METER_CONFIGS = [];
                    var voltage_meter_count = data.readU8();

                    for (var i = 0; i < voltage_meter_count; i++) {
                        var subframe_length = data.readU8();
                        if (subframe_length != 5) {
                            for (var j = 0; j < subframe_length; j++) {
                                data.readU8();
                            }
                        } else {
                            var voltageMeterConfig = {};
                            voltageMeterConfig.id = data.readU8();
                            voltageMeterConfig.sensorType = data.readU8();
                            voltageMeterConfig.vbatscale = data.readU8();
                            voltageMeterConfig.vbatresdivval = data.readU8();
                            voltageMeterConfig.vbatresdivmultiplier = data.readU8();

                            VOLTAGE_METER_CONFIGS.push(voltageMeterConfig);
                        }
                    }
                }
                break;
            case MSPCodes.MSP_CURRENT_METER_CONFIG:
                if (semver.lt(CONFIG.apiVersion, "1.36.0"))  {
                    BF_CONFIG.currentscale = data.read16();
                    BF_CONFIG.currentoffset = data.read16();
                    BF_CONFIG.currentmetertype = data.readU8();
                    BF_CONFIG.batterycapacity = data.readU16();
                } else {
                    var offset = 0;
                    CURRENT_METER_CONFIGS = [];
                    var current_meter_count = data.readU8();
                    for (var i = 0; i < current_meter_count; i++) {
                        var currentMeterConfig = {};
                        var subframe_length = data.readU8();

                        if (subframe_length != 6) {
                            for (var j = 0; j < subframe_length; j++) {
                                data.readU8();
                            }
                        } else {
                            currentMeterConfig.id = data.readU8();
                            currentMeterConfig.sensorType = data.readU8();
                            currentMeterConfig.scale = data.read16();
                            currentMeterConfig.offset = data.read16();

                            CURRENT_METER_CONFIGS.push(currentMeterConfig);
                        }
                    }
                }
                break;

            case MSPCodes.MSP_BATTERY_CONFIG:
                BATTERY_CONFIG.vbatmincellvoltage = data.readU8() / 10; // 10-50
                BATTERY_CONFIG.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                BATTERY_CONFIG.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                BATTERY_CONFIG.capacity = data.readU16();
                BATTERY_CONFIG.voltageMeterSource = data.readU8();
                BATTERY_CONFIG.currentMeterSource = data.readU8();
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    BATTERY_CONFIG.vbatmincellvoltage = data.readU16() / 100;
                    BATTERY_CONFIG.vbatmaxcellvoltage = data.readU16() / 100;
                    BATTERY_CONFIG.vbatwarningcellvoltage = data.readU16() / 100;
                }
                break;
            case MSPCodes.MSP_RC_TUNING:
                RC_tuning.RC_RATE = parseFloat((data.readU8() / 100).toFixed(2));
                RC_tuning.RC_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                if (semver.lt(CONFIG.apiVersion, "1.7.0")) {
                    RC_tuning.roll_pitch_rate = parseFloat((data.readU8() / 100).toFixed(2));
                    RC_tuning.pitch_rate = 0;
                    RC_tuning.roll_rate = 0;
                } else {
                    RC_tuning.roll_pitch_rate = 0;
                    RC_tuning.roll_rate = parseFloat((data.readU8() / 100).toFixed(2));
                    RC_tuning.pitch_rate = parseFloat((data.readU8() / 100).toFixed(2));
                }
                RC_tuning.yaw_rate = parseFloat((data.readU8() / 100).toFixed(2));
                RC_tuning.dynamic_THR_PID = parseFloat((data.readU8() / 100).toFixed(2));
                RC_tuning.throttle_MID = parseFloat((data.readU8() / 100).toFixed(2));
                RC_tuning.throttle_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                if (semver.gte(CONFIG.apiVersion, "1.7.0")) {
                    RC_tuning.dynamic_THR_breakpoint = data.readU16();
                } else {
                    RC_tuning.dynamic_THR_breakpoint = 0;
                }
                if (semver.gte(CONFIG.apiVersion, "1.10.0")) {
                    RC_tuning.RC_YAW_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                    if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
                        RC_tuning.rcYawRate = parseFloat((data.readU8() / 100).toFixed(2));
                    } else {
                        RC_tuning.rcYawRate = 0;
                    }
                } else {
                    RC_tuning.RC_YAW_EXPO = 0;
                }
                if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                    RC_tuning.rcPitchRate = parseFloat((data.readU8() / 100).toFixed(2));
                    RC_tuning.RC_PITCH_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                } else {
                    RC_tuning.rcPitchRate = 0;
                    RC_tuning.RC_PITCH_EXPO = 0;
                }
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    RC_tuning.throttleLimitType = data.readU8();
                    RC_tuning.throttleLimitPercent = data.readU8();
                }
                if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                    RC_tuning.roll_rate_limit = data.readU16();
                    RC_tuning.pitch_rate_limit = data.readU16();
                    RC_tuning.yaw_rate_limit = data.readU16();
                }
                break;
            case MSPCodes.MSP_PID:
                // PID data arrived, we need to scale it and save to appropriate bank / array
                for (var i = 0, needle = 0; i < (data.byteLength / 3); i++, needle += 3) {
                    // main for loop selecting the pid section
                    for (var j = 0; j < 3; j++) {
                        PIDs[i][j] = data.readU8();
                    }
                }
                break;

            case MSPCodes.MSP_ARMING_CONFIG:
                if (semver.gte(CONFIG.apiVersion, "1.8.0")) {
                    ARMING_CONFIG.auto_disarm_delay = data.readU8();
                    ARMING_CONFIG.disarm_kill_switch = data.readU8();
                }
                if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                    ARMING_CONFIG.small_angle = data.readU8();
                }
                break;
            case MSPCodes.MSP_LOOP_TIME:
                if (semver.gte(CONFIG.apiVersion, "1.8.0")) {
                    FC_CONFIG.loopTime = data.readU16();
                }
                break;
            case MSPCodes.MSP_MISC: // 22 bytes
                RX_CONFIG.midrc = data.readU16();
                MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
                MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
                MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
                MISC.failsafe_throttle = data.readU16(); // 1000-2000
                GPS_CONFIG.provider = data.readU8();
                MISC.gps_baudrate = data.readU8();
                GPS_CONFIG.ublox_sbas = data.readU8();
                MISC.multiwiicurrentoutput = data.readU8();
                RSSI_CONFIG.channel = data.readU8();
                MISC.placeholder2 = data.readU8();
                if (semver.lt(CONFIG.apiVersion, "1.18.0"))
                    COMPASS_CONFIG.mag_declination = data.read16() / 10; // -1800-1800
                else
                    COMPASS_CONFIG.mag_declination = data.read16() / 100; // -18000-18000
                MISC.vbatscale = data.readU8(); // was MISC.vbatscale - 10-200
                MISC.vbatmincellvoltage = data.readU8() / 10; // 10-50
                MISC.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                MISC.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                break;
            case MSPCodes.MSP_MOTOR_CONFIG:
                MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
                MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
                MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
                if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                    MOTOR_CONFIG.motor_count = data.readU8();
                    MOTOR_CONFIG.motor_poles = data.readU8();
                    MOTOR_CONFIG.use_dshot_telemetry = data.readU8() != 0;
                    MOTOR_CONFIG.use_esc_sensor = data.readU8() != 0;
                }
                break;
            case MSPCodes.MSP_COMPASS_CONFIG:
                COMPASS_CONFIG.mag_declination = data.read16() / 100; // -18000-18000
                break;
            case MSPCodes.MSP_GPS_CONFIG:
                GPS_CONFIG.provider = data.readU8();
                GPS_CONFIG.ublox_sbas = data.readU8();
                if (semver.gte(CONFIG.apiVersion, "1.34.0")) {
                    GPS_CONFIG.auto_config = data.readU8();
                    GPS_CONFIG.auto_baud = data.readU8();
                }
                break;
            case MSPCodes.MSP_GPS_RESCUE:
                GPS_RESCUE.angle             = data.readU16();
                GPS_RESCUE.initialAltitudeM  = data.readU16();
                GPS_RESCUE.descentDistanceM  = data.readU16();
                GPS_RESCUE.rescueGroundspeed = data.readU16();
                GPS_RESCUE.throttleMin       = data.readU16();
                GPS_RESCUE.throttleMax       = data.readU16();
                GPS_RESCUE.throttleHover     = data.readU16();
                GPS_RESCUE.sanityChecks      = data.readU8();
                GPS_RESCUE.minSats           = data.readU8();
                break;
            case MSPCodes.MSP_RSSI_CONFIG:
                RSSI_CONFIG.channel = data.readU8();
                break;
            case MSPCodes.MSP_MOTOR_3D_CONFIG:
                MOTOR_3D_CONFIG.deadband3d_low = data.readU16();
                MOTOR_3D_CONFIG.deadband3d_high = data.readU16();
                MOTOR_3D_CONFIG.neutral = data.readU16();
                if (semver.lt(CONFIG.apiVersion, "1.17.0")) {
                    RC_DEADBAND_CONFIG.deadband3d_throttle = data.readU16();
                }
                break;
            case MSPCodes.MSP_BOXNAMES:
                AUX_CONFIG = []; // empty the array as new data is coming in

                var buff = [];
                for (var i = 0; i < data.byteLength; i++) {
                    var char = data.readU8();
                    if (char == 0x3B) { // ; (delimeter char)
                        AUX_CONFIG.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(char);
                    }
                }
                break;
            case MSPCodes.MSP_PIDNAMES:
                PID_names = []; // empty the array as new data is coming in

                var buff = [];
                for (var i = 0; i < data.byteLength; i++) {
                    var char = data.readU8();
                    if (char == 0x3B) { // ; (delimeter char)
                        PID_names.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(char);
                    }
                }
                break;
            case MSPCodes.MSP_BOXIDS:
                AUX_CONFIG_IDS = []; // empty the array as new data is coming in

                for (var i = 0; i < data.byteLength; i++) {
                    AUX_CONFIG_IDS.push(data.readU8());
                }
                break;
            case MSPCodes.MSP_SERVO_MIX_RULES:
                break;

            case MSPCodes.MSP_SERVO_CONFIGURATIONS:
                SERVO_CONFIG = []; // empty the array as new data is coming in
                if (semver.gte(CONFIG.apiVersion, "1.33.0")) {
                    if (data.byteLength % 12 == 0) {
                        for (var i = 0; i < data.byteLength; i += 12) {
                            var arr = {
                                'min':                      data.readU16(),
                                'max':                      data.readU16(),
                                'middle':                   data.readU16(),
                                'rate':                     data.read8(),
                                'indexOfChannelToForward':  data.readU8(),
                                'reversedInputSources':     data.readU32()
                            };

                            SERVO_CONFIG.push(arr);
                        }
                    }
                } else if (semver.gte(CONFIG.apiVersion, "1.12.0")) {
                    if (data.byteLength % 14 == 0) {
                        for (var i = 0; i < data.byteLength; i += 14) {
                            var arr = {
                                'min':                      data.readU16(),
                                'max':                      data.readU16(),
                                'middle':                   data.readU16(),
                                'rate':                     data.read8(),
                                'angleAtMin':               data.readU8(),
                                'angleAtMax':               data.readU8(),
                                'indexOfChannelToForward':  data.readU8(),
                                'reversedInputSources':     data.readU32()
                            };

                            SERVO_CONFIG.push(arr);
                        }
                    }
                } else {
                    if (data.byteLength % 7 == 0) {
                        for (var i = 0; i < data.byteLength; i += 7) {
                            var arr = {
                                'min':                      data.readU16(),
                                'max':                      data.readU16(),
                                'middle':                   data.readU16(),
                                'rate':                     data.read8(),
                                'angleAtMin':               45,
                                'angleAtMax':               45,
                                'indexOfChannelToForward':  undefined,
                                'reversedInputSources':     0
                            };

                            SERVO_CONFIG.push(arr);
                        }
                    }

                    if (semver.eq(CONFIG.apiVersion, '1.10.0')) {
                        // drop two unused servo configurations due to MSP rx buffer to small)
                        while (SERVO_CONFIG.length > 8) {
                            SERVO_CONFIG.pop();
                        }
                    }
                }
                break;
            case MSPCodes.MSP_RC_DEADBAND:
                RC_DEADBAND_CONFIG.deadband = data.readU8();
                RC_DEADBAND_CONFIG.yaw_deadband = data.readU8();
                RC_DEADBAND_CONFIG.alt_hold_deadband = data.readU8();

                if (semver.gte(CONFIG.apiVersion, "1.17.0")) {
                    RC_DEADBAND_CONFIG.deadband3d_throttle = data.readU16();
                }
                break;
            case MSPCodes.MSP_SENSOR_ALIGNMENT:
                SENSOR_ALIGNMENT.align_gyro = data.readU8();
                SENSOR_ALIGNMENT.align_acc = data.readU8();
                SENSOR_ALIGNMENT.align_mag = data.readU8();

                if (semver.gte(CONFIG.apiVersion, '1.41.0')) {
                    SENSOR_ALIGNMENT.gyro_detection_flags = data.readU8();
                    SENSOR_ALIGNMENT.gyro_to_use = data.readU8();
                    SENSOR_ALIGNMENT.gyro_1_align = data.readU8();
                    SENSOR_ALIGNMENT.gyro_2_align = data.readU8();
                }
                break;
            case MSPCodes.MSP_DISPLAYPORT:
                break;
            case MSPCodes.MSP_SET_RAW_RC:
                break;
            case MSPCodes.MSP_SET_PID:
                console.log('PID settings saved');
                break;
            case MSPCodes.MSP_SET_RC_TUNING:
                console.log('RC Tuning saved');
                break;
            case MSPCodes.MSP_ACC_CALIBRATION:
                console.log('Accel calibration executed');
                break;
            case MSPCodes.MSP_MAG_CALIBRATION:
                console.log('Mag calibration executed');
                break;
            case MSPCodes.MSP_SET_MOTOR_CONFIG:
                console.log('Motor Configuration saved');
                break;
            case MSPCodes.MSP_SET_GPS_CONFIG:
                console.log('GPS Configuration saved');
                break;
            case MSPCodes.MSP_SET_RSSI_CONFIG:
                console.log('RSSI Configuration saved');
                break;
            case MSPCodes.MSP_SET_FEATURE_CONFIG:
                console.log('Features saved');
                break;
            case MSPCodes.MSP_SET_BEEPER_CONFIG:
                console.log('Beeper Configuration saved');
                break;
            case MSPCodes.MSP_RESET_CONF:
                console.log('Settings Reset');
                break;
            case MSPCodes.MSP_SELECT_SETTING:
                console.log('Profile selected');
                break;
            case MSPCodes.MSP_SET_SERVO_CONFIGURATION:
                console.log('Servo Configuration saved');
                break;
            case MSPCodes.MSP_EEPROM_WRITE:
                console.log('Settings Saved in EEPROM');
                break;
            case MSPCodes.MSP_SET_CURRENT_METER_CONFIG:
                console.log('Amperage Settings saved');
                break;
            case MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG:
                console.log('Voltage config saved');
            case MSPCodes.MSP_DEBUG:
                for (var i = 0; i < 4; i++)
                    SENSOR_DATA.debug[i] = data.read16();
                break;
            case MSPCodes.MSP_SET_MOTOR:
                console.log('Motor Speeds Updated');
                break;
            case MSPCodes.MSP_UID:
                CONFIG.uid[0] = data.readU32();
                CONFIG.uid[1] = data.readU32();
                CONFIG.uid[2] = data.readU32();
                break;
            case MSPCodes.MSP_ACC_TRIM:
                CONFIG.accelerometerTrims[0] = data.read16(); // pitch
                CONFIG.accelerometerTrims[1] = data.read16(); // roll
                break;
            case MSPCodes.MSP_SET_ACC_TRIM:
                console.log('Accelerometer trimms saved.');
                break;
            case MSPCodes.MSP_GPS_SV_INFO:
                if (data.byteLength > 0) {
                    var numCh = data.readU8();

                    for (var i = 0; i < numCh; i++) {
                        GPS_DATA.chn[i] = data.readU8();
                        GPS_DATA.svid[i] = data.readU8();
                        GPS_DATA.quality[i] = data.readU8();
                        GPS_DATA.cno[i] = data.readU8();
                    }
                }
                break;

            case MSPCodes.MSP_RX_MAP:
                RC_MAP = []; // empty the array as new data is coming in

                for (var i = 0; i < data.byteLength; i++) {
                    RC_MAP.push(data.readU8());
                }
                break;
            case MSPCodes.MSP_SET_RX_MAP:
                console.log('RCMAP saved');
                break;

            case MSPCodes.MSP_MIXER_CONFIG:
                MIXER_CONFIG.mixer = data.readU8();
                if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                    MIXER_CONFIG.reverseMotorDir = data.readU8();
                }
                break;

            case MSPCodes.MSP_FEATURE_CONFIG:
                FEATURE_CONFIG.features.setMask(data.readU32());

                updateTabList(FEATURE_CONFIG.features);
                break;

            case MSPCodes.MSP_BEEPER_CONFIG:
                BEEPER_CONFIG.beepers.setMask(data.readU32());
                if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                    BEEPER_CONFIG.dshotBeaconTone = data.readU8();
                }
                if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                    BEEPER_CONFIG.dshotBeaconConditions.setMask(data.readU32());
                }
                break;

            case MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG:
                BOARD_ALIGNMENT_CONFIG.roll = data.read16(); // -180 - 360
                BOARD_ALIGNMENT_CONFIG.pitch = data.read16(); // -180 - 360
                BOARD_ALIGNMENT_CONFIG.yaw = data.read16(); // -180 - 360
                break;

            case MSPCodes.MSP_SET_REBOOT:
                if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                    var rebootType = data.read8();
                    if ((rebootType === self.REBOOT_TYPES.MSC) || (rebootType === self.REBOOT_TYPES.MSC_UTC)) {
                        if (data.read8() === 0) {
                            console.log('Storage device not ready.');

                            showErrorDialog(i18n.getMessage('storageDeviceNotReady'));
                            break;
                        }
                    }
                }
                console.log('Reboot request accepted');
                break;

            case MSPCodes.MSP_API_VERSION:
                CONFIG.mspProtocolVersion = data.readU8();
                CONFIG.apiVersion = data.readU8() + '.' + data.readU8() + '.0';
                break;

            case MSPCodes.MSP_FC_VARIANT:
                var identifier = '';
                for (var i = 0; i < 4; i++) {
                    identifier += String.fromCharCode(data.readU8());
                }
                CONFIG.flightControllerIdentifier = identifier;
                break;

            case MSPCodes.MSP_FC_VERSION:
                CONFIG.flightControllerVersion = data.readU8() + '.' + data.readU8() + '.' + data.readU8();
                break;

            case MSPCodes.MSP_BUILD_INFO:
                var dateLength = 11;
                var buff = [];
                for (var i = 0; i < dateLength; i++) {
                    buff.push(data.readU8());
                }
                buff.push(32); // ascii space

                var timeLength = 8;
                for (var i = 0; i < timeLength; i++) {
                    buff.push(data.readU8());
                }
                CONFIG.buildInfo = String.fromCharCode.apply(null, buff);
                break;

            case MSPCodes.MSP_BOARD_INFO:
                var identifier = '';
                for (var i = 0; i < 4; i++) {
                    identifier += String.fromCharCode(data.readU8());
                }
                CONFIG.boardIdentifier = identifier;
                CONFIG.boardVersion = data.readU16();

                if (semver.gte(CONFIG.apiVersion, "1.35.0")) {
                    CONFIG.boardType = data.readU8();
                } else {
                    CONFIG.boardType = 0;
                }

                CONFIG.targetName = "";
                if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                    CONFIG.targetCapabilities = data.readU8();

                    let length = data.readU8();
                    for (let i = 0; i < length; i++) {
                        CONFIG.targetName += String.fromCharCode(data.readU8());
                    }
                } else {
                    CONFIG.targetCapabilities = 0;
                }

                CONFIG.boardName = "";
                CONFIG.manufacturerId = "";
                CONFIG.signature = [];
                if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                    let length = data.readU8();
                    for (let i = 0; i < length; i++) {
                        CONFIG.boardName += String.fromCharCode(data.readU8());
                    }

                    length = data.readU8();
                    for (let i = 0; i < length; i++) {
                        CONFIG.manufacturerId += String.fromCharCode(data.readU8());
                    }

                    for (let i = 0; i < self.SIGNATURE_LENGTH; i++) {
                        CONFIG.signature.push(data.readU8());
                    }
                }

                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    CONFIG.mcuTypeId = data.readU8();

                    if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                        CONFIG.configurationState = data.readU8();
                    }
                } else {
                    CONFIG.mcuTypeId = 255;
                }
                break;

            case MSPCodes.MSP_NAME:
                CONFIG.name = '';
                var char;
                while ((char = data.readU8()) !== null) {
                    CONFIG.name += String.fromCharCode(char);
                }
                break;

            case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
                console.log('Channel forwarding saved');
                break;

            case MSPCodes.MSP_CF_SERIAL_CONFIG:
                if (semver.lt(CONFIG.apiVersion, "1.6.0")) {
                    SERIAL_CONFIG.ports = [];
                    var serialPortCount = (data.byteLength - (4 * 4)) / 2;
                    for (var i = 0; i < serialPortCount; i++) {
                        var serialPort = {
                            identifier: data.readU8(),
                            scenario: data.readU8()
                        }
                        SERIAL_CONFIG.ports.push(serialPort);
                    }
                    SERIAL_CONFIG.mspBaudRate = data.readU32();
                    SERIAL_CONFIG.cliBaudRate = data.readU32();
                    SERIAL_CONFIG.gpsBaudRate = data.readU32();
                    SERIAL_CONFIG.gpsPassthroughBaudRate = data.readU32();
                } else {
                    SERIAL_CONFIG.ports = [];
                    var bytesPerPort = 1 + 2 + (1 * 4);
                    var serialPortCount = data.byteLength / bytesPerPort;

                    for (var i = 0; i < serialPortCount; i++) {
                        var serialPort = {
                            identifier: data.readU8(),
                            functions: self.serialPortFunctionMaskToFunctions(data.readU16()),
                            msp_baudrate: self.BAUD_RATES[data.readU8()],
                            gps_baudrate: self.BAUD_RATES[data.readU8()],
                            telemetry_baudrate: self.BAUD_RATES[data.readU8()],
                            blackbox_baudrate: self.BAUD_RATES[data.readU8()]
                        }

                        SERIAL_CONFIG.ports.push(serialPort);
                    }
                }
                break;

            case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
                console.log('Serial config saved');
                break;

            case MSPCodes.MSP_MODE_RANGES:
                MODE_RANGES = []; // empty the array as new data is coming in

                var modeRangeCount = data.byteLength / 4; // 4 bytes per item.

                for (var i = 0; i < modeRangeCount; i++) {
                    var modeRange = {
                        id: data.readU8(),
                        auxChannelIndex: data.readU8(),
                        range: {
                            start: 900 + (data.readU8() * 25),
                            end: 900 + (data.readU8() * 25)
                        }
                    };
                    MODE_RANGES.push(modeRange);
                }
                break;

            case MSPCodes.MSP_MODE_RANGES_EXTRA:
                MODE_RANGES_EXTRA = []; // empty the array as new data is coming in

                var modeRangeExtraCount = data.readU8();

                for (var i = 0; i < modeRangeExtraCount; i++) {
                    var modeRangeExtra = {
                        id: data.readU8(),
                        modeLogic: data.readU8(),
                        linkedTo: data.readU8()
                    };
                    MODE_RANGES_EXTRA.push(modeRangeExtra);
                }
                break;

            case MSPCodes.MSP_ADJUSTMENT_RANGES:
                ADJUSTMENT_RANGES = []; // empty the array as new data is coming in

                var adjustmentRangeCount = data.byteLength / 6; // 6 bytes per item.

                for (var i = 0; i < adjustmentRangeCount; i++) {
                    var adjustmentRange = {
                        slotIndex: data.readU8(),
                        auxChannelIndex: data.readU8(),
                        range: {
                            start: 900 + (data.readU8() * 25),
                            end: 900 + (data.readU8() * 25)
                        },
                        adjustmentFunction: data.readU8(),
                        auxSwitchChannelIndex: data.readU8()
                    };
                    ADJUSTMENT_RANGES.push(adjustmentRange);
                }
                break;

            case MSPCodes.MSP_RX_CONFIG:
                RX_CONFIG.serialrx_provider = data.readU8();
                RX_CONFIG.stick_max = data.readU16();
                RX_CONFIG.stick_center = data.readU16();
                RX_CONFIG.stick_min = data.readU16();
                RX_CONFIG.spektrum_sat_bind = data.readU8();
                RX_CONFIG.rx_min_usec = data.readU16();
                RX_CONFIG.rx_max_usec = data.readU16();
                if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                    RX_CONFIG.rcInterpolation = data.readU8();
                    RX_CONFIG.rcInterpolationInterval = data.readU8();
                    RX_CONFIG.airModeActivateThreshold = data.readU16();
                    if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
                        RX_CONFIG.rxSpiProtocol = data.readU8();
                        RX_CONFIG.rxSpiId = data.readU32();
                        RX_CONFIG.rxSpiRfChannelCount = data.readU8();
                        RX_CONFIG.fpvCamAngleDegrees = data.readU8();
                        if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                            RX_CONFIG.rcInterpolationChannels = data.readU8();
                            RX_CONFIG.rcSmoothingType = data.readU8();
                            RX_CONFIG.rcSmoothingInputCutoff = data.readU8();
                            RX_CONFIG.rcSmoothingDerivativeCutoff = data.readU8();
                            RX_CONFIG.rcSmoothingInputType = data.readU8();
                            RX_CONFIG.rcSmoothingDerivativeType = data.readU8();
                            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                                RX_CONFIG.usbCdcHidType = data.readU8();
                                RX_CONFIG.rcSmoothingAutoSmoothness = data.readU8();
                            }
                        }
                    } else {
                        RX_CONFIG.rxSpiProtocol = 0;
                        RX_CONFIG.rxSpiId = 0;
                        RX_CONFIG.rxSpiRfChannelCount = 0;
                        RX_CONFIG.fpvCamAngleDegrees = 0;
                    }
                } else {
                    RX_CONFIG.rcInterpolation = 0;
                    RX_CONFIG.rcInterpolationInterval = 0;
                    RX_CONFIG.airModeActivateThreshold = 0;
                }

                
                break;

            case MSPCodes.MSP_RXRANGE_CONFIG:
                const rxRangeChannelCount = data.byteLength / 4;

                RXRANGE_CONFIG = [...Array(rxRangeChannelCount).keys()].map(() => [
                    data.readU16(),
                    data.readU16()
                ]);

                break;

            case MSPCodes.MSP_FAILSAFE_CONFIG:
                FAILSAFE_CONFIG.failsafe_delay = data.readU8();
                FAILSAFE_CONFIG.failsafe_off_delay = data.readU8();
                FAILSAFE_CONFIG.failsafe_throttle = data.readU16();
                if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
                    FAILSAFE_CONFIG.failsafe_switch_mode = data.readU8();
                    FAILSAFE_CONFIG.failsafe_throttle_low_delay = data.readU16();
                    FAILSAFE_CONFIG.failsafe_procedure = data.readU8();
                }
                break;

            case MSPCodes.MSP_RXFAIL_CONFIG:
                RXFAIL_CONFIG = []; // empty the array as new data is coming in

                var channelCount = data.byteLength / 3;
                for (var i = 0; i < channelCount; i++) {
                    var rxfailChannel = {
                        mode:  data.readU8(),
                        value: data.readU16()
                    };
                    RXFAIL_CONFIG.push(rxfailChannel);
                }
                break;

            case MSPCodes.MSP_ADVANCED_CONFIG:
                PID_ADVANCED_CONFIG.gyro_sync_denom = data.readU8();
                PID_ADVANCED_CONFIG.pid_process_denom = data.readU8();
                PID_ADVANCED_CONFIG.use_unsyncedPwm = data.readU8();
                PID_ADVANCED_CONFIG.fast_pwm_protocol = self.reorderPwmProtocols(data.readU8());
                PID_ADVANCED_CONFIG.motor_pwm_rate = data.readU16();
                if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
                    PID_ADVANCED_CONFIG.digitalIdlePercent = data.readU16() / 100;

                    if (semver.gte(CONFIG.apiVersion, "1.25.0")) {
                        let gyroUse32kHz = data.readU8();
                        if (semver.lt(CONFIG.apiVersion, "1.41.0")) {
                            PID_ADVANCED_CONFIG.gyroUse32kHz = gyroUse32kHz;
                        } 
                        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                            PID_ADVANCED_CONFIG.motorPwmInversion = data.readU8();
                            SENSOR_ALIGNMENT.gyro_to_use = data.readU8(); // We don't want to double up on storing this state
                            PID_ADVANCED_CONFIG.gyroHighFsr = data.readU8();
                            PID_ADVANCED_CONFIG.gyroMovementCalibThreshold = data.readU8();
                            PID_ADVANCED_CONFIG.gyroCalibDuration = data.readU16();
                            PID_ADVANCED_CONFIG.gyroOffsetYaw = data.readU16();
                            PID_ADVANCED_CONFIG.gyroCheckOverflow = data.readU8();
                            PID_ADVANCED_CONFIG.debugMode = data.readU8();
                            PID_ADVANCED_CONFIG.debugModeCount = data.readU8();
                        }
                    }
                }
                break;
            case MSPCodes.MSP_FILTER_CONFIG:
                FILTER_CONFIG.gyro_lowpass_hz = data.readU8();
                FILTER_CONFIG.dterm_lowpass_hz = data.readU16();
                FILTER_CONFIG.yaw_lowpass_hz = data.readU16();
                if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                    FILTER_CONFIG.gyro_notch_hz = data.readU16();
                    FILTER_CONFIG.gyro_notch_cutoff = data.readU16();
                    FILTER_CONFIG.dterm_notch_hz = data.readU16();
                    FILTER_CONFIG.dterm_notch_cutoff = data.readU16();
                    if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
                        FILTER_CONFIG.gyro_notch2_hz = data.readU16();
                        FILTER_CONFIG.gyro_notch2_cutoff = data.readU16();
                    }
                    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                        FILTER_CONFIG.dterm_lowpass_type = data.readU8();
                    }
                    if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                        FILTER_CONFIG.gyro_hardware_lpf = data.readU8();
                        let gyro_32khz_hardware_lpf = data.readU8();
                        FILTER_CONFIG.gyro_lowpass_hz = data.readU16();
                        FILTER_CONFIG.gyro_lowpass2_hz = data.readU16();
                        FILTER_CONFIG.gyro_lowpass_type = data.readU8();
                        FILTER_CONFIG.gyro_lowpass2_type = data.readU8();
                        FILTER_CONFIG.dterm_lowpass2_hz = data.readU16();
                        if (semver.lt(CONFIG.apiVersion, "1.41.0")) {
                            FILTER_CONFIG.gyro_32khz_hardware_lpf = gyro_32khz_hardware_lpf;
                        } else {
                            FILTER_CONFIG.gyro_32khz_hardware_lpf = 0;

                            FILTER_CONFIG.dterm_lowpass2_type = data.readU8();
                            FILTER_CONFIG.gyro_lowpass_dyn_min_hz = data.readU16();
                            FILTER_CONFIG.gyro_lowpass_dyn_max_hz = data.readU16();
                            FILTER_CONFIG.dterm_lowpass_dyn_min_hz = data.readU16();
                            FILTER_CONFIG.dterm_lowpass_dyn_max_hz = data.readU16();
                            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                                FILTER_CONFIG.dyn_notch_range = data.readU8();
                                FILTER_CONFIG.dyn_notch_width_percent = data.readU8();
                                FILTER_CONFIG.dyn_notch_q = data.readU16();
                                FILTER_CONFIG.dyn_notch_min_hz = data.readU16();

                                FILTER_CONFIG.gyro_rpm_notch_harmonics = data.readU8();
                                FILTER_CONFIG.gyro_rpm_notch_min_hz = data.readU8();
                            }
                        }
                    }
                }
                break;
            case MSPCodes.MSP_SET_PID_ADVANCED:
                console.log("Advanced PID settings saved");
                break;
            case MSPCodes.MSP_PID_ADVANCED:
                ADVANCED_TUNING.rollPitchItermIgnoreRate = data.readU16();
                ADVANCED_TUNING.yawItermIgnoreRate = data.readU16();
                ADVANCED_TUNING.yaw_p_limit = data.readU16();
                ADVANCED_TUNING.deltaMethod = data.readU8();
                ADVANCED_TUNING.vbatPidCompensation = data.readU8();
                if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                    if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                        ADVANCED_TUNING.feedforwardTransition = data.readU8();
                    } else {
                        ADVANCED_TUNING.dtermSetpointTransition = data.readU8();
                    }
                    ADVANCED_TUNING.dtermSetpointWeight = data.readU8();
                    ADVANCED_TUNING.toleranceBand = data.readU8();
                    ADVANCED_TUNING.toleranceBandReduction = data.readU8();
                    ADVANCED_TUNING.itermThrottleGain = data.readU8();
                    ADVANCED_TUNING.pidMaxVelocity = data.readU16();
                    ADVANCED_TUNING.pidMaxVelocityYaw = data.readU16();
                    if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
                        ADVANCED_TUNING.levelAngleLimit = data.readU8();
                        ADVANCED_TUNING.levelSensitivity = data.readU8();

                        if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                            ADVANCED_TUNING.itermThrottleThreshold = data.readU16();
                            ADVANCED_TUNING.itermAcceleratorGain = data.readU16();

                            if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                                ADVANCED_TUNING.dtermSetpointWeight = data.readU16();

                                if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                                    ADVANCED_TUNING.itermRotation = data.readU8();
                                    ADVANCED_TUNING.smartFeedforward = data.readU8();
                                    ADVANCED_TUNING.itermRelax = data.readU8();
                                    ADVANCED_TUNING.itermRelaxType = data.readU8();
                                    ADVANCED_TUNING.absoluteControlGain = data.readU8();
                                    ADVANCED_TUNING.throttleBoost = data.readU8();
                                    ADVANCED_TUNING.acroTrainerAngleLimit = data.readU8();
                                    ADVANCED_TUNING.feedforwardRoll  = data.readU16();
                                    ADVANCED_TUNING.feedforwardPitch = data.readU16();
                                    ADVANCED_TUNING.feedforwardYaw   = data.readU16();
                                    ADVANCED_TUNING.antiGravityMode  = data.readU8();
                                    
                                    if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                                        ADVANCED_TUNING.dMinRoll = data.readU8();
                                        ADVANCED_TUNING.dMinPitch = data.readU8();
                                        ADVANCED_TUNING.dMinYaw = data.readU8();
                                        ADVANCED_TUNING.dMinGain = data.readU8();
                                        ADVANCED_TUNING.dMinAdvance = data.readU8();
                                        ADVANCED_TUNING.useIntegratedYaw = data.readU8();
                                        ADVANCED_TUNING.integratedYawRelax = data.readU8();

                                        if(semver.gte(CONFIG.apiVersion, "1.42.0")) {
                                            ADVANCED_TUNING.itermRelaxCutoff = data.readU8();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                break;
            case MSPCodes.MSP_SENSOR_CONFIG:
                SENSOR_CONFIG.acc_hardware = data.readU8();
                SENSOR_CONFIG.baro_hardware = data.readU8();
                SENSOR_CONFIG.mag_hardware = data.readU8();
                break;

            case MSPCodes.MSP_LED_STRIP_CONFIG:
                LED_STRIP = [];

                var ledDirectionLetters =       ['n', 'e', 's', 'w', 'u', 'd'];      // in LSB bit order
                var ledFunctionLetters =        ['i', 'w', 'f', 'a', 't', 'r', 'c', 'g', 's', 'b', 'l']; // in LSB bit order
                var ledBaseFunctionLetters =    ['c', 'f', 'a', 'l', 's', 'g', 'r']; // in LSB bit
                if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
                    var ledOverlayLetters =     ['t', 'o', 'b', 'n', 'i', 'w']; // in LSB bit
                } else {
                    var ledOverlayLetters =     ['t', 'o', 'b', 'v', 'i', 'w']; // in LSB bit
                }


                var ledCount = data.byteLength / 7; // v1.4.0 and below incorrectly reported 4 bytes per led.
                if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                    ledCount = data.byteLength / 4;
                }
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    // According to betaflight/src/main/msp/msp.c
                    // API 1.41 - add indicator for advanced profile support and the current profile selection
                    // 0 = basic ledstrip available
                    // 1 = advanced ledstrip available
                    // Following byte is the current LED profile
                    ledCount = (data.byteLength - 2) / 4;
                }
                for (var i = 0; i < ledCount; i++) {

                    if (semver.lt(CONFIG.apiVersion, "1.20.0")) {
                        var directionMask = data.readU16();

                        var directions = [];
                        for (var directionLetterIndex = 0; directionLetterIndex < ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(ledDirectionLetters[directionLetterIndex]);
                            }
                        }

                        var functionMask = data.readU16();

                        var functions = [];
                        for (var functionLetterIndex = 0; functionLetterIndex < ledFunctionLetters.length; functionLetterIndex++) {
                            if (bit_check(functionMask, functionLetterIndex)) {
                                functions.push(ledFunctionLetters[functionLetterIndex]);
                            }
                        }

                        var led = {
                            directions: directions,
                            functions: functions,
                            x: data.readU8(),
                            y: data.readU8(),
                            color: data.readU8()
                        };

                        LED_STRIP.push(led);
                    } else {
                        var mask = data.readU32();

                        var functionId = (mask >> 8) & 0xF;
                        var functions = [];
                        for (var baseFunctionLetterIndex = 0; baseFunctionLetterIndex < ledBaseFunctionLetters.length; baseFunctionLetterIndex++) {
                            if (functionId == baseFunctionLetterIndex) {
                                functions.push(ledBaseFunctionLetters[baseFunctionLetterIndex]);
                                break;
                            }
                        }

                        var overlayMask = (mask >> 12) & 0x3F;
                        for (var overlayLetterIndex = 0; overlayLetterIndex < ledOverlayLetters.length; overlayLetterIndex++) {
                            if (bit_check(overlayMask, overlayLetterIndex)) {
                                functions.push(ledOverlayLetters[overlayLetterIndex]);
                            }
                        }

                        var directionMask = (mask >> 22) & 0x3F;
                        var directions = [];
                        for (var directionLetterIndex = 0; directionLetterIndex < ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(ledDirectionLetters[directionLetterIndex]);
                            }
                        }
                        var led = {
                            y: (mask) & 0xF,
                            x: (mask >> 4) & 0xF,
                            functions: functions,
                            color: (mask >> 18) & 0xF,
                            directions: directions,
                            parameters: (mask >> 28) & 0xF
                        };

                        LED_STRIP.push(led);
                    }
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_CONFIG:
                console.log('Led strip config saved');
                break;
            case MSPCodes.MSP_LED_COLORS:

                LED_COLORS = [];

                var colorCount = data.byteLength / 4;

                for (var i = 0; i < colorCount; i++) {

                    var color = {
                        h: data.readU16(),
                        s: data.readU8(),
                        v: data.readU8()
                    };
                    LED_COLORS.push(color);
                }

                break;
            case MSPCodes.MSP_SET_LED_COLORS:
                console.log('Led strip colors saved');
                break;
            case MSPCodes.MSP_LED_STRIP_MODECOLOR:
                if (semver.gte(CONFIG.apiVersion, "1.19.0")) {

                    LED_MODE_COLORS = [];

                    var colorCount = data.byteLength / 3;

                    for (var i = 0; i < colorCount; i++) {

                        var mode_color = {
                            mode: data.readU8(),
                            direction: data.readU8(),
                            color: data.readU8()
                        };
                        LED_MODE_COLORS.push(mode_color);
                    }
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_MODECOLOR:
                console.log('Led strip mode colors saved');
                break;

            case MSPCodes.MSP_DATAFLASH_SUMMARY:
                if (data.byteLength >= 13) {
                    var flags = data.readU8();
                    DATAFLASH.ready = (flags & 1) != 0;
                    DATAFLASH.supported = (flags & 2) != 0;
                    DATAFLASH.sectors = data.readU32();
                    DATAFLASH.totalSize = data.readU32();
                    DATAFLASH.usedSize = data.readU32();
                } else {
                    // Firmware version too old to support MSP_DATAFLASH_SUMMARY
                    DATAFLASH.ready = false;
                    DATAFLASH.supported = false;
                    DATAFLASH.sectors = 0;
                    DATAFLASH.totalSize = 0;
                    DATAFLASH.usedSize = 0;
                }
                update_dataflash_global();
                break;
            case MSPCodes.MSP_DATAFLASH_READ:
                // No-op, let callback handle it
                break;
            case MSPCodes.MSP_DATAFLASH_ERASE:
                console.log("Data flash erase begun...");
                break;
            case MSPCodes.MSP_SDCARD_SUMMARY:
                var flags = data.readU8();

                SDCARD.supported = (flags & 0x01) != 0;
                SDCARD.state = data.readU8();
                SDCARD.filesystemLastError = data.readU8();
                SDCARD.freeSizeKB = data.readU32();
                SDCARD.totalSizeKB = data.readU32();
                break;
            case MSPCodes.MSP_BLACKBOX_CONFIG:
                BLACKBOX.supported = (data.readU8() & 1) != 0;
                BLACKBOX.blackboxDevice = data.readU8();
                BLACKBOX.blackboxRateNum = data.readU8();
                BLACKBOX.blackboxRateDenom = data.readU8();
                if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                    BLACKBOX.blackboxPDenom = data.readU16();

                }
                break;
            case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
                console.log("Blackbox config saved");
                break;
            case MSPCodes.MSP_TRANSPONDER_CONFIG:
                var bytesRemaining = data.byteLength;
                if (semver.gte(CONFIG.apiVersion, "1.33.0")) {
                    var providerCount = data.readU8();
                    bytesRemaining--;

                    TRANSPONDER.supported = providerCount > 0;
                    TRANSPONDER.providers = [];

                    for (var i = 0; i < providerCount; i++) {
                        var provider = {
                            id: data.readU8(),
                            dataLength: data.readU8()
                        };
                        bytesRemaining -= 2;

                        TRANSPONDER.providers.push(provider);
                    }
                    TRANSPONDER.provider = data.readU8();
                    bytesRemaining--;

                } else {
                    TRANSPONDER.supported = (data.readU8() & 1) != 0;
                    bytesRemaining--;

                    // only ILAP was supported prior to 1.33.0
                    TRANSPONDER.providers = [{
                        id: 1, // ILAP
                        dataLength: 6
                    }];
                    TRANSPONDER.provider = TRANSPONDER.providers[0].id;
                }
                TRANSPONDER.data = [];
                for (var i = 0; i < bytesRemaining; i++) {
                    TRANSPONDER.data.push(data.readU8());
                }
                break;

            case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
                console.log("Transponder config saved");
                break;

            case MSPCodes.MSP_VTX_CONFIG:

                VTX_CONFIG.vtx_type = data.readU8();
                VTX_CONFIG.vtx_band = data.readU8();
                VTX_CONFIG.vtx_channel = data.readU8();
                VTX_CONFIG.vtx_power = data.readU8();
                VTX_CONFIG.vtx_pit_mode = data.readU8() != 0;
                VTX_CONFIG.vtx_frequency = data.readU16();
                VTX_CONFIG.vtx_device_ready = data.readU8() != 0;
                VTX_CONFIG.vtx_low_power_disarm = data.readU8();

                if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                    VTX_CONFIG.vtx_pit_mode_frequency = data.readU16();
                    VTX_CONFIG.vtx_table_available = data.readU8() != 0;
                    VTX_CONFIG.vtx_table_bands = data.readU8();
                    VTX_CONFIG.vtx_table_channels = data.readU8();
                    VTX_CONFIG.vtx_table_powerlevels = data.readU8();
                    VTX_CONFIG.vtx_table_clear = false;
                }
                break;

            case MSPCodes.MSP_SET_VTX_CONFIG:
                console.log("VTX config sent");
                break;

            case MSPCodes.MSP_VTXTABLE_BAND:

                VTXTABLE_BAND.vtxtable_band_number = data.readU8();

                let bandNameLength = data.readU8();
                VTXTABLE_BAND.vtxtable_band_name = '';
                for (let i = 0; i < bandNameLength; i++) {
                    VTXTABLE_BAND.vtxtable_band_name += String.fromCharCode(data.readU8());
                }

                VTXTABLE_BAND.vtxtable_band_letter = String.fromCharCode(data.readU8());
                VTXTABLE_BAND.vtxtable_band_is_factory_band = data.readU8() != 0;

                let bandFrequenciesLength = data.readU8();
                VTXTABLE_BAND.vtxtable_band_frequencies = [];
                for (let i = 0; i < bandFrequenciesLength; i++) {
                    VTXTABLE_BAND.vtxtable_band_frequencies.push(data.readU16());
                }

                break;

            case MSPCodes.MSP_SET_VTXTABLE_BAND:
                console.log("VTX band sent");
                break;

            case MSPCodes.MSP_VTXTABLE_POWERLEVEL:

                VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number = data.readU8();
                VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value = data.readU16();

                let powerLabelLength = data.readU8();
                VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label = '';
                for (let i = 0; i < powerLabelLength; i++) {
                    VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label += String.fromCharCode(data.readU8());
                }

                break;

            case MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL:
                console.log("VTX powerlevel sent");
                break;

            case MSPCodes.MSP_SET_MODE_RANGE:
                console.log('Mode range saved');
                break;
            case MSPCodes.MSP_SET_ADJUSTMENT_RANGE:
                console.log('Adjustment range saved');
                break;
            case MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG:
                console.log('Board alignment saved');
                break;
            case MSPCodes.MSP_PID_CONTROLLER:
                PID.controller = data.readU8();
                break;
            case MSPCodes.MSP_SET_PID_CONTROLLER:
                console.log('PID controller changed');
                break;
            case MSPCodes.MSP_SET_LOOP_TIME:
                console.log('Looptime saved');
                break;
            case MSPCodes.MSP_SET_ARMING_CONFIG:
                console.log('Arming config saved');
                break;
            case MSPCodes.MSP_SET_RESET_CURR_PID:
                console.log('Current PID profile reset');
                break;
            case MSPCodes.MSP_SET_MOTOR_3D_CONFIG:
                console.log('3D settings saved');
                break;
            case MSPCodes.MSP_SET_MIXER_CONFIG:
                console.log('Mixer config saved');
                break;
            case MSPCodes.MSP_SET_RC_DEADBAND:
                console.log('Rc controls settings saved');
                break;
            case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
                console.log('Sensor alignment saved');
                break;
            case MSPCodes.MSP_SET_RX_CONFIG:
                console.log('Rx config saved');
                break;
            case MSPCodes.MSP_SET_RXFAIL_CONFIG:
                console.log('Rxfail config saved');
                break;
            case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
                console.log('Failsafe config saved');
                break;
            case MSPCodes.MSP_OSD_CONFIG:
                break;
            case MSPCodes.MSP_SET_OSD_CONFIG:
                console.log('OSD config set');
                break;
            case MSPCodes.MSP_OSD_CHAR_READ:
                break;
            case MSPCodes.MSP_OSD_CHAR_WRITE:
                console.log('OSD char uploaded');
                break;
            case MSPCodes.MSP_SET_NAME:
                console.log('Name set');
                break;
            case MSPCodes.MSP_SET_FILTER_CONFIG:
                console.log('Filter config set');
                break;
            case MSPCodes.MSP_SET_ADVANCED_CONFIG:
                console.log('Advanced config parameters set');
                break;
            case MSPCodes.MSP_SET_SENSOR_CONFIG:
                console.log('Sensor config parameters set');
                break;
            case MSPCodes.MSP_COPY_PROFILE:
                console.log('Copy profile');
                break;
            case MSPCodes.MSP_ARMING_DISABLE:
                console.log('Arming disable');
                break;
            case MSPCodes.MSP_SET_RTC:
                console.log('Real time clock set');
                break;
            case MSPCodes.MSP_SET_RXRANGE_CONFIG:
                console.log('RX Range saved');
                break;

            case MSPCodes.MSP_MULTIPLE_MSP:

                let hasReturnedSomeCommand = false; // To avoid infinite loops

                while (data.offset < data.byteLength) {

                    hasReturnedSomeCommand = true;

                    let command = self.mspMultipleCache.shift();
                    let payloadSize = data.readU8();

                    if (payloadSize != 0) {

                        let currentDataHandler = {
                                code         : command,
                                dataView     : new DataView(data.buffer, data.offset, payloadSize),
                                callbacks    : [],
                        }
    
                        self.process_data(currentDataHandler);

                        data.offset += payloadSize;
                    }
                }

                if (hasReturnedSomeCommand) {
                    // Send again MSP messages missing, the buffer in the FC was too small
                    if (self.mspMultipleCache.length > 0) {
    
                        var partialBuffer = [];
                        for (let i = 0; i < self.mspMultipleCache.length; i++) {
                            partialBuffer.push8(self.mspMultipleCache[i]);
                        }
    
                        MSP.send_message(MSPCodes.MSP_MULTIPLE_MSP, partialBuffer, false, dataHandler.callbacks);
                        dataHandler.callbacks = [];
                    }
                } else {
                    console.log("MSP Multiple can't process the command");
                    self.mspMultipleCache = [];
                }

                break;

            default:
                console.log('Unknown code detected: ' + code);
        } else {
            console.log('FC reports unsupported message error: ' + code);

            switch (code) {
            case MSPCodes.MSP_SET_REBOOT:
                TABS.onboard_logging.mscRebootFailedCallback();

                break;
            }
        }
    }
    // trigger callbacks, cleanup/remove callback after trigger
    for (var i = dataHandler.callbacks.length - 1; i >= 0; i--) { // itterating in reverse because we use .splice which modifies array length
        if (dataHandler.callbacks[i].code == code) {
            // save callback reference
            var callback = dataHandler.callbacks[i].callback;
            var callbackOnError = dataHandler.callbacks[i].callbackOnError;

            // remove timeout
            clearInterval(dataHandler.callbacks[i].timer);

            // remove object from array
            dataHandler.callbacks.splice(i, 1);
            if (!crcError || callbackOnError) {
                // fire callback
                if (callback) callback({'command': code, 'data': data, 'length': data.byteLength, 'crcError': crcError});
            }
        }
    }
}

/**
 * Encode the request body for the MSP request with the given code and return it as an array of bytes.
 */
MspHelper.prototype.crunch = function(code) {
    var buffer = [];
    var self = this;

    switch (code) {
        case MSPCodes.MSP_SET_FEATURE_CONFIG:
            var featureMask = FEATURE_CONFIG.features.getMask();
            buffer.push32(featureMask);
            break;
        case MSPCodes.MSP_SET_BEEPER_CONFIG:
            var beeperMask = BEEPER_CONFIG.beepers.getMask();
            buffer.push32(beeperMask);
            if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                buffer.push8(BEEPER_CONFIG.dshotBeaconTone);
            }
            if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                buffer.push32(BEEPER_CONFIG.dshotBeaconConditions.getMask());
            }
            break;
        case MSPCodes.MSP_SET_MIXER_CONFIG:
            buffer.push8(MIXER_CONFIG.mixer)
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                buffer.push8(MIXER_CONFIG.reverseMotorDir);
            }
            break;
        case MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG:
            buffer.push16(BOARD_ALIGNMENT_CONFIG.roll)
                .push16(BOARD_ALIGNMENT_CONFIG.pitch)
                .push16(BOARD_ALIGNMENT_CONFIG.yaw);
            break;
        case MSPCodes.MSP_SET_PID_CONTROLLER:
            buffer.push8(PID.controller);
            break;
        case MSPCodes.MSP_SET_PID:
            for (var i = 0; i < PIDs.length; i++) {
                for (var j = 0; j < 3; j++) {
                    buffer.push8(parseInt(PIDs[i][j]));
                }
            }
            break;
        case MSPCodes.MSP_SET_RC_TUNING:
            buffer.push8(Math.round(RC_tuning.RC_RATE * 100))
                .push8(Math.round(RC_tuning.RC_EXPO * 100));
            if (semver.lt(CONFIG.apiVersion, "1.7.0")) {
                buffer.push8(Math.round(RC_tuning.roll_pitch_rate * 100));
            } else {
                buffer.push8(Math.round(RC_tuning.roll_rate * 100))
                    .push8(Math.round(RC_tuning.pitch_rate * 100));
            }
            buffer.push8(Math.round(RC_tuning.yaw_rate * 100))
                .push8(Math.round(RC_tuning.dynamic_THR_PID * 100))
                .push8(Math.round(RC_tuning.throttle_MID * 100))
                .push8(Math.round(RC_tuning.throttle_EXPO * 100));
            if (semver.gte(CONFIG.apiVersion, "1.7.0")) {
                buffer.push16(RC_tuning.dynamic_THR_breakpoint);
            }
            if (semver.gte(CONFIG.apiVersion, "1.10.0")) {
                buffer.push8(Math.round(RC_tuning.RC_YAW_EXPO * 100));
                if (semver.gte(CONFIG.apiVersion, "1.16.0")) {
                    buffer.push8(Math.round(RC_tuning.rcYawRate * 100));
                }
            }
            if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                buffer.push8(Math.round(RC_tuning.rcPitchRate * 100));
                buffer.push8(Math.round(RC_tuning.RC_PITCH_EXPO * 100));
            }
            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                buffer.push8(RC_tuning.throttleLimitType);
                buffer.push8(RC_tuning.throttleLimitPercent);
            }
            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                buffer.push16(RC_tuning.roll_rate_limit);
                buffer.push16(RC_tuning.pitch_rate_limit);
                buffer.push16(RC_tuning.yaw_rate_limit);
            }
            break;
        case MSPCodes.MSP_SET_ACC_TRIM:
            buffer.push16(CONFIG.accelerometerTrims[0])
                .push16(CONFIG.accelerometerTrims[1]);
            break;
        case MSPCodes.MSP_SET_ARMING_CONFIG:
            buffer.push8(ARMING_CONFIG.auto_disarm_delay)
                .push8(ARMING_CONFIG.disarm_kill_switch);
            if (semver.gte(CONFIG.apiVersion, "1.37.0")) {
                buffer.push8(ARMING_CONFIG.small_angle);
            }
            break;
        case MSPCodes.MSP_SET_LOOP_TIME:
            buffer.push16(FC_CONFIG.loopTime);
            break;
        case MSPCodes.MSP_SET_MISC:
            buffer.push16(RX_CONFIG.midrc)
                .push16(MOTOR_CONFIG.minthrottle)
                .push16(MOTOR_CONFIG.maxthrottle)
                .push16(MOTOR_CONFIG.mincommand)
                .push16(MISC.failsafe_throttle)
                .push8(GPS_CONFIG.provider)
                .push8(MISC.gps_baudrate)
                .push8(GPS_CONFIG.ublox_sbas)
                .push8(MISC.multiwiicurrentoutput)
                .push8(RSSI_CONFIG.channel)
                .push8(MISC.placeholder2);
            if (semver.lt(CONFIG.apiVersion, "1.18.0")) {
                buffer.push16(Math.round(COMPASS_CONFIG.mag_declination * 10));
            } else {
                buffer.push16(Math.round(COMPASS_CONFIG.mag_declination * 100));
            }
            buffer.push8(MISC.vbatscale)
                .push8(Math.round(MISC.vbatmincellvoltage * 10))
                .push8(Math.round(MISC.vbatmaxcellvoltage * 10))
                .push8(Math.round(MISC.vbatwarningcellvoltage * 10));
            break;
        case MSPCodes.MSP_SET_MOTOR_CONFIG:
            buffer.push16(MOTOR_CONFIG.minthrottle)
                .push16(MOTOR_CONFIG.maxthrottle)
                .push16(MOTOR_CONFIG.mincommand);
            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                buffer.push8(MOTOR_CONFIG.motor_poles);
                buffer.push8(MOTOR_CONFIG.use_dshot_telemetry ? 1 : 0);
            }
            break;
        case MSPCodes.MSP_SET_GPS_CONFIG:
            buffer.push8(GPS_CONFIG.provider)
                .push8(GPS_CONFIG.ublox_sbas);
            if (semver.gte(CONFIG.apiVersion, "1.34.0")) {
                buffer.push8(GPS_CONFIG.auto_config)
                    .push8(GPS_CONFIG.auto_baud);
            }
            break;
        case MSPCodes.MSP_SET_GPS_RESCUE:
            buffer.push16(GPS_RESCUE.angle)
                  .push16(GPS_RESCUE.initialAltitudeM)
                  .push16(GPS_RESCUE.descentDistanceM)
                  .push16(GPS_RESCUE.rescueGroundspeed)
                  .push16(GPS_RESCUE.throttleMin)
                  .push16(GPS_RESCUE.throttleMax)
                  .push16(GPS_RESCUE.throttleHover)
                  .push8(GPS_RESCUE.sanityChecks)
                  .push8(GPS_RESCUE.minSats);
            break;
        case MSPCodes.MSP_SET_COMPASS_CONFIG:
            buffer.push16(Math.round(COMPASS_CONFIG.mag_declination * 100));
            break;
        case MSPCodes.MSP_SET_RSSI_CONFIG:
            buffer.push8(RSSI_CONFIG.channel);
            break;
        case MSPCodes.MSP_SET_BATTERY_CONFIG:
            buffer.push8(Math.round(BATTERY_CONFIG.vbatmincellvoltage * 10))
                .push8(Math.round(BATTERY_CONFIG.vbatmaxcellvoltage * 10))
                .push8(Math.round(BATTERY_CONFIG.vbatwarningcellvoltage * 10))
                .push16(BATTERY_CONFIG.capacity)
                .push8(BATTERY_CONFIG.voltageMeterSource)
                .push8(BATTERY_CONFIG.currentMeterSource);
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    buffer.push16(Math.round(BATTERY_CONFIG.vbatmincellvoltage * 100))
                        .push16(Math.round(BATTERY_CONFIG.vbatmaxcellvoltage * 100))
                        .push16(Math.round(BATTERY_CONFIG.vbatwarningcellvoltage * 100));
                }
            break;
        case MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG:
            if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
                buffer.push8(MISC.vbatscale)
                    .push8(Math.round(MISC.vbatmincellvoltage * 10))
                    .push8(Math.round(MISC.vbatmaxcellvoltage * 10))
                    .push8(Math.round(MISC.vbatwarningcellvoltage * 10));
                    if (semver.gte(CONFIG.apiVersion, "1.23.0")) {
                        buffer.push8(MISC.batterymetertype);
                    }
            }
           break;
        case MSPCodes.MSP_SET_CURRENT_METER_CONFIG:
            if (semver.lt(CONFIG.apiVersion, "1.36.0"))  {
                buffer.push16(BF_CONFIG.currentscale)
                    .push16(BF_CONFIG.currentoffset)
                    .push8(BF_CONFIG.currentmetertype)
                    .push16(BF_CONFIG.batterycapacity)
            }
            break;

        case MSPCodes.MSP_SET_RX_CONFIG:
            buffer.push8(RX_CONFIG.serialrx_provider)
                .push16(RX_CONFIG.stick_max)
                .push16(RX_CONFIG.stick_center)
                .push16(RX_CONFIG.stick_min)
                .push8(RX_CONFIG.spektrum_sat_bind)
                .push16(RX_CONFIG.rx_min_usec)
                .push16(RX_CONFIG.rx_max_usec);
            if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                buffer.push8(RX_CONFIG.rcInterpolation)
                    .push8(RX_CONFIG.rcInterpolationInterval)
                    .push16(RX_CONFIG.airModeActivateThreshold);
                if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
                    buffer.push8(RX_CONFIG.rxSpiProtocol)
                        .push32(RX_CONFIG.rxSpiId)
                        .push8(RX_CONFIG.rxSpiRfChannelCount)
                        .push8(RX_CONFIG.fpvCamAngleDegrees);
                    if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                        buffer.push8(RX_CONFIG.rcInterpolationChannels)
                            .push8(RX_CONFIG.rcSmoothingType)
                            .push8(RX_CONFIG.rcSmoothingInputCutoff)
                            .push8(RX_CONFIG.rcSmoothingDerivativeCutoff)
                            .push8(RX_CONFIG.rcSmoothingInputType)
                            .push8(RX_CONFIG.rcSmoothingDerivativeType);
                        if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                            buffer.push8(RX_CONFIG.usbCdcHidType)
                                  .push8(RX_CONFIG.rcSmoothingAutoSmoothness);
                        }
                    }
                }
            }

            break;

        case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
            buffer.push8(FAILSAFE_CONFIG.failsafe_delay)
                .push8(FAILSAFE_CONFIG.failsafe_off_delay)
                .push16(FAILSAFE_CONFIG.failsafe_throttle);
            if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
                buffer.push8(FAILSAFE_CONFIG.failsafe_switch_mode)
                    .push16(FAILSAFE_CONFIG.failsafe_throttle_low_delay)
                    .push8(FAILSAFE_CONFIG.failsafe_procedure);
            }
            break;

        case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
            if (semver.gte(CONFIG.apiVersion, "1.33.0")) {
                buffer.push8(TRANSPONDER.provider); //
            }
            for (var i = 0; i < TRANSPONDER.data.length; i++) {
                buffer.push8(TRANSPONDER.data[i]);
            }
            break;

        case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
            for (var i = 0; i < SERVO_CONFIG.length; i++) {
                var out = SERVO_CONFIG[i].indexOfChannelToForward;
                if (out == undefined) {
                    out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
                }
                buffer.push8(out);
            }
            break;
        case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
            if (semver.lt(CONFIG.apiVersion, "1.6.0")) {

                for (var i = 0; i < SERIAL_CONFIG.ports.length; i++) {
                    buffer.push8(SERIAL_CONFIG.ports[i].scenario);
                }
                buffer.push32(SERIAL_CONFIG.mspBaudRate)
                    .push32(SERIAL_CONFIG.cliBaudRate)
                    .push32(SERIAL_CONFIG.gpsBaudRate)
                    .push32(SERIAL_CONFIG.gpsPassthroughBaudRate);
            } else {
                for (var i = 0; i < SERIAL_CONFIG.ports.length; i++) {
                    var serialPort = SERIAL_CONFIG.ports[i];

                    buffer.push8(serialPort.identifier);

                    var functionMask = self.serialPortFunctionsToMask(serialPort.functions);
                    buffer.push16(functionMask)
                        .push8(self.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                        .push8(self.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                        .push8(self.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                        .push8(self.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
                }
            }
            break;

        case MSPCodes.MSP_SET_MOTOR_3D_CONFIG:
            buffer.push16(MOTOR_3D_CONFIG.deadband3d_low)
                .push16(MOTOR_3D_CONFIG.deadband3d_high)
                .push16(MOTOR_3D_CONFIG.neutral);
            if (semver.lt(CONFIG.apiVersion, "1.17.0")) {
                buffer.push16(RC_DEADBAND_CONFIG.deadband3d_throttle);
            }
            break;

        case MSPCodes.MSP_SET_RC_DEADBAND:
            buffer.push8(RC_DEADBAND_CONFIG.deadband)
                .push8(RC_DEADBAND_CONFIG.yaw_deadband)
                .push8(RC_DEADBAND_CONFIG.alt_hold_deadband);
            if (semver.gte(CONFIG.apiVersion, "1.17.0")) {
                buffer.push16(RC_DEADBAND_CONFIG.deadband3d_throttle);
            }
            break;

        case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
            buffer.push8(SENSOR_ALIGNMENT.align_gyro)
                .push8(SENSOR_ALIGNMENT.align_acc)
                .push8(SENSOR_ALIGNMENT.align_mag);
            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                buffer.push8(SENSOR_ALIGNMENT.gyro_to_use)
                .push8(SENSOR_ALIGNMENT.gyro_1_align)
                .push8(SENSOR_ALIGNMENT.gyro_2_align);
            }
            break;
        case MSPCodes.MSP_SET_ADVANCED_CONFIG:
            buffer.push8(PID_ADVANCED_CONFIG.gyro_sync_denom)
                .push8(PID_ADVANCED_CONFIG.pid_process_denom)
                .push8(PID_ADVANCED_CONFIG.use_unsyncedPwm)
                .push8(self.reorderPwmProtocols(PID_ADVANCED_CONFIG.fast_pwm_protocol))
                .push16(PID_ADVANCED_CONFIG.motor_pwm_rate);
            if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
                buffer.push16(PID_ADVANCED_CONFIG.digitalIdlePercent * 100);

                if (semver.gte(CONFIG.apiVersion, "1.25.0")) {
                    let gyroUse32kHz = 0;
                    if (semver.lt(CONFIG.apiVersion, "1.41.0")) {
                        gyroUse32kHz = PID_ADVANCED_CONFIG.gyroUse32kHz;
                    }
                    buffer.push8(gyroUse32kHz);
                    if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                        buffer.push8(PID_ADVANCED_CONFIG.motorPwmInversion)
                              .push8(SENSOR_ALIGNMENT.gyro_to_use) // We don't want to double up on storing this state
                              .push8(PID_ADVANCED_CONFIG.gyroHighFsr)
                              .push8(PID_ADVANCED_CONFIG.gyroMovementCalibThreshold)
                              .push16(PID_ADVANCED_CONFIG.gyroCalibDuration)
                              .push16(PID_ADVANCED_CONFIG.gyroOffsetYaw)
                              .push8(PID_ADVANCED_CONFIG.gyroCheckOverflow)
                              .push8(PID_ADVANCED_CONFIG.debugMode);
                    }
                }
            }
            break;
        case MSPCodes.MSP_SET_FILTER_CONFIG:
            buffer.push8(FILTER_CONFIG.gyro_lowpass_hz)
                .push16(FILTER_CONFIG.dterm_lowpass_hz)
                .push16(FILTER_CONFIG.yaw_lowpass_hz);
            if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                buffer.push16(FILTER_CONFIG.gyro_notch_hz)
                    .push16(FILTER_CONFIG.gyro_notch_cutoff)
                    .push16(FILTER_CONFIG.dterm_notch_hz)
                    .push16(FILTER_CONFIG.dterm_notch_cutoff);
                if (semver.gte(CONFIG.apiVersion, "1.21.0")) {
                    buffer.push16(FILTER_CONFIG.gyro_notch2_hz)
                        .push16(FILTER_CONFIG.gyro_notch2_cutoff)
                }
                if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                    buffer.push8(FILTER_CONFIG.dterm_lowpass_type);
                }
                if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                    let gyro_32khz_hardware_lpf = 0;
                    if (semver.lt(CONFIG.apiVersion, "1.41.0")) {
                        gyro_32khz_hardware_lpf = FILTER_CONFIG.gyro_32khz_hardware_lpf;
                    }
                    buffer.push8(FILTER_CONFIG.gyro_hardware_lpf)
                          .push8(gyro_32khz_hardware_lpf)
                          .push16(FILTER_CONFIG.gyro_lowpass_hz)
                          .push16(FILTER_CONFIG.gyro_lowpass2_hz)
                          .push8(FILTER_CONFIG.gyro_lowpass_type)
                          .push8(FILTER_CONFIG.gyro_lowpass2_type)
                          .push16(FILTER_CONFIG.dterm_lowpass2_hz);
                }
                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                    buffer.push8(FILTER_CONFIG.dterm_lowpass2_type)
                          .push16(FILTER_CONFIG.gyro_lowpass_dyn_min_hz)
                          .push16(FILTER_CONFIG.gyro_lowpass_dyn_max_hz)
                          .push16(FILTER_CONFIG.dterm_lowpass_dyn_min_hz)
                          .push16(FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
                }
                if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                    buffer.push8(FILTER_CONFIG.dyn_notch_range)
                          .push8(FILTER_CONFIG.dyn_notch_width_percent)
                          .push16(FILTER_CONFIG.dyn_notch_q)
                          .push16(FILTER_CONFIG.dyn_notch_min_hz)
                          .push8(FILTER_CONFIG.gyro_rpm_notch_harmonics)
                          .push8(FILTER_CONFIG.gyro_rpm_notch_min_hz);
                }
            }
            break;
        case MSPCodes.MSP_SET_PID_ADVANCED:
            if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                buffer.push16(ADVANCED_TUNING.rollPitchItermIgnoreRate)
                    .push16(ADVANCED_TUNING.yawItermIgnoreRate)
                    .push16(ADVANCED_TUNING.yaw_p_limit)
                    .push8(ADVANCED_TUNING.deltaMethod)
                    .push8(ADVANCED_TUNING.vbatPidCompensation);

                if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                    buffer.push8(ADVANCED_TUNING.feedforwardTransition);
                } else {
                    buffer.push8(ADVANCED_TUNING.dtermSetpointTransition);
                }

                buffer.push8(Math.min(ADVANCED_TUNING.dtermSetpointWeight, 254))
                      .push8(ADVANCED_TUNING.toleranceBand)
                      .push8(ADVANCED_TUNING.toleranceBandReduction)
                      .push8(ADVANCED_TUNING.itermThrottleGain)
                      .push16(ADVANCED_TUNING.pidMaxVelocity)
                      .push16(ADVANCED_TUNING.pidMaxVelocityYaw);

                if (semver.gte(CONFIG.apiVersion, "1.24.0")) {
                    buffer.push8(ADVANCED_TUNING.levelAngleLimit)
                        .push8(ADVANCED_TUNING.levelSensitivity);

                    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                        buffer.push16(ADVANCED_TUNING.itermThrottleThreshold)
                            .push16(ADVANCED_TUNING.itermAcceleratorGain);

                        if (semver.gte(CONFIG.apiVersion, "1.39.0")) {
                            buffer.push16(ADVANCED_TUNING.dtermSetpointWeight);

                            if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                                buffer.push8(ADVANCED_TUNING.itermRotation)
                                      .push8(ADVANCED_TUNING.smartFeedforward)
                                      .push8(ADVANCED_TUNING.itermRelax)
                                      .push8(ADVANCED_TUNING.itermRelaxType)
                                      .push8(ADVANCED_TUNING.absoluteControlGain)
                                      .push8(ADVANCED_TUNING.throttleBoost)
                                      .push8(ADVANCED_TUNING.acroTrainerAngleLimit)
                                      .push16(ADVANCED_TUNING.feedforwardRoll)
                                      .push16(ADVANCED_TUNING.feedforwardPitch)
                                      .push16(ADVANCED_TUNING.feedforwardYaw)
                                      .push8(ADVANCED_TUNING.antiGravityMode);

                                if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                                    buffer.push8(ADVANCED_TUNING.dMinRoll)
                                          .push8(ADVANCED_TUNING.dMinPitch)
                                          .push8(ADVANCED_TUNING.dMinYaw)
                                          .push8(ADVANCED_TUNING.dMinGain)
                                          .push8(ADVANCED_TUNING.dMinAdvance)
                                          .push8(ADVANCED_TUNING.useIntegratedYaw)
                                          .push8(ADVANCED_TUNING.integratedYawRelax);
                                          
                                    if(semver.gte(CONFIG.apiVersion, "1.42.0")) {
                                        buffer.push8(ADVANCED_TUNING.itermRelaxCutoff);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // only supports 1 version pre bf 3.0
            else {
                buffer.push16(ADVANCED_TUNING.rollPitchItermIgnoreRate)
                   .push16(ADVANCED_TUNING.yawItermIgnoreRate)
                   .push16(ADVANCED_TUNING.yaw_p_limit)
                   .push8(ADVANCED_TUNING.deltaMethod)
                   .push8(ADVANCED_TUNING.vbatPidCompensation);
            }
            break;
        case MSPCodes.MSP_SET_SENSOR_CONFIG:
            buffer.push8(SENSOR_CONFIG.acc_hardware)
                .push8(SENSOR_CONFIG.baro_hardware)
                .push8(SENSOR_CONFIG.mag_hardware);
            break;

        case MSPCodes.MSP_SET_NAME:
            var MSP_BUFFER_SIZE = 64;
            for (var i = 0; i<CONFIG.name.length && i<MSP_BUFFER_SIZE; i++) {
                buffer.push8(CONFIG.name.charCodeAt(i));
            }
            break;

        case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
            buffer.push8(BLACKBOX.blackboxDevice)
                .push8(BLACKBOX.blackboxRateNum)
                .push8(BLACKBOX.blackboxRateDenom);
            if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
                buffer.push16(BLACKBOX.blackboxPDenom);
            }
            break;

        case MSPCodes.MSP_COPY_PROFILE:
            buffer.push8(COPY_PROFILE.type)
                .push8(COPY_PROFILE.dstProfile)
                .push8(COPY_PROFILE.srcProfile);
            break;
        case MSPCodes.MSP_ARMING_DISABLE:
            var value;
            if (CONFIG.armingDisabled) {
                value = 1;
            } else {
                value = 0;
            }
            buffer.push8(value);

            if (CONFIG.runawayTakeoffPreventionDisabled) {
                value = 1;
            } else {
                value = 0;
            }
            // This will be ignored if `armingDisabled` is true
            buffer.push8(value);

            break;
        case MSPCodes.MSP_SET_RTC:
            var now = new Date();

            if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
                var timestamp = now.getTime();
                var secs = timestamp / 1000;
                var millis = timestamp % 1000;
                buffer.push32(secs);
                buffer.push16(millis);
            } else {
                buffer.push16(now.getUTCFullYear());
                buffer.push8(now.getUTCMonth() + 1);
                buffer.push8(now.getUTCDate());
                buffer.push8(now.getUTCHours());
                buffer.push8(now.getUTCMinutes());
                buffer.push8(now.getUTCSeconds());
            }

            break;

        case MSPCodes.MSP_SET_VTX_CONFIG:

            buffer.push16(VTX_CONFIG.vtx_frequency)
                  .push8(VTX_CONFIG.vtx_power)
                  .push8(VTX_CONFIG.vtx_pit_mode ? 1 : 0)
                  .push8(VTX_CONFIG.vtx_low_power_disarm);

            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                buffer.push16(VTX_CONFIG.vtx_pit_mode_frequency)
                      .push8(VTX_CONFIG.vtx_band)
                      .push8(VTX_CONFIG.vtx_channel)
                      .push16(VTX_CONFIG.vtx_frequency)
                      .push8(VTX_CONFIG.vtx_table_bands)
                      .push8(VTX_CONFIG.vtx_table_channels)
                      .push8(VTX_CONFIG.vtx_table_powerlevels)
                      .push8(VTX_CONFIG.vtx_table_clear ? 1 : 0);
            }

            break;

        case MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL:

            buffer.push8(VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number)
                  .push16(VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value);

            buffer.push8(VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length);
            for (let i = 0; i < VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length; i++) {
                buffer.push8(VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.charCodeAt(i));
            }

            break;

        case MSPCodes.MSP_SET_VTXTABLE_BAND:

            buffer.push8(VTXTABLE_BAND.vtxtable_band_number);

            buffer.push8(VTXTABLE_BAND.vtxtable_band_name.length);
            for (let i = 0; i < VTXTABLE_BAND.vtxtable_band_name.length; i++) {
                buffer.push8(VTXTABLE_BAND.vtxtable_band_name.charCodeAt(i));
            }

            if (VTXTABLE_BAND.vtxtable_band_letter != '') {
                buffer.push8(VTXTABLE_BAND.vtxtable_band_letter.charCodeAt(0))
            } else {
                buffer.push8(' '.charCodeAt(0));
            }
            buffer.push8(VTXTABLE_BAND.vtxtable_band_is_factory_band ? 1 : 0);

            buffer.push8(VTXTABLE_BAND.vtxtable_band_frequencies.length);
            for (let i = 0; i < VTXTABLE_BAND.vtxtable_band_frequencies.length; i++) {
                buffer.push16(VTXTABLE_BAND.vtxtable_band_frequencies[i]);
            }

            break;

        case MSPCodes.MSP_MULTIPLE_MSP:

            while (MULTIPLE_MSP.msp_commands.length > 0) {

                let mspCommand = MULTIPLE_MSP.msp_commands.shift();

                self.mspMultipleCache.push(mspCommand);
                buffer.push8(mspCommand);
            }

            break;

        default:
            return false;
    }

    return buffer;
};

/**
 * Set raw Rx values over MSP protocol.
 *
 * Channels is an array of 16-bit unsigned integer channel values to be sent. 8 channels is probably the maximum.
 */
MspHelper.prototype.setRawRx = function(channels) {
    var buffer = [];

    for (var i = 0; i < channels.length; i++) {
        buffer.push16(channels[i]);
    }

    MSP.send_message(MSPCodes.MSP_SET_RAW_RC, buffer, false);
}

/**
 * Send a request to read a block of data from the dataflash at the given address and pass that address and a dataview
 * of the returned data to the given callback (or null for the data if an error occured).
 */
MspHelper.prototype.dataflashRead = function(address, blockSize, onDataCallback) {
    var outData = [address & 0xFF, (address >> 8) & 0xFF, (address >> 16) & 0xFF, (address >> 24) & 0xFF];

    if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
        outData = outData.concat([blockSize & 0xFF, (blockSize >> 8) & 0xFF]);
    }

    if (semver.gte(CONFIG.apiVersion, "1.36.0")) {
        // Allow compression
        outData = outData.concat([1]);
    }

    MSP.send_message(MSPCodes.MSP_DATAFLASH_READ, outData, false, function(response) {
        if (!response.crcError) {
            var chunkAddress = response.data.readU32();

            var headerSize = 4;
            var dataSize = response.data.buffer.byteLength - headerSize;
            var dataCompressionType = 0;
            if (semver.gte(CONFIG.apiVersion, "1.31.0")) {
                headerSize = headerSize + 3;
                dataSize = response.data.readU16();
                dataCompressionType = response.data.readU8();
            }

            // Verify that the address of the memory returned matches what the caller asked for and there was not a CRC error
            if (chunkAddress == address) {
                /* Strip that address off the front of the reply and deliver it separately so the caller doesn't have to
                 * figure out the reply format:
                 */
                if (dataCompressionType == 0) {
                    onDataCallback(address, new DataView(response.data.buffer, response.data.byteOffset + headerSize, dataSize));
                } else if (dataCompressionType == 1) {
                    // Read compressed char count to avoid decoding stray bit sequences as bytes
                    var compressedCharCount = response.data.readU16();

                    // Compressed format uses 2 additional bytes as a pseudo-header to denote the number of uncompressed bytes
                    var compressedArray = new Uint8Array(response.data.buffer, response.data.byteOffset + headerSize + 2, dataSize - 2);
                    var decompressedArray = huffmanDecodeBuf(compressedArray, compressedCharCount, defaultHuffmanTree, defaultHuffmanLenIndex);

                    onDataCallback(address, new DataView(decompressedArray.buffer), dataSize);
                }
            } else {
                // Report address error
                console.log('Expected address ' + address + ' but received ' + chunkAddress + ' - retrying');
                onDataCallback(address, null);  // returning null to the callback forces a retry
            }
        } else {
            // Report crc error
            console.log('CRC error for address ' + address + ' - retrying');
            onDataCallback(address, null);  // returning null to the callback forces a retry
        }
    }, true);
};

MspHelper.prototype.sendServoConfigurations = function(onCompleteCallback) {
    var nextFunction = send_next_servo_configuration;

    var servoIndex = 0;

    if (SERVO_CONFIG.length == 0) {
        onCompleteCallback();
    } else {
        nextFunction();
    }


    function send_next_servo_configuration() {

        var buffer = [];

        if (semver.lt(CONFIG.apiVersion, "1.12.0")) {
            // send all in one go
            // 1.9.0 had a bug where the MSP input buffer was too small, limit to 8.
            for (var i = 0; i < SERVO_CONFIG.length && i < 8; i++) {
                buffer.push16(SERVO_CONFIG[i].min)
                    .push16(SERVO_CONFIG[i].max)
                    .push16(SERVO_CONFIG[i].middle)
                    .push8(SERVO_CONFIG[i].rate);
            }
            nextFunction = send_channel_forwarding;
        } else {
            // send one at a time, with index

            var servoConfiguration = SERVO_CONFIG[servoIndex];

            buffer.push8(servoIndex)
                .push16(servoConfiguration.min)
                .push16(servoConfiguration.max)
                .push16(servoConfiguration.middle)
                .push8(servoConfiguration.rate);

            if (semver.lt(CONFIG.apiVersion, "1.33.0")) {
                buffer.push8(servoConfiguration.angleAtMin)
                    .push8(servoConfiguration.angleAtMax);
            }

            var out = servoConfiguration.indexOfChannelToForward;
            if (out == undefined) {
                out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
            }
            buffer.push8(out)
                .push32(servoConfiguration.reversedInputSources);

            // prepare for next iteration
            servoIndex++;
            if (servoIndex == SERVO_CONFIG.length) {
                nextFunction = onCompleteCallback;
            }
        }
        MSP.send_message(MSPCodes.MSP_SET_SERVO_CONFIGURATION, buffer, false, nextFunction);
    }

    function send_channel_forwarding() {
        var buffer = [];

        for (var i = 0; i < SERVO_CONFIG.length; i++) {
            var out = SERVO_CONFIG[i].indexOfChannelToForward;
            if (out == undefined) {
                out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
            }
            buffer.push8(out);
        }

        nextFunction = onCompleteCallback;

        MSP.send_message(MSPCodes.MSP_SET_CHANNEL_FORWARDING, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendModeRanges = function(onCompleteCallback) {
    var nextFunction = send_next_mode_range;

    var modeRangeIndex = 0;

    if (MODE_RANGES.length == 0) {
        onCompleteCallback();
    } else {
        send_next_mode_range();
    }

    function send_next_mode_range() {

        var modeRange = MODE_RANGES[modeRangeIndex];

        var buffer = [];
        buffer.push8(modeRangeIndex)
            .push8(modeRange.id)
            .push8(modeRange.auxChannelIndex)
            .push8((modeRange.range.start - 900) / 25)
            .push8((modeRange.range.end - 900) / 25);

        if (semver.gte(CONFIG.apiVersion, "1.41.0")) {
            var modeRangeExtra = MODE_RANGES_EXTRA[modeRangeIndex];
            
            buffer.push8(modeRangeExtra.modeLogic)
                .push8(modeRangeExtra.linkedTo);
        }

        // prepare for next iteration
        modeRangeIndex++;
        if (modeRangeIndex == MODE_RANGES.length) {
            nextFunction = onCompleteCallback;
        }
        MSP.send_message(MSPCodes.MSP_SET_MODE_RANGE, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendAdjustmentRanges = function(onCompleteCallback) {
    var nextFunction = send_next_adjustment_range;

    var adjustmentRangeIndex = 0;

    if (ADJUSTMENT_RANGES.length == 0) {
        onCompleteCallback();
    } else {
        send_next_adjustment_range();
    }


    function send_next_adjustment_range() {

        var adjustmentRange = ADJUSTMENT_RANGES[adjustmentRangeIndex];

        var buffer = [];
        buffer.push8(adjustmentRangeIndex)
            .push8(adjustmentRange.slotIndex)
            .push8(adjustmentRange.auxChannelIndex)
            .push8((adjustmentRange.range.start - 900) / 25)
            .push8((adjustmentRange.range.end - 900) / 25)
            .push8(adjustmentRange.adjustmentFunction)
            .push8(adjustmentRange.auxSwitchChannelIndex);

        // prepare for next iteration
        adjustmentRangeIndex++;
        if (adjustmentRangeIndex == ADJUSTMENT_RANGES.length) {
            nextFunction = onCompleteCallback;

        }
        MSP.send_message(MSPCodes.MSP_SET_ADJUSTMENT_RANGE, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendVoltageConfig = function(onCompleteCallback) {

    var nextFunction = send_next_voltage_config;

    var configIndex = 0;
    
    if (VOLTAGE_METER_CONFIGS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_voltage_config();
    }

    function send_next_voltage_config() {
        var buffer = [];

        buffer.push8(VOLTAGE_METER_CONFIGS[configIndex].id)
            .push8(VOLTAGE_METER_CONFIGS[configIndex].vbatscale)
            .push8(VOLTAGE_METER_CONFIGS[configIndex].vbatresdivval)
            .push8(VOLTAGE_METER_CONFIGS[configIndex].vbatresdivmultiplier);

        // prepare for next iteration
        configIndex++;
        if (configIndex == VOLTAGE_METER_CONFIGS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, buffer, false, nextFunction);
    }

}

MspHelper.prototype.sendCurrentConfig = function(onCompleteCallback) {

    var nextFunction = send_next_current_config;

    var configIndex = 0;
    
    if (CURRENT_METER_CONFIGS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_current_config();
    }

    function send_next_current_config() {
        var buffer = [];

        buffer.push8(CURRENT_METER_CONFIGS[configIndex].id)
            .push16(CURRENT_METER_CONFIGS[configIndex].scale)
            .push16(CURRENT_METER_CONFIGS[configIndex].offset);

        // prepare for next iteration
        configIndex++;
        if (configIndex == CURRENT_METER_CONFIGS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, buffer, false, nextFunction);
    }

}

MspHelper.prototype.sendLedStripConfig = function(onCompleteCallback) {

    var nextFunction = send_next_led_strip_config;

    var ledIndex = 0;

    if (LED_STRIP.length == 0) {
        onCompleteCallback();
    } else {
        send_next_led_strip_config();
    }

    function send_next_led_strip_config() {

        var led = LED_STRIP[ledIndex];
        var ledDirectionLetters =        ['n', 'e', 's', 'w', 'u', 'd'];      // in LSB bit order
        var ledFunctionLetters =         ['i', 'w', 'f', 'a', 't', 'r', 'c', 'g', 's', 'b', 'l']; // in LSB bit order
        var ledBaseFunctionLetters =     ['c', 'f', 'a', 'l', 's', 'g', 'r']; // in LSB bit
        if (semver.lt(CONFIG.apiVersion, "1.36.0")) {
            var ledOverlayLetters =      ['t', 'o', 'b', 'w', 'i', 'w']; // in LSB bit
        } else {
            var ledOverlayLetters =      ['t', 'o', 'b', 'v', 'i', 'w']; // in LSB bit
        }

        var buffer = [];

        buffer.push(ledIndex);

        if (semver.lt(CONFIG.apiVersion, "1.20.0")) {
            var directionMask = 0;
            for (var directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {
                var bitIndex = ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    directionMask = bit_set(directionMask, bitIndex);
                }
            }
            buffer.push16(directionMask);

            var functionMask = 0;
            for (var functionLetterIndex = 0; functionLetterIndex < led.functions.length; functionLetterIndex++) {
                var bitIndex = ledFunctionLetters.indexOf(led.functions[functionLetterIndex]);
                if (bitIndex >= 0) {
                    functionMask = bit_set(functionMask, bitIndex);
                }
            }
            buffer.push16(functionMask)

                .push8(led.x)
                .push8(led.y)

                .push8(led.color);
        } else {
            var mask = 0;

            mask |= (led.y << 0);
            mask |= (led.x << 4);

            for (var functionLetterIndex = 0; functionLetterIndex < led.functions.length; functionLetterIndex++) {
                var fnIndex = ledBaseFunctionLetters.indexOf(led.functions[functionLetterIndex]);
                if (fnIndex >= 0) {
                    mask |= (fnIndex << 8);
                    break;
                }
            }

            for (var overlayLetterIndex = 0; overlayLetterIndex < led.functions.length; overlayLetterIndex++) {
                var bitIndex = ledOverlayLetters.indexOf(led.functions[overlayLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 12);
                }
            }

            mask |= (led.color << 18);

            for (var directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {
                var bitIndex = ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 22);
                }
            }

            mask |= (0 << 28); // parameters


            buffer.push32(mask);
        }

        // prepare for next iteration
        ledIndex++;
        if (ledIndex == LED_STRIP.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_CONFIG, buffer, false, nextFunction);
    }
}

MspHelper.prototype.sendLedStripColors = function(onCompleteCallback) {
    if (LED_COLORS.length == 0) {
        onCompleteCallback();
    } else {
        var buffer = [];

        for (var colorIndex = 0; colorIndex < LED_COLORS.length; colorIndex++) {
            var color = LED_COLORS[colorIndex];

            buffer.push16(color.h)
                .push8(color.s)
                .push8(color.v);
        }
        MSP.send_message(MSPCodes.MSP_SET_LED_COLORS, buffer, false, onCompleteCallback);
    }
}

MspHelper.prototype.sendLedStripModeColors = function(onCompleteCallback) {

    var nextFunction = send_next_led_strip_mode_color;
    var index = 0;

    if (LED_MODE_COLORS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_led_strip_mode_color();
    }

    function send_next_led_strip_mode_color() {
        var buffer = [];

        var mode_color = LED_MODE_COLORS[index];

        buffer.push8(mode_color.mode)
            .push8(mode_color.direction)
            .push8(mode_color.color);

        // prepare for next iteration
        index++;
        if (index == LED_MODE_COLORS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_MODECOLOR, buffer, false, nextFunction);
    }
}

MspHelper.prototype.serialPortFunctionMaskToFunctions = function(functionMask) {
    var self = this;
    var functions = [];

    var keys = Object.keys(self.SERIAL_PORT_FUNCTIONS);
    for (var index = 0; index < keys.length; index++) {
        var key = keys[index];
        var bit = self.SERIAL_PORT_FUNCTIONS[key];
        if (bit_check(functionMask, bit)) {
            functions.push(key);
        }
    }
    return functions;
}

MspHelper.prototype.serialPortFunctionsToMask = function(functions) {
    var self = this;
    var mask = 0;

    var keys = Object.keys(self.SERIAL_PORT_FUNCTIONS);
    for (var index = 0; index < functions.length; index++) {
        var key = functions[index];
        var bitIndex = self.SERIAL_PORT_FUNCTIONS[key];
        if (bitIndex >= 0) {
            mask = bit_set(mask, bitIndex);
        }
    }
    return mask;
}

MspHelper.prototype.sendRxFailConfig = function(onCompleteCallback) {
    var nextFunction = send_next_rxfail_config;

    var rxFailIndex = 0;

    if (RXFAIL_CONFIG.length == 0) {
        onCompleteCallback();
    } else {
        send_next_rxfail_config();
    }

    function send_next_rxfail_config() {

        var rxFail = RXFAIL_CONFIG[rxFailIndex];

        var buffer = [];
        buffer.push8(rxFailIndex)
            .push8(rxFail.mode)
            .push16(rxFail.value);


        // prepare for next iteration
        rxFailIndex++;
        if (rxFailIndex == RXFAIL_CONFIG.length) {
            nextFunction = onCompleteCallback;

        }
        MSP.send_message(MSPCodes.MSP_SET_RXFAIL_CONFIG, buffer, false, nextFunction);
    }
}

MspHelper.prototype.setArmingEnabled = function(doEnable, disableRunawayTakeoffPrevention, onCompleteCallback) {
    if (semver.gte(CONFIG.apiVersion, "1.37.0") && (CONFIG.armingDisabled === doEnable || CONFIG.runawayTakeoffPreventionDisabled !== disableRunawayTakeoffPrevention)) {
        CONFIG.armingDisabled = !doEnable;
        CONFIG.runawayTakeoffPreventionDisabled = disableRunawayTakeoffPrevention;

        MSP.send_message(MSPCodes.MSP_ARMING_DISABLE, mspHelper.crunch(MSPCodes.MSP_ARMING_DISABLE), false, function () {
            if (doEnable) {
                GUI.log(i18n.getMessage('armingEnabled'));
                if (disableRunawayTakeoffPrevention) {
                    GUI.log(i18n.getMessage('runawayTakeoffPreventionDisabled'));
                } else {
                    GUI.log(i18n.getMessage('runawayTakeoffPreventionEnabled'));
                }
            } else {
                GUI.log(i18n.getMessage('armingDisabled'));
            }

            if (onCompleteCallback) {
                onCompleteCallback();
            }
        });
    } else {
        if (onCompleteCallback) {
            onCompleteCallback();
        }
    }
}

MSP.SDCARD_STATE_NOT_PRESENT = 0; //TODO, move these to better place
MSP.SDCARD_STATE_FATAL       = 1;
MSP.SDCARD_STATE_CARD_INIT   = 2;
MSP.SDCARD_STATE_FS_INIT     = 3;
MSP.SDCARD_STATE_READY       = 4;
