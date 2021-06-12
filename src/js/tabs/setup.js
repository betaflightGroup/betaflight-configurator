import { i18n } from '../localization';

const setup = {
    yaw_fix: 0.0
};

setup.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != 'setup') {
        GUI.active_tab = 'setup';
    }

    function load_status() {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_mixer_config);
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/setup.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_ACC_TRIM, false, false, load_status);

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        const backupButton = $('#content .backup');

        if (semver.lt(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MIN_SUPPORTED_BACKUP_RESTORE)) {
            backupButton.addClass('disabled');
            $('#content .restore').addClass('disabled');

            GUI.log(i18n.getMessage('initialSetupBackupAndRestoreApiVersion', [FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MIN_SUPPORTED_BACKUP_RESTORE]));
        }

        // saving and uploading an imaginary config to hardware is a bad idea
        if (CONFIGURATOR.virtualMode) {
            backupButton.addClass('disabled');
        }

        // initialize 3D Model
        self.initModel();

        // set roll in interactive block
        $('span.roll').text(i18n.getMessage('initialSetupAttitude', [0]));
        // set pitch in interactive block
        $('span.pitch').text(i18n.getMessage('initialSetupAttitude', [0]));
        // set heading in interactive block
        $('span.heading').text(i18n.getMessage('initialSetupAttitude', [0]));

        // check if we have accelerometer and magnetometer
        if (!have_sensor(FC.CONFIG.activeSensors, 'acc')) {
            $('a.calibrateAccel').addClass('disabled');
            $('default_btn').addClass('disabled');
        }

        if (!have_sensor(FC.CONFIG.activeSensors, 'mag')) {
            $('a.calibrateMag').addClass('disabled');
            $('default_btn').addClass('disabled');
        }

        self.initializeInstruments();

        $('#arming-disable-flag').attr('title', i18n.getMessage('initialSetupArmingDisableFlagsTooltip'));

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
            if (isExpertModeEnabled()) {
                $('.initialSetupRebootBootloader').show();
            } else {
                $('.initialSetupRebootBootloader').hide();
            }

            $('a.rebootBootloader').click(function () {
                const buffer = [];
                buffer.push(mspHelper.REBOOT_TYPES.BOOTLOADER);
                MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
            });
        } else {
            $('.initialSetupRebootBootloader').hide();
        }

        // UI Hooks
        $('a.calibrateAccel').click(function () {
            const _self = $(this);

            if (!_self.hasClass('calibrating')) {
                _self.addClass('calibrating');

                // During this period MCU won't be able to process any serial commands because its locked in a for/while loop
                // until this operation finishes, sending more commands through data_poll() will result in serial buffer overflow
                GUI.interval_pause('setup_data_pull');
                MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, function () {
                    GUI.log(i18n.getMessage('initialSetupAccelCalibStarted'));
                    $('#accel_calib_running').show();
                    $('#accel_calib_rest').hide();
                });

                GUI.timeout_add('button_reset', function () {
                    GUI.interval_resume('setup_data_pull');

                    GUI.log(i18n.getMessage('initialSetupAccelCalibEnded'));
                    _self.removeClass('calibrating');
                    $('#accel_calib_running').hide();
                    $('#accel_calib_rest').show();
                }, 2000);
            }
        });

        $('a.calibrateMag').click(function () {
            const _self = $(this);

            if (!_self.hasClass('calibrating') && !_self.hasClass('disabled')) {
                _self.addClass('calibrating');

                MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false, function () {
                    GUI.log(i18n.getMessage('initialSetupMagCalibStarted'));
                    $('#mag_calib_running').show();
                    $('#mag_calib_rest').hide();
                });

                GUI.timeout_add('button_reset', function () {
                    GUI.log(i18n.getMessage('initialSetupMagCalibEnded'));
                    _self.removeClass('calibrating');
                    $('#mag_calib_running').hide();
                    $('#mag_calib_rest').show();
                }, 30000);
            }
        });

        const dialogConfirmReset = $('.dialogConfirmReset')[0];

        $('a.resetSettings').click(function () {
            dialogConfirmReset.showModal();
        });

        $('.dialogConfirmReset-cancelbtn').click(function() {
            dialogConfirmReset.close();
        });

        $('.dialogConfirmReset-confirmbtn').click(function() {
            dialogConfirmReset.close();
            MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
                GUI.log(i18n.getMessage('initialSetupSettingsRestored'));

                GUI.tab_switch_cleanup(function () {
                    TABS.setup.initialize();
                });
            });
        });

        // display current yaw fix value (important during tab re-initialization)
        $('div#interactive_block > a.reset').text(i18n.getMessage('initialSetupButtonResetZaxisValue', [self.yaw_fix]));

        // reset yaw button hook
        $('div#interactive_block > a.reset').click(function () {
            self.yaw_fix = FC.SENSOR_DATA.kinematics[2] * - 1.0;
            $(this).text(i18n.getMessage('initialSetupButtonResetZaxisValue', [self.yaw_fix]));

            console.log(`YAW reset to 0 deg, fix: ${self.yaw_fix} deg`);
        });

        backupButton.click(function () {
            if ($(this).hasClass('disabled')) {
                return;
            }

            configuration_backup(function () {
                GUI.log(i18n.getMessage('initialSetupBackupSuccess'));
            });
        });

        $('#content .restore').click(function () {
            if ($(this).hasClass('disabled')) {
                return;
            }

            configuration_restore(function () {
                // get latest settings
                TABS.setup.initialize();

                GUI.log(i18n.getMessage('initialSetupRestoreSuccess'));
            });
        });

        // cached elements
        const bat_voltage_e = $('.bat-voltage'),
            bat_mah_drawn_e = $('.bat-mah-drawn'),
            bat_mah_drawing_e = $('.bat-mah-drawing'),
            rssi_e = $('.rssi'),
            arming_disable_flags_e = $('.arming-disable-flags'),
            gpsFix_e = $('.gpsFix'),
            gpsSats_e = $('.gpsSats'),
            gpsLat_e = $('.gpsLat'),
            gpsLon_e = $('.gpsLon'),
            roll_e = $('dd.roll'),
            pitch_e = $('dd.pitch'),
            heading_e = $('dd.heading');

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            arming_disable_flags_e.hide();
        }

        // DISARM FLAGS
        // We add all the arming/disarming flags available, and show/hide them if needed.
        const prepareDisarmFlags = function() {

            let disarmFlagElements = [
                'NO_GYRO',
                'FAILSAFE',
                'RX_FAILSAFE',
                'BAD_RX_RECOVERY',
                'BOXFAILSAFE',
                'THROTTLE',
                'ANGLE',
                'BOOT_GRACE_TIME',
                'NOPREARM',
                'LOAD',
                'CALIBRATING',
                'CLI',
                'CMS_MENU',
                'OSD_MENU',
                'BST',
                'MSP',
            ];

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_38)) {
                disarmFlagElements.splice(disarmFlagElements.indexOf('THROTTLE'), 0, 'RUNAWAY_TAKEOFF');
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
                disarmFlagElements = disarmFlagElements.concat(['PARALYZE',
                                                                'GPS']);
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                disarmFlagElements.splice(disarmFlagElements.indexOf('OSD_MENU'), 1);
                disarmFlagElements = disarmFlagElements.concat(['RESC']);
                disarmFlagElements = disarmFlagElements.concat(['RPMFILTER']);
            }
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                disarmFlagElements.splice(disarmFlagElements.indexOf('THROTTLE'), 0, 'CRASH');
                disarmFlagElements = disarmFlagElements.concat(['REBOOT_REQD',
                                                                'DSHOT_BBANG']);
            }
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                disarmFlagElements = disarmFlagElements.concat(['NO_ACC_CAL', 'MOTOR_PROTO']);
            }

            // Always the latest element
            disarmFlagElements = disarmFlagElements.concat(['ARM_SWITCH']);

            // Arming allowed flag
            arming_disable_flags_e.append('<span id="initialSetupArmingAllowed" i18n="initialSetupArmingAllowed" style="display: none;"></span>');

            // Arming disabled flags
            for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {

                // All the known elements but the ARM_SWITCH (it must be always the last element)
                if (i < disarmFlagElements.length - 1) {
                    arming_disable_flags_e.append('<span id="initialSetupArmingDisableFlags' + i + '" class="cf_tip disarm-flag" title="' + i18n.getMessage('initialSetupArmingDisableFlagsTooltip' + disarmFlagElements[i]) + '" style="display: none;">' + disarmFlagElements[i] + '</span>');

                // The ARM_SWITCH, always the last element
                } else if (i == FC.CONFIG.armingDisableCount - 1) {
                    arming_disable_flags_e.append('<span id="initialSetupArmingDisableFlags' + i + '" class="cf_tip disarm-flag" title="' + i18n.getMessage('initialSetupArmingDisableFlagsTooltipARM_SWITCH') + '" style="display: none;">ARM_SWITCH</span>');

                // Unknown disarm flags
                } else {
                    arming_disable_flags_e.append('<span id="initialSetupArmingDisableFlags' + i + '" class="disarm-flag" style="display: none;">' + (i + 1) + '</span>');
                }
            }
        };

        prepareDisarmFlags();

        function get_slow_data() {

            MSP.send_message(MSPCodes.MSP_STATUS, false, false, function() {

                $('#initialSetupArmingAllowed').toggle(FC.CONFIG.armingDisableFlags == 0);

                for (let i = 0; i < FC.CONFIG.armingDisableCount; i++) {
                    $('#initialSetupArmingDisableFlags'+i).css('display',(FC.CONFIG.armingDisableFlags & (1 << i)) == 0 ? 'none':'inline-block');
                }

            });

            MSP.send_message(MSPCodes.MSP_ANALOG, false, false, function () {
                bat_voltage_e.text(i18n.getMessage('initialSetupBatteryValue', [FC.ANALOG.voltage]));
                bat_mah_drawn_e.text(i18n.getMessage('initialSetupBatteryMahValue', [FC.ANALOG.mAhdrawn]));
                bat_mah_drawing_e.text(i18n.getMessage('initialSetupBatteryAValue', [FC.ANALOG.amperage.toFixed(2)]));
                rssi_e.text(i18n.getMessage('initialSetupRSSIValue', [((FC.ANALOG.rssi / 1023) * 100).toFixed(0)]));
            });

            if (have_sensor(FC.CONFIG.activeSensors, 'gps')) {
                MSP.send_message(MSPCodes.MSP_RAW_GPS, false, false, function () {
                    gpsFix_e.html((FC.GPS_DATA.fix) ? i18n.getMessage('gpsFixTrue') : i18n.getMessage('gpsFixFalse'));
                    gpsSats_e.text(FC.GPS_DATA.numSat);
                    gpsLat_e.text((FC.GPS_DATA.lat / 10000000).toFixed(4) + ' deg');
                    gpsLon_e.text((FC.GPS_DATA.lon / 10000000).toFixed(4) + ' deg');
                });
            }
        }

        function get_fast_data() {
            MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, function () {
                roll_e.text(i18n.getMessage('initialSetupAttitude', [FC.SENSOR_DATA.kinematics[0]]));
                pitch_e.text(i18n.getMessage('initialSetupAttitude', [FC.SENSOR_DATA.kinematics[1]]));
                heading_e.text(i18n.getMessage('initialSetupAttitude', [FC.SENSOR_DATA.kinematics[2]]));

                self.renderModel();
                self.updateInstruments();
            });
        }

        GUI.interval_add('setup_data_pull_fast', get_fast_data, 33, true); // 30 fps
        GUI.interval_add('setup_data_pull_slow', get_slow_data, 250, true); // 4 fps

        GUI.content_ready(callback);
    }
};

