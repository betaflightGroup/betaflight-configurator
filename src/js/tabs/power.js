import semver from 'semver';
import { i18n } from '../localization';

const power = {
    supported: false,
    analyticsChanges: {},
};

power.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != 'power') {
        GUI.active_tab = 'power';
        // Disabled on merge into betaflight-configurator
        //googleAnalytics.sendAppView('Power');
    }

    if (GUI.calibrationManager) {
        GUI.calibrationManager.destroy();
    }
    if (GUI.calibrationManagerConfirmation) {
        GUI.calibrationManagerConfirmation.destroy();
    }

    function load_status() {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_voltage_meters);
    }

    function load_voltage_meters() {
        MSP.send_message(MSPCodes.MSP_VOLTAGE_METERS, false, false, load_current_meters);
    }

    function load_current_meters() {
        MSP.send_message(MSPCodes.MSP_CURRENT_METERS, false, false, load_current_meter_configs);
    }

    function load_current_meter_configs() {
        MSP.send_message(MSPCodes.MSP_CURRENT_METER_CONFIG, false, false, load_voltage_meter_configs);
    }

    function load_voltage_meter_configs() {
        MSP.send_message(MSPCodes.MSP_VOLTAGE_METER_CONFIG, false, false, load_battery_state);
    }

    function load_battery_state() {
        MSP.send_message(MSPCodes.MSP_BATTERY_STATE, false, false, load_battery_config);
    }

    function load_battery_config() {
        MSP.send_message(MSPCodes.MSP_BATTERY_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/power.html", process_html);
    }

    this.supported = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_33);

    if (!this.supported) {
        load_html();
    } else {
        load_status();
    }

    function updateDisplay(voltageDataSource, currentDataSource) {
        // voltage meters

        if (FC.BATTERY_CONFIG.voltageMeterSource == 0) {
            $('.boxVoltageConfiguration').hide();
        } else {
            $('.boxVoltageConfiguration').show();
        }

        if (!voltageDataSource) {
            voltageDataSource = [];
            for (let index = 0; index < FC.VOLTAGE_METER_CONFIGS.length; index++) {
                voltageDataSource[index] = {
                    vbatscale: parseInt($(`input[name="vbatscale-${index}"]`).val()),
                    vbatresdivval: parseInt($(`input[name="vbatresdivval-${index}"]`).val()),
                    vbatresdivmultiplier: parseInt($(`input[name="vbatresdivmultiplier-${index}"]`).val())
                };
            }
        }

        const templateVoltageMeter = $('#tab-power-templates .voltage-meters .voltage-meter');
        const destinationVoltageMeter = $('.tab-power .voltage-meters');
        destinationVoltageMeter.empty();
        for (let index = 0; index < FC.VOLTAGE_METERS.length; index++) {
            const elementVoltageMeter = templateVoltageMeter.clone();
            $(elementVoltageMeter).attr('id', `voltage-meter-${index}`);

            const message = i18n.getMessage('powerVoltageId' + FC.VOLTAGE_METERS[index].id);
            $(elementVoltageMeter).find('.label').text(message);
            destinationVoltageMeter.append(elementVoltageMeter);

            elementVoltageMeter.hide();
            if ((FC.BATTERY_CONFIG.voltageMeterSource == 1 && FC.VOLTAGE_METERS[index].id == 10)  // TODO: replace hardcoded constants
                || (FC.BATTERY_CONFIG.voltageMeterSource == 2 && FC.VOLTAGE_METERS[index].id >= 50)) {
                elementVoltageMeter.show();
            }
        }

        const templateVoltageConfiguration = $('#tab-power-templates .voltage-configuration');
        for (let index = 0; index < FC.VOLTAGE_METER_CONFIGS.length; index++) {
            const destinationVoltageConfiguration = $(`#voltage-meter-${index} .configuration`);
            const elementVoltageConfiguration = templateVoltageConfiguration.clone();

            const attributeNames = ["vbatscale", "vbatresdivval", "vbatresdivmultiplier"];
            for (let attributeName of attributeNames) {
                $(elementVoltageConfiguration).find(`input[name="${attributeName}"]`).attr('name', attributeName + '-' + index);
            }
            destinationVoltageConfiguration.append(elementVoltageConfiguration);

            $(`input[name="vbatscale-${index}"]`).val(voltageDataSource[index].vbatscale);
            $(`input[name="vbatresdivval-${index}"]`).val(voltageDataSource[index].vbatresdivval);
            $(`input[name="vbatresdivmultiplier-${index}"]`).val(voltageDataSource[index].vbatresdivmultiplier);
        }

        $('input[name="vbatscale-0"]').change(function () {
            const value = parseInt($(this).val());

            if (value !== voltageDataSource[0].vbatscale) {
                self.analyticsChanges['PowerVBatUpdated'] = value;
            }
        });

        // amperage meters
        if (FC.BATTERY_CONFIG.currentMeterSource == 0) {
            $('.boxAmperageConfiguration').hide();
        } else {
            $('.boxAmperageConfiguration').show();
        }

        if (!currentDataSource) {
            currentDataSource = [];
            for (let index = 0; index < FC.CURRENT_METER_CONFIGS.length; index++) {
                currentDataSource[index] = {
                    scale: parseInt($(`input[name="amperagescale-${index}"]`).val()),
                    offset: parseInt($(`input[name="amperageoffset-${index}"]`).val()),
                };
            }
        }
        const templateAmperageMeter = $('#tab-power-templates .amperage-meters .amperage-meter');
        const destinationAmperageMeter = $('.tab-power .amperage-meters');
        destinationAmperageMeter.empty();
        for (let index = 0; index < FC.CURRENT_METERS.length; index++) {
            const elementAmperageMeter = templateAmperageMeter.clone();
            $(elementAmperageMeter).attr('id', `amperage-meter-${index}`);

            const message = i18n.getMessage('powerAmperageId' + FC.CURRENT_METERS[index].id);
            $(elementAmperageMeter).find('.label').text(message);
            destinationAmperageMeter.append(elementAmperageMeter);

            elementAmperageMeter.hide();
            if ((FC.BATTERY_CONFIG.currentMeterSource == 1 && FC.CURRENT_METERS[index].id == 10)              // TODO: replace constants
                || (FC.BATTERY_CONFIG.currentMeterSource == 2 && FC.CURRENT_METERS[index].id == 80)
                || (FC.BATTERY_CONFIG.currentMeterSource == 3 && FC.CURRENT_METERS[index].id >= 50 && FC.CURRENT_METERS[index].id < 80)) {
                    elementAmperageMeter.show();
            }
        }

        const templateAmperageConfiguration = $('#tab-power-templates .amperage-configuration');
        for (let index = 0; index < FC.CURRENT_METER_CONFIGS.length; index++) {
            const destinationAmperageConfiguration = $(`#amperage-meter-${index} .configuration`);
            const elementAmperageConfiguration = templateAmperageConfiguration.clone();

            const attributeNames = ["amperagescale", "amperageoffset"];
            for (let attributeName of attributeNames) {
                $(elementAmperageConfiguration).find(`input[name="${attributeName}"]`).attr('name', `${attributeName}-${index}`);
            }
            destinationAmperageConfiguration.append(elementAmperageConfiguration);

            $(`input[name="amperagescale-${index}"]`).val(currentDataSource[index].scale);
            $(`input[name="amperageoffset-${index}"]`).val(currentDataSource[index].offset);
        }

        $('input[name="amperagescale-0"]').change(function () {
            if (FC.BATTERY_CONFIG.currentMeterSource === 1) {
                let value = parseInt($(this).val());

                if (value !== currentDataSource[0].scale) {
                    self.analyticsChanges['PowerAmperageUpdated'] = value;
                }
            }
        });

        $('input[name="amperagescale-1"]').change(function () {
            if (FC.BATTERY_CONFIG.currentMeterSource === 2) {
                let value = parseInt($(this).val());

                if (value !== currentDataSource[1].scale) {
                    self.analyticsChanges['PowerAmperageUpdated'] = value;
                }
            }
        });

        if(FC.BATTERY_CONFIG.voltageMeterSource == 1 || FC.BATTERY_CONFIG.currentMeterSource == 1 || FC.BATTERY_CONFIG.currentMeterSource == 2) {
            $('.calibration').show();
        } else {
            $('.calibration').hide();
        }
    }

    function initDisplay() {
        if (!TABS.power.supported) {
            $(".tab-power").removeClass("supported");
            return;
        }
        $(".tab-power").addClass("supported");

        $("#calibrationmanagercontent").hide();
        $("#calibrationmanagerconfirmcontent").hide();

       // battery
        const templateBatteryState = $('#tab-power-templates .battery-state .battery-state');
        const destinationBatteryState = $('.tab-power .battery-state');
        const elementBatteryState = templateBatteryState.clone();
        $(elementBatteryState).find('.connection-state').attr('id', 'battery-connection-state');
        $(elementBatteryState).find('.voltage').attr('id', 'battery-voltage');
        $(elementBatteryState).find('.mah-drawn').attr('id', 'battery-mah-drawn');
        $(elementBatteryState).find('.amperage').attr('id', 'battery-amperage');

        destinationBatteryState.append(elementBatteryState.children());

        const templateBatteryConfiguration = $('#tab-power-templates .battery-configuration');
        const destinationBatteryConfiguration = $('.tab-power .battery .configuration');
        const elementBatteryConfiguration = templateBatteryConfiguration.clone();
        destinationBatteryConfiguration.append(elementBatteryConfiguration);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
            $('input[name="mincellvoltage"]').prop('step','0.01');
            $('input[name="maxcellvoltage"]').prop('step','0.01');
            $('input[name="warningcellvoltage"]').prop('step','0.01');
        }

        $('input[name="mincellvoltage"]').val(FC.BATTERY_CONFIG.vbatmincellvoltage);
        $('input[name="maxcellvoltage"]').val(FC.BATTERY_CONFIG.vbatmaxcellvoltage);
        $('input[name="warningcellvoltage"]').val(FC.BATTERY_CONFIG.vbatwarningcellvoltage);
        $('input[name="capacity"]').val(FC.BATTERY_CONFIG.capacity);

        const haveFc = (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_35) || (FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2));

        const batteryMeterTypes = [
            i18n.getMessage('powerBatteryVoltageMeterTypeNone'),
            i18n.getMessage('powerBatteryVoltageMeterTypeAdc'),
        ];

        if (haveFc) {
            batteryMeterTypes.push(i18n.getMessage('powerBatteryVoltageMeterTypeEsc'));
        }

        let batteryMeterType_e = $('select.batterymetersource');

        for (let i = 0; i < batteryMeterTypes.length; i++) {
            batteryMeterType_e.append(`<option value="${i}">${batteryMeterTypes[i]}</option>`);
        }

        // fill current
        const currentMeterTypes = [
            i18n.getMessage('powerBatteryCurrentMeterTypeNone'),
            i18n.getMessage('powerBatteryCurrentMeterTypeAdc'),
        ];

        if (haveFc) {
            currentMeterTypes.push(i18n.getMessage('powerBatteryCurrentMeterTypeVirtual'));
            currentMeterTypes.push(i18n.getMessage('powerBatteryCurrentMeterTypeEsc'));

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                currentMeterTypes.push(i18n.getMessage('powerBatteryCurrentMeterTypeMsp'));
            }
        }

        let currentMeterType_e = $('select.currentmetersource');

        for (let i = 0; i < currentMeterTypes.length; i++) {
            currentMeterType_e.append(`<option value="${i}">${currentMeterTypes[i]}</option>`);
        }

        updateDisplay(FC.VOLTAGE_METER_CONFIGS, FC.CURRENT_METER_CONFIGS);

        batteryMeterType_e = $('select.batterymetersource');

        let sourceschanged = false;
        batteryMeterType_e.val(FC.BATTERY_CONFIG.voltageMeterSource);
        batteryMeterType_e.change(function () {
            FC.BATTERY_CONFIG.voltageMeterSource = parseInt($(this).val());

            updateDisplay();
            sourceschanged = true;
        });

        currentMeterType_e = $('select.currentmetersource');
        currentMeterType_e.val(FC.BATTERY_CONFIG.currentMeterSource);
        currentMeterType_e.change(function () {
            FC.BATTERY_CONFIG.currentMeterSource = parseInt($(this).val());

            updateDisplay();
            sourceschanged = true;
        });

        function get_slow_data() {
            MSP.send_message(MSPCodes.MSP_VOLTAGE_METERS, false, false, function () {
                for (let i = 0; i < FC.VOLTAGE_METERS.length; i++) {
                    const elementVoltageMeters = $(`#voltage-meter-${i} .value`);
                    elementVoltageMeters.text(i18n.getMessage('powerVoltageValue', [FC.VOLTAGE_METERS[i].voltage]));
                }
            });

            MSP.send_message(MSPCodes.MSP_CURRENT_METERS, false, false, function () {
                for (let i = 0; i < FC.CURRENT_METERS.length; i++) {
                    const elementCurrentMeters = $(`#amperage-meter-${i} .value`);
                    elementCurrentMeters.text(i18n.getMessage('powerAmperageValue', [FC.CURRENT_METERS[i].amperage.toFixed(2)]));
                }
            });

            MSP.send_message(MSPCodes.MSP_BATTERY_STATE, false, false, function () {
                const elementPrefix = '#battery';
                let elementMspBatteryState;

                elementMspBatteryState = $(`${elementPrefix}-connection-state .value`);
                elementMspBatteryState.text(FC.BATTERY_STATE.cellCount > 0
                    ? i18n.getMessage('powerBatteryConnectedValueYes', [FC.BATTERY_STATE.cellCount])
                    : i18n.getMessage('powerBatteryConnectedValueNo'));
                elementMspBatteryState = $(`${elementPrefix}-voltage .value`);
                elementMspBatteryState.text(i18n.getMessage('powerVoltageValue', [FC.BATTERY_STATE.voltage]));
                elementMspBatteryState = $(`${elementPrefix}-mah-drawn .value`);
                elementMspBatteryState.text(i18n.getMessage('powerMahValue', [FC.BATTERY_STATE.mAhDrawn]));
                elementMspBatteryState = $(`${elementPrefix}-amperage .value`);
                elementMspBatteryState.text(i18n.getMessage('powerAmperageValue', [FC.BATTERY_STATE.amperage]));
            });

        }

        //calibration manager
        let calibrationconfirmed = false;
        GUI.calibrationManager = new jBox('Modal', {
            width: 400,
            height: 230,
            closeButton: 'title',
            animation: false,
            attach: $('#calibrationmanager'),
            title: i18n.getMessage('powerCalibrationManagerTitle'),
            content: $('#calibrationmanagercontent'),
            onCloseComplete: function() {
                if (!calibrationconfirmed) {
                    TABS.power.initialize();
                }
            },
        });

        GUI.calibrationManagerConfirmation = new jBox('Modal', {
            width: 400,
            height: 230,
            closeButton: 'title',
            animation: false,
            attach: $('#calibrate'),
            title: i18n.getMessage('powerCalibrationManagerConfirmationTitle'),
            content: $('#calibrationmanagerconfirmcontent'),
            onCloseComplete: function() {
                GUI.calibrationManager.close();
            },
        });

        $('a.calibrationmanager').click(function() {
            if (FC.BATTERY_CONFIG.voltageMeterSource == 1 && FC.BATTERY_STATE.voltage > 0.1){
                $('.vbatcalibration').show();
            } else {
                $('.vbatcalibration').hide();
            }
            if ((FC.BATTERY_CONFIG.currentMeterSource == 1 || FC.BATTERY_CONFIG.currentMeterSource == 2) && FC.BATTERY_STATE.amperage > 0.1) {
                $('.amperagecalibration').show();
            } else {
                $('.amperagecalibration').hide();
            }
            if (FC.BATTERY_STATE.cellCount == 0) {
                $('.vbatcalibration').hide();
                $('.amperagecalibration').hide();
                $('.calibrate').hide();
                $('.nocalib').show();
            } else {
                $('.calibrate').show();
                $('.nocalib').hide();
            }
            if (sourceschanged) {
                $('.srcchange').show();
                $('.vbatcalibration').hide();
                $('.amperagecalibration').hide();
                $('.calibrate').hide();
                $('.nocalib').hide();
            } else {
                $('.srcchange').hide();
            }
        });

        $('input[name="vbatcalibration"]').val(0);
        $('input[name="amperagecalibration"]').val(0);

        let vbatscalechanged = false;
        let amperagescalechanged = false;
        $('a.calibrate').click(function() {
            if (FC.BATTERY_CONFIG.voltageMeterSource == 1) {
                const vbatcalibration = parseFloat($('input[name="vbatcalibration"]').val());
                if (vbatcalibration != 0) {
                    const vbatnewscale = Math.round(FC.VOLTAGE_METER_CONFIGS[0].vbatscale * (vbatcalibration / FC.VOLTAGE_METERS[0].voltage));
                    if (vbatnewscale >= 10 && vbatnewscale <= 255) {
                        FC.VOLTAGE_METER_CONFIGS[0].vbatscale = vbatnewscale;
                        vbatscalechanged = true;
                    }
                }
            }
            const ampsource = FC.BATTERY_CONFIG.currentMeterSource;
            if (ampsource == 1 || ampsource == 2) {
                const amperagecalibration = parseFloat($('input[name="amperagecalibration"]').val());
                const amperageoffset = FC.CURRENT_METER_CONFIGS[ampsource - 1].offset / 1000;
                if (amperagecalibration != 0) {
                    if (FC.CURRENT_METERS[ampsource - 1].amperage != amperageoffset && amperagecalibration != amperageoffset) {
                        const amperagenewscale = Math.round(FC.CURRENT_METER_CONFIGS[ampsource - 1].scale *
                            ((FC.CURRENT_METERS[ampsource - 1].amperage -  amperageoffset) / (amperagecalibration - amperageoffset)));
                        if (amperagenewscale > -16000 && amperagenewscale < 16000 && amperagenewscale != 0) {
                            FC.CURRENT_METER_CONFIGS[ampsource - 1].scale = amperagenewscale;
                            amperagescalechanged = true;
                        }
                    }
                }
            }
            if (vbatscalechanged || amperagescalechanged) {
                if (vbatscalechanged) {
                    $('.vbatcalibration').show();
                } else {
                    $('.vbatcalibration').hide();
                }
                if (amperagescalechanged) {
                    $('.amperagecalibration').show();
                } else {
                    $('.amperagecalibration').hide();
                }

                $('output[name="vbatnewscale"').val(vbatnewscale);
                $('output[name="amperagenewscale"').val(amperagenewscale);

                $('a.applycalibration').click(function() {
                    if (vbatscalechanged) {
                        self.analyticsChanges['PowerVBatUpdated'] = 'Calibrated';
            }

                    if (amperagescalechanged) {
                        self.analyticsChanges['PowerAmperageUpdated'] = 'Calibrated';
            }

                    calibrationconfirmed = true;
                    GUI.calibrationManagerConfirmation.close();
                    updateDisplay(FC.VOLTAGE_METER_CONFIGS, FC.CURRENT_METER_CONFIGS);
                    $('.calibration').hide();
                });

                $('a.discardcalibration').click(function() {
                    GUI.calibrationManagerConfirmation.close();
                });
            } else {
                GUI.calibrationManagerConfirmation.close();
            }
        });

        $('a.save').click(function () {
            for (let index = 0; index < FC.VOLTAGE_METER_CONFIGS.length; index++) {
                FC.VOLTAGE_METER_CONFIGS[index].vbatscale = parseInt($(`input[name="vbatscale-${index}"]`).val());
                FC.VOLTAGE_METER_CONFIGS[index].vbatresdivval = parseInt($(`input[name="vbatresdivval-${index}"]`).val());
                FC.VOLTAGE_METER_CONFIGS[index].vbatresdivmultiplier = parseInt($(`input[name="vbatresdivmultiplier-${index}"]`).val());
            }

            for (let index = 0; index < FC.CURRENT_METER_CONFIGS.length; index++) {
                FC.CURRENT_METER_CONFIGS[index].scale = parseInt($(`input[name="amperagescale-${index}"]`).val());
                FC.CURRENT_METER_CONFIGS[index].offset = parseInt($(`input[name="amperageoffset-${index}"]`).val());
            }

            FC.BATTERY_CONFIG.vbatmincellvoltage = parseFloat($('input[name="mincellvoltage"]').val());
            FC.BATTERY_CONFIG.vbatmaxcellvoltage = parseFloat($('input[name="maxcellvoltage"]').val());
            FC.BATTERY_CONFIG.vbatwarningcellvoltage = parseFloat($('input[name="warningcellvoltage"]').val());
            FC.BATTERY_CONFIG.capacity = parseInt($('input[name="capacity"]').val());

            analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);

            save_power_config();
        });

        GUI.interval_add('setup_data_pull_slow', get_slow_data, 200, true); // 5hz
    }

    function save_power_config() {
        function save_battery_config() {
            MSP.send_message(MSPCodes.MSP_SET_BATTERY_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BATTERY_CONFIG), false, save_voltage_config);
        }

        function save_voltage_config() {
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                mspHelper.sendVoltageConfig(save_amperage_config);
            } else {
                MSP.send_message(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG), false, save_amperage_config);
            }
        }

        function save_amperage_config() {
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                mspHelper.sendCurrentConfig(save_to_eeprom);
            } else {
                MSP.send_message(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_CURRENT_METER_CONFIG), false, save_to_eeprom);
            }
        }

        function save_to_eeprom() {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, save_completed);
        }

        function save_completed() {
            GUI.log(i18n.getMessage('configurationEepromSaved'));

            TABS.power.initialize();
        }

        save_battery_config();
    }

    function process_html() {
        initDisplay();

        self.analyticsChanges = {};

        // translate to user-selected language
        i18n.localizePage();

        GUI.content_ready(callback);
    }
};

power.cleanup = function (callback) {
    if (callback) callback();

    if (GUI.calibrationManager) {
        GUI.calibrationManager.destroy();
    }
    if (GUI.calibrationManagerConfirmation) {
        GUI.calibrationManagerConfirmation.destroy();
    }
};

window.TABS.power = power;
export { power };
