'use strict';

const INITIAL_CONFIG = {
    apiVersion:                       "0.0.0",
    flightControllerIdentifier:       '',
    flightControllerVersion:          '',
    version:                          0,
    buildInfo:                        '',
    multiType:                        0,
    msp_version:                      0, // not specified using semantic versioning
    capability:                       0,
    cycleTime:                        0,
    i2cError:                         0,
    cpuload:                          0,
    activeSensors:                    0,
    mode:                             0,
    profile:                          0,
    uid:                              [0, 0, 0],
    accelerometerTrims:               [0, 0],
    name:                             '',
    displayName:                      'JOE PILOT',
    numProfiles:                      3,
    rateProfile:                      0,
    boardType:                        0,
    armingDisableCount:               0,
    armingDisableFlags:               0,
    armingDisabled:                   false,
    runawayTakeoffPreventionDisabled: false,
    boardIdentifier:                  "",
    boardVersion:                     0,
    targetCapabilities:               0,
    targetName:                       "",
    boardName:                        "",
    manufacturerId:                   "",
    signature:                        [],
    mcuTypeId:                        255,
    configurationState:               0,
    sampleRateHz:                     0,
    configurationProblems:            0,
    hardwareName:                     '',
};

const INITIAL_ANALOG = {
    voltage:                    0,
    mAhdrawn:                   0,
    rssi:                       0,
    amperage:                   0,
    last_received_timestamp:    Date.now(), // FIXME this code lies, it's never been received at this point
};

const INITIAL_BATTERY_CONFIG = {
    vbatmincellvoltage:         0,
    vbatmaxcellvoltage:         0,
    vbatwarningcellvoltage:     0,
    capacity:                   0,
    voltageMeterSource:         0,
    currentMeterSource:         0,
};