setup.initializeInstruments = function() {
    const options = {size:90, showBox : false, img_directory: 'images/flightindicators/'};
    const attitude = $.flightIndicator('#attitude', 'attitude', options);
    const heading = $.flightIndicator('#heading', 'heading', options);

    this.updateInstruments = function() {
        attitude.setRoll(FC.SENSOR_DATA.kinematics[0]);
        attitude.setPitch(FC.SENSOR_DATA.kinematics[1]);
        heading.setHeading(FC.SENSOR_DATA.kinematics[2]);
    };
};

setup.initModel = function () {
    this.model = new Model($('.model-and-info #canvas_wrapper'), $('.model-and-info #canvas'));

    $(window).on('resize', $.proxy(this.model.resize, this.model));
};

setup.renderModel = function () {
    const x = (FC.SENSOR_DATA.kinematics[1] * -1.0) * 0.017453292519943295,
        y = ((FC.SENSOR_DATA.kinematics[2] * -1.0) - this.yaw_fix) * 0.017453292519943295,
        z = (FC.SENSOR_DATA.kinematics[0] * -1.0) * 0.017453292519943295;

    this.model.rotateTo(x, y, z);
};

setup.cleanup = function (callback) {
    if (this.model) {
        $(window).off('resize', $.proxy(this.model.resize, this.model));
        this.model.dispose();
    }

    if (callback) callback();
};

// TODO: remove once all tabs are modules
window.TABS.setup = setup;

export { setup };