const FC = {

    // define all the global variables that are uses to hold FC state
    // the default state must be defined inside the resetState() method
    ADJUSTMENT_RANGES: null,
    ADVANCED_TUNING: null,
    ADVANCED_TUNING_ACTIVE: null,
    ANALOG: {...INITIAL_CONFIG},
    ARMING_CONFIG: null,
    AUX_CONFIG: null,
    AUX_CONFIG_IDS: null,
    BATTERY_CONFIG: {...INITIAL_BATTERY_CONFIG},
    BATTERY_STATE: null,
    BEEPER_CONFIG: null,
    BF_CONFIG: null,          // Remove when we officialy retire BF 3.1
    BLACKBOX: null,
    BOARD_ALIGNMENT_CONFIG: null,
    // Shallow copy of original config and added getter
    // getter allows this to be used with simple dot notation
    // and bridges the vue and rest of the code
    CONFIG: {
        ...INITIAL_CONFIG,
        get hardwareName() {
            let name;
            if (this.targetName) {
                name = this.targetName;
            } else {
                name = this.boardIdentifier;
            }

            if (this.boardName && this.boardName !== name) {
                name = `${this.boardName}(${name})`;
            }

            if (this.manufacturerId) {
                name = `${this.manufacturerId}/${name}`;
            }

            return name;
        },
        set hardwareName(name) {
            // NOOP, can't really be set. Maybe implement some logic?
        },
    },
    COPY_PROFILE: null,
    CURRENT_METERS: null,
    CURRENT_METER_CONFIGS: null,
    DATAFLASH: null,
    DEFAULT: null,
    DEFAULT_PIDS: null,
    FAILSAFE_CONFIG: null,
    FC_CONFIG: null,
    FEATURE_CONFIG: null,
    FILTER_CONFIG: null,
    GPS_CONFIG: null,
    GPS_DATA: null,
    GPS_RESCUE: null,
    LED_COLORS: null,
    LED_MODE_COLORS: null,
    LED_STRIP: null,
    MISC: null, // DEPRECATED
    MIXER_CONFIG: null,
    MODE_RANGES: null,
    MODE_RANGES_EXTRA: null,
    MOTOR_3D_CONFIG: null,
    MOTOR_CONFIG: null,
    MOTOR_DATA: null,
    MOTOR_OUTPUT_ORDER: null,
    MOTOR_TELEMETRY_DATA: null,
    MULTIPLE_MSP: null,
    PID: null,
    PIDS_ACTIVE: null,
    PID_ADVANCED_CONFIG: null,
    PID_NAMES: null,
    PIDS: null,
    RC: null,
    RC_DEADBAND_CONFIG: null,
    RC_MAP: null,
    RC_TUNING: null,
    RSSI_CONFIG: null,
    RXFAIL_CONFIG: null,
    RX_CONFIG: null,
    SDCARD: null,
    SENSOR_ALIGNMENT: null,
    SENSOR_CONFIG: null,
    SENSOR_DATA: null,
    SERIAL_CONFIG: null,
    SERVO_CONFIG: null,
    SERVO_DATA: null,
    SERVO_RULES: null,
    TRANSPONDER: null,
    TUNING_SLIDERS: null,
    VOLTAGE_METERS: null,
    VOLTAGE_METER_CONFIGS: null,
    VTXTABLE_BAND: null,
    VTXTABLE_POWERLEVEL: null,
    VTX_CONFIG: null,
    VTX_DEVICE_STATUS: null,

    resetState () {
        // Using `Object.assign` instead of reassigning to
        // trigger the updates on the Vue side
        Object.assign(this.CONFIG, INITIAL_CONFIG);
        Object.assign(this.ANALOG, INITIAL_CONFIG);
        Object.assign(this.BATTERY_CONFIG, INITIAL_BATTERY_CONFIG);

        this.BF_CONFIG = {
            currentscale:               0,
            currentoffset:              0,
            currentmetertype:           0,
            batterycapacity:            0,
        };

        this.COPY_PROFILE = {
            type:                       0,
            dstProfile:                 0,
            srcProfile:                 0,
        };

        this.FEATURE_CONFIG = {
            features:                   0,
        };

        this.BEEPER_CONFIG = {
            beepers:                    0,
            dshotBeaconTone:            0,
            dshotBeaconConditions:      0,
        };

        this.MIXER_CONFIG = {
            mixer:                      0,
            reverseMotorDir:            0,
        };

        this.BOARD_ALIGNMENT_CONFIG = {
            roll:                       0,
            pitch:                      0,
            yaw:                        0,
        };

        this.LED_STRIP =                [];
        this.LED_COLORS =               [];
        this.LED_MODE_COLORS =          [];

        this.PID = {
            controller:                 0,
        };

        this.PID_NAMES =                [];
        this.PIDS_ACTIVE = Array.from({length: 10});
        this.PIDS = Array.from({length: 10});
        for (let i = 0; i < 10; i++) {
            this.PIDS_ACTIVE[i] = Array.from({length: 3});
            this.PIDS[i] = Array.from({length: 3});
        }

        this.RC_MAP = [];

        // defaults
        // roll, pitch, yaw, throttle, aux 1, ... aux n
        this.RC = {
            active_channels:            0,
            channels:                   Array.from({length: 32}),
        };

        this.RC_TUNING = {
            RC_RATE:                    0,
            RC_EXPO:                    0,
            roll_pitch_rate:            0, // pre 1.7 api only
            roll_rate:                  0,
            pitch_rate:                 0,
            yaw_rate:                   0,
            dynamic_THR_PID:            0,
            throttle_MID:               0,
            throttle_EXPO:              0,
            dynamic_THR_breakpoint:     0,
            RC_YAW_EXPO:                0,
            rcYawRate:                  0,
            rcPitchRate:                0,
            RC_PITCH_EXPO:              0,
            roll_rate_limit:            1998,
            pitch_rate_limit:           1998,
            yaw_rate_limit:             1998,
        };

        this.AUX_CONFIG =               [];
        this.AUX_CONFIG_IDS =           [];

        this.MODE_RANGES =              [];
        this.MODE_RANGES_EXTRA =        [];
        this.ADJUSTMENT_RANGES =        [];

        this.SERVO_CONFIG =             [];
        this.SERVO_RULES =              [];

        this.SERIAL_CONFIG = {
            ports:                      [],

            // pre 1.6 settings
            mspBaudRate:                0,
            gpsBaudRate:                0,
            gpsPassthroughBaudRate:     0,
            cliBaudRate:                0,
        };

        this.SENSOR_DATA = {
            gyroscope:                  [0, 0, 0],
            accelerometer:              [0, 0, 0],
            magnetometer:               [0, 0, 0],
            altitude:                   0,
            sonar:                      0,
            kinematics:                 [0.0, 0.0, 0.0],
            debug:                      [0, 0, 0, 0],
        };

        this.MOTOR_DATA =               Array.from({length: 8});
        this.SERVO_DATA =               Array.from({length: 8});

        this.MOTOR_TELEMETRY_DATA = {
            rpm:                        [0, 0, 0, 0, 0, 0, 0, 0],
            invalidPercent:             [0, 0, 0, 0, 0, 0, 0, 0],
            temperature:                [0, 0, 0, 0, 0, 0, 0, 0],
            voltage:                    [0, 0, 0, 0, 0, 0, 0, 0],
            current:                    [0, 0, 0, 0, 0, 0, 0, 0],
            consumption:                [0, 0, 0, 0, 0, 0, 0, 0],
        };

        this.GPS_DATA = {
            fix:                        0,
            numSat:                     0,
            lat:                        0,
            lon:                        0,
            alt:                        0,
            speed:                      0,
            ground_course:              0,
            distanceToHome:             0,
            ditectionToHome:            0,
            update:                     0,

            chn:                        [],
            svid:                       [],
            quality:                    [],
            cno:                        [],
        };


        this.VOLTAGE_METERS =           [];
        this.VOLTAGE_METER_CONFIGS =    [];
        this.CURRENT_METERS =           [];
        this.CURRENT_METER_CONFIGS =    [];

        this.BATTERY_STATE = {};
        this.BATTERY_CONFIG = {
            vbatmincellvoltage:         0,
            vbatmaxcellvoltage:         0,
            vbatwarningcellvoltage:     0,
            capacity:                   0,
            voltageMeterSource:         0,
            currentMeterSource:         0,
        };

        this.ARMING_CONFIG = {
            auto_disarm_delay:          0,
            disarm_kill_switch:         0,
            small_angle:                0,
        };

        this.FC_CONFIG = {
            loopTime:                   0,
        };

        this.MISC = {
            // DEPRECATED = only used to store values that are written back to the fc as-is, do NOT use for any other purpose
            failsafe_throttle:          0,
            gps_baudrate:               0,
            multiwiicurrentoutput:      0,
            placeholder2:               0,
            vbatscale:                  0,
            vbatmincellvoltage:         0,
            vbatmaxcellvoltage:         0,
            vbatwarningcellvoltage:     0,
            batterymetertype:           1, // 1=ADC, 2=ESC
        };
        this.MOTOR_CONFIG = {
            minthrottle:                0,
            maxthrottle:                0,
            mincommand:                 0,
            motor_count:                0,
            motor_poles:                0,
            use_dshot_telemetry:        false,
            use_esc_sensor:             false,
        };

        this.GPS_CONFIG = {
            provider:                   0,
            ublox_sbas:                 0,
            auto_config:                0,
            auto_baud:                  0,
            home_point_once:            0,
            ublox_use_galileo:          0,
        };

        this.RSSI_CONFIG = {
            channel:                    0,
        };

        this.MOTOR_3D_CONFIG = {
            deadband3d_low:             0,
            deadband3d_high:            0,
            neutral:                    0,
        };

        this.DATAFLASH = {
            ready:                      false,
            supported:                  false,
            sectors:                    0,
            totalSize:                  0,
            usedSize:                   0,
        };

        this.SDCARD = {
            supported:                  false,
            state:                      0,
            filesystemLastError:        0,
            freeSizeKB:                 0,
            totalSizeKB:                0,
        };

        this.BLACKBOX = {
            supported:                  false,
            blackboxDevice:             0,
            blackboxRateNum:            1,
            blackboxRateDenom:          1,
            blackboxPDenom:             0,
            blackboxSampleRate:         0,
        };

        this.TRANSPONDER = {
            supported:                  false,
            data:                       [],
            provider:                   0,
            providers:                  [],
        };

        this.RC_DEADBAND_CONFIG = {
            deadband:                   0,
            yaw_deadband:               0,
            alt_hold_deadband:          0,
            deadband3d_throttle:        0,
        };

        this.SENSOR_ALIGNMENT = {
            align_gyro:                 0,
            align_acc:                  0,
            align_mag:                  0,
            gyro_detection_flags:       0,
            gyro_to_use:                0,
            gyro_1_align:               0,
            gyro_2_align:               0,
        };

        this.PID_ADVANCED_CONFIG = {
            gyro_sync_denom:            0,
            pid_process_denom:          0,
            use_unsyncedPwm:            0,
            fast_pwm_protocol:          0,
            motor_pwm_rate:             0,
            digitalIdlePercent:         0,
            gyroUse32kHz:               0,
            motorPwmInversion:          0,
            gyroHighFsr:                0,
            gyroMovementCalibThreshold: 0,
            gyroCalibDuration:          0,
            gyroOffsetYaw:              0,
            gyroCheckOverflow:          0,
            debugMode:                  0,
            debugModeCount:             0,
        };

        this.FILTER_CONFIG = {
            gyro_hardware_lpf:          0,
            gyro_32khz_hardware_lpf:    0,
            gyro_lowpass_hz:            0,
            gyro_lowpass_dyn_min_hz:    0,
            gyro_lowpass_dyn_max_hz:    0,
            gyro_lowpass_type:          0,
            gyro_lowpass2_hz:           0,
            gyro_lowpass2_type:         0,
            gyro_notch_hz:              0,
            gyro_notch_cutoff:          0,
            gyro_notch2_hz:             0,
            gyro_notch2_cutoff:         0,
            dterm_lowpass_hz:           0,
            dterm_lowpass_dyn_min_hz:   0,
            dterm_lowpass_dyn_max_hz:   0,
            dterm_lowpass_type:         0,
            dterm_lowpass2_hz:          0,
            dterm_lowpass2_type:        0,
            dyn_lpf_curve_expo:         0,
            dterm_notch_hz:             0,
            dterm_notch_cutoff:         0,
            yaw_lowpass_hz:             0,
            dyn_notch_range:            0,
            dyn_notch_width_percent:    0,
            dyn_notch_q:                0,
            dyn_notch_min_hz:           0,
            dyn_notch_max_hz:           0,
            dyn_notch_count:            0,
            gyro_rpm_notch_harmonics:   0,
            gyro_rpm_notch_min_hz:      0,
        };

        this.ADVANCED_TUNING = {
            rollPitchItermIgnoreRate:   0,
            yawItermIgnoreRate:         0,
            yaw_p_limit:                0,
            deltaMethod:                0,
            vbatPidCompensation:        0,
            dtermSetpointTransition:    0,
            dtermSetpointWeight:        0,
            toleranceBand:              0,
            toleranceBandReduction:     0,
            itermThrottleGain:          0,
            pidMaxVelocity:             0,
            pidMaxVelocityYaw:          0,
            levelAngleLimit:            0,
            levelSensitivity:           0,
            itermThrottleThreshold:     0,
            itermAcceleratorGain:       0,
            itermRotation:              0,
            smartFeedforward:           0,
            itermRelax:                 0,
            itermRelaxType:             0,
            itermRelaxCutoff:           0,
            absoluteControlGain:        0,
            throttleBoost:              0,
            acroTrainerAngleLimit:      0,
            feedforwardRoll:            0,
            feedforwardPitch:           0,
            feedforwardYaw:             0,
            feedforwardTransition:      0,
            antiGravityMode:            0,
            dMinRoll:                   0,
            dMinPitch:                  0,
            dMinYaw:                    0,
            dMinGain:                   0,
            dMinAdvance:                0,
            useIntegratedYaw:           0,
            integratedYawRelax:         0,
            motorOutputLimit:           0,
            autoProfileCellCount:       0,
            idleMinRpm:                 0,
            feedforward_averaging:      0,
            feedforward_smooth_factor:  0,
            feedforward_boost:          0,
            vbat_sag_compensation:      0,
            thrustLinearization:        0,
        };
        this.ADVANCED_TUNING_ACTIVE = { ...this.ADVANCED_TUNING };

        this.SENSOR_CONFIG = {
            acc_hardware:               0,
            baro_hardware:              0,
            mag_hardware:               0,
        };

        this.RX_CONFIG = {
            serialrx_provider:            0,
            stick_max:                    0,
            stick_center:                 0,
            stick_min:                    0,
            spektrum_sat_bind:            0,
            rx_min_usec:                  0,
            rx_max_usec:                  0,
            rcInterpolation:              0,
            rcInterpolationInterval:      0,
            rcInterpolationChannels:      0,
            airModeActivateThreshold:     0,
            rxSpiProtocol:                0,
            rxSpiId:                      0,
            rxSpiRfChannelCount:          0,
            fpvCamAngleDegrees:           0,
            rcSmoothingType:              0,
            rcSmoothingSetpointCutoff:    0,
            rcSmoothingFeedforwardCutoff: 0,
            rcSmoothingInputType:         0,
            rcSmoothingDerivativeType:    0,
            rcSmoothingAutoFactor:        0,
            usbCdcHidType:                0,
            rcSmoothingMode:              0,
        };

        this.FAILSAFE_CONFIG = {
            failsafe_delay:                 0,
            failsafe_off_delay:             0,
            failsafe_throttle:              0,
            failsafe_switch_mode:           0,
            failsafe_throttle_low_delay:    0,
            failsafe_procedure:             0,
        };

        this.GPS_RESCUE = {
            angle:                          0,
            initialAltitudeM:               0,
            descentDistanceM:               0,
            rescueGroundspeed:              0,
            throttleMin:                    0,
            throttleMax:                    0,
            throttleHover:                  0,
            sanityChecks:                   0,
            minSats:                        0,
            ascendRate:                     0,
            descendRate:                    0,
            allowArmingWithoutFix:          0,
            altitudeMode:                   0,
            minRescueDth:                   0,
        };

        this.RXFAIL_CONFIG = [];

        this.VTX_CONFIG = {
            vtx_type:                       0,
            vtx_band:                       0,
            vtx_channel:                    0,
            vtx_power:                      0,
            vtx_pit_mode:                   false,
            vtx_frequency:                  0,
            vtx_device_ready:               false,
            vtx_low_power_disarm:           0,
            vtx_pit_mode_frequency:         0,
            vtx_table_available:            false,
            vtx_table_bands:                0,
            vtx_table_channels:             0,
            vtx_table_powerlevels:          0,
            vtx_table_clear:                false,
        };

        this.VTXTABLE_BAND = {
            vtxtable_band_number:           0,
            vtxtable_band_name:             '',
            vtxtable_band_letter:           '',
            vtxtable_band_is_factory_band:  false,
            vtxtable_band_frequencies:      [],
        };

        this.VTXTABLE_POWERLEVEL = {
            vtxtable_powerlevel_number:     0,
            vtxtable_powerlevel_value:      0,
            vtxtable_powerlevel_label:      0,
        };

        this.MOTOR_OUTPUT_ORDER =           [];

        this.MULTIPLE_MSP = {
            msp_commands:                   [],
        };

        this.DEFAULT = {
            gyro_lowpass_hz:                100,
            gyro_lowpass_dyn_min_hz:        150,
            gyro_lowpass_dyn_max_hz:        450,
            gyro_lowpass_type:              this.FILTER_TYPE_FLAGS.PT1,
            gyro_lowpass2_hz:               300,
            gyro_lowpass2_type:             this.FILTER_TYPE_FLAGS.PT1,
            gyro_notch_cutoff:              300,
            gyro_notch_hz:                  400,
            gyro_notch2_cutoff:             100,
            gyro_notch2_hz:                 200,
            gyro_rpm_notch_harmonics:         3,
            gyro_rpm_notch_min_hz:          100,
            dterm_lowpass_hz:               100,
            dterm_lowpass_dyn_min_hz:       150,
            dterm_lowpass_dyn_max_hz:       250,
            dyn_lpf_curve_expo:               5,
            dterm_lowpass_type:             this.FILTER_TYPE_FLAGS.PT1,
            dterm_lowpass2_hz:              150,
            dterm_lowpass2_type:            this.FILTER_TYPE_FLAGS.BIQUAD,
            dterm_notch_cutoff:             160,
            dterm_notch_hz:                 260,
            yaw_lowpass_hz:                 100,
            dyn_notch_q:                    120,
            dyn_notch_width_percent:          8,
            dyn_notch_count:                  3,
            dyn_notch_q_rpm:                250, // default with rpm filtering
            dyn_notch_width_percent_rpm:      0,
            dyn_notch_count_rpm:              1,
            dyn_notch_min_hz:               150,
            dyn_notch_max_hz:               600,
        };

        this.DEFAULT_PIDS = [
            42, 85, 35, 20, 90,
            46, 90, 38, 22, 95,
            30, 90,  0,  0, 90,
        ];

        this.VTX_DEVICE_STATUS = null;

        this.TUNING_SLIDERS = {
            slider_pids_mode:                   0,
            slider_master_multiplier:           0,
            slider_roll_pitch_ratio:            0,
            slider_i_gain:                      0,
            slider_pd_ratio:                    0,
            slider_pd_gain:                     0,
            slider_dmin_ratio:                  0,
            slider_feedforward_gain:            0,
            slider_dterm_filter:                0,
            slider_dterm_filter_multiplier:     0,
            slider_gyro_filter:                 0,
            slider_gyro_filter_multiplier:      0,
        };
    },

    getSerialRxTypes: () => {
        const apiVersion = FC.CONFIG.apiVersion;
        const flightControllerIdentifier = FC.CONFIG.flightControllerIdentifier;
        const flightControllerVersion = FC.CONFIG.flightControllerVersion;

        // defaults
        const serialRxTypes = [
            'SPEKTRUM1024',
            'SPEKTRUM2048',
            'SBUS',
            'SUMD',
            'SUMH',
            'XBUS_MODE_B',
            'XBUS_MODE_B_RJ01',
        ];

        if (semver.gte(apiVersion, "1.15.0")) {
            serialRxTypes.push('IBUS');
        }

        if ((flightControllerIdentifier === 'BTFL' && semver.gte(flightControllerVersion, "2.6.0")) ||
            (flightControllerIdentifier === 'CLFL' && semver.gte(apiVersion, API_VERSION_1_31))) {
                serialRxTypes.push('JETIEXBUS');
        }

        if (semver.gte(apiVersion, API_VERSION_1_31)) {
            serialRxTypes.push('CRSF');
        }

        if (semver.gte(apiVersion, "1.24.0")) {
            serialRxTypes.push('SPEKTRUM2048/SRXL');
        }

        if (semver.gte(apiVersion, API_VERSION_1_35)) {
            serialRxTypes.push('TARGET_CUSTOM');
        }

        if (semver.gte(apiVersion, API_VERSION_1_37)) {
            serialRxTypes.push('FrSky FPort');
        }

        if (semver.gte(apiVersion, API_VERSION_1_42)) {
            serialRxTypes.push('SPEKTRUM SRXL2');
        }

        if (semver.gte(apiVersion, API_VERSION_1_44)) {
            serialRxTypes.push('IRC GHOST');
        }

        return serialRxTypes;
    },

    getHardwareName() {
        let name;
        if (this.CONFIG.targetName) {
            name = this.CONFIG.targetName;
        } else {
            name = this.CONFIG.boardIdentifier;
        }

        if (this.CONFIG.boardName && this.CONFIG.boardName !== name) {
            name = `${this.CONFIG.boardName}(${name})`;
        }

        if (this.CONFIG.manufacturerId) {
            name = `${this.CONFIG.manufacturerId}/${name}`;
        }

        return name;
    },


    MCU_TYPES: {
        0: "SIMULATOR",
        1: "F103",
        2: "F303",
        3: "F40X",
        4: "F411",
        5: "F446",
        6: "F722",
        7: "F745",
        8: "F746",
        9: "F765",
        255: "Unknown MCU",
    },

    getMcuType() {
        return this.MCU_TYPES[this.CONFIG.mcuTypeId];
    },

    CONFIGURATION_STATES: {
        DEFAULTS_BARE: 0,
        DEFAULTS_CUSTOM: 1,
        CONFIGURED: 2,
    },

    TARGET_CAPABILITIES_FLAGS: {
        HAS_VCP: 0,
        HAS_SOFTSERIAL: 1,
        IS_UNIFIED: 2,
        HAS_FLASH_BOOTLOADER: 3,
        SUPPORTS_CUSTOM_DEFAULTS: 4,
        HAS_CUSTOM_DEFAULTS: 5,
        SUPPORTS_RX_BIND: 6,
    },

    CONFIGURATION_PROBLEM_FLAGS: {
        ACC_NEEDS_CALIBRATION: 0,
        MOTOR_PROTOCOL_DISABLED: 1,
    },

    boardHasVcp() {
        let hasVcp = false;
        if (semver.gte(this.CONFIG.apiVersion, API_VERSION_1_37)) {
            hasVcp = bit_check(this.CONFIG.targetCapabilities, this.TARGET_CAPABILITIES_FLAGS.HAS_VCP);
        } else {
            hasVcp = BOARD.find_board_definition(this.CONFIG.boardIdentifier).vcp;
        }

        return hasVcp;
    },

    FILTER_TYPE_FLAGS: {
        PT1: 0,
        BIQUAD: 1,
    },

    getFilterDefaults() {
        const versionFilterDefaults = this.DEFAULT;

        if (semver.eq(this.CONFIG.apiVersion, API_VERSION_1_40)) {
            versionFilterDefaults.dterm_lowpass2_hz = 200;
        } else if (semver.gte(this.CONFIG.apiVersion, API_VERSION_1_41)) {
            versionFilterDefaults.gyro_lowpass_hz = 150;
            versionFilterDefaults.gyro_lowpass_type = this.FILTER_TYPE_FLAGS.BIQUAD;
            versionFilterDefaults.gyro_lowpass2_hz = 0;
            versionFilterDefaults.gyro_lowpass2_type = this.FILTER_TYPE_FLAGS.BIQUAD;
            versionFilterDefaults.dterm_lowpass_hz = 150;
            versionFilterDefaults.dterm_lowpass_type = this.FILTER_TYPE_FLAGS.BIQUAD;
            versionFilterDefaults.dterm_lowpass2_hz = 150;
            versionFilterDefaults.dterm_lowpass2_type = this.FILTER_TYPE_FLAGS.BIQUAD;
            if (semver.gte(this.CONFIG.apiVersion, API_VERSION_1_42)) {
                versionFilterDefaults.gyro_lowpass_hz = 200;
                versionFilterDefaults.gyro_lowpass_dyn_min_hz = 200;
                versionFilterDefaults.gyro_lowpass_dyn_max_hz = 500;
                versionFilterDefaults.gyro_lowpass_type = this.FILTER_TYPE_FLAGS.PT1;
                versionFilterDefaults.gyro_lowpass2_hz = 250;
                versionFilterDefaults.gyro_lowpass2_type = this.FILTER_TYPE_FLAGS.PT1;
                versionFilterDefaults.dterm_lowpass_hz = 150;
                versionFilterDefaults.dterm_lowpass_dyn_min_hz = 70;
                versionFilterDefaults.dterm_lowpass_dyn_max_hz = 170;
                versionFilterDefaults.dterm_lowpass_type = this.FILTER_TYPE_FLAGS.PT1;
                versionFilterDefaults.dterm_lowpass2_hz = 150;
                versionFilterDefaults.dterm_lowpass2_type = this.FILTER_TYPE_FLAGS.PT1;
            }
            if (semver.gte(this.CONFIG.apiVersion, API_VERSION_1_44)) {
                versionFilterDefaults.dyn_notch_q_rpm = 500;
                versionFilterDefaults.dyn_notch_q = 300;
            }
        }
        return versionFilterDefaults;
    },

    getPidDefaults() {
        let versionPidDefaults = this.DEFAULT_PIDS;
        // if defaults change they should go here
        if (semver.gte(this.CONFIG.apiVersion, API_VERSION_1_43)) {
            versionPidDefaults = [
                42, 85, 35, 23, 90,
                46, 90, 38, 25, 95,
                45, 90,  0,  0, 90,
            ];
        }
        return versionPidDefaults;
    },
};
