'use strict';

TABS.receiver = {
    rateChartHeight: 117,
    useSuperExpo: false,
    deadband: 0,
    yawDeadband: 0,
    analyticsChanges: {},
    needReboot: false,
};

TABS.receiver.initialize = function (callback) {
    const tab = this;

    if (GUI.active_tab != 'receiver') {
        GUI.active_tab = 'receiver';
    }

    function get_rc_data() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, get_rssi_config);
    }

    function get_rssi_config() {
        MSP.send_message(MSPCodes.MSP_RSSI_CONFIG, false, false, get_rc_tuning);
    }

    function get_rc_tuning() {
        MSP.send_message(MSPCodes.MSP_RC_TUNING, false, false, get_rc_map);
    }

    function get_rc_map() {
        MSP.send_message(MSPCodes.MSP_RX_MAP, false, false, load_rc_configs);
    }

    function load_rc_configs() {
        const nextCallback = load_rx_config;
        if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
            MSP.send_message(MSPCodes.MSP_RC_DEADBAND, false, false, nextCallback);
        } else {
            nextCallback();
        }
    }

    function load_rx_config() {
        const nextCallback = load_mixer_config;
        if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
            MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, nextCallback);
        } else {
            nextCallback();
        }
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/receiver.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, get_rc_data);

    function process_html() {
        self.analyticsChanges = {};

        const featuresElement = $('.tab-receiver .features');

        FC.FEATURE_CONFIG.features.generateElements(featuresElement);

        // translate to user-selected language
        i18n.localizePage();

        if (semver.lt(FC.CONFIG.apiVersion, "1.15.0")) {
            $('.deadband').hide();
        } else {
            $('.deadband input[name="yaw_deadband"]').val(FC.RC_DEADBAND_CONFIG.yaw_deadband);
            $('.deadband input[name="deadband"]').val(FC.RC_DEADBAND_CONFIG.deadband);
            $('.deadband input[name="3ddeadbandthrottle"]').val(FC.RC_DEADBAND_CONFIG.deadband3d_throttle);

            $('.deadband input[name="deadband"]').change(function () {
                tab.deadband = parseInt($(this).val());
            }).change();
            $('.deadband input[name="yaw_deadband"]').change(function () {
                tab.yawDeadband = parseInt($(this).val());
            }).change();
        }

        if (semver.lt(FC.CONFIG.apiVersion, "1.15.0")) {
            $('.sticks').hide();
        } else {
            $('.sticks input[name="stick_min"]').val(FC.RX_CONFIG.stick_min);
            $('.sticks input[name="stick_center"]').val(FC.RX_CONFIG.stick_center);
            $('.sticks input[name="stick_max"]').val(FC.RX_CONFIG.stick_max);
        }

        if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
            $('select[name="rcInterpolation-select"]').val(FC.RX_CONFIG.rcInterpolation);
            $('input[name="rcInterpolationInterval-number"]').val(FC.RX_CONFIG.rcInterpolationInterval);

            $('select[name="rcInterpolation-select"]').change(function () {
                tab.updateRcInterpolationParameters();
            }).change();
        } else {
            $('.tab-receiver div.rcInterpolation').hide();
        }

        // generate bars
        const bar_names = [
            i18n.getMessage('controlAxisRoll'),
            i18n.getMessage('controlAxisPitch'),
            i18n.getMessage('controlAxisYaw'),
            i18n.getMessage('controlAxisThrottle')
        ];

        const barContainer = $('.tab-receiver .bars');
        let auxIndex = 1;

        const numBars = (FC.RC.active_channels > 0) ? FC.RC.active_channels : 8;

        for (let i = 0; i < numBars; i++) {
            let name;
            if (i < bar_names.length) {
                name = bar_names[i];
            } else {
                name = i18n.getMessage("controlAxisAux" + (auxIndex++));
            }

            barContainer.append('\
                <ul>\
                    <li class="name">' + name + '</li>\
                    <li class="meter">\
                        <div class="meter-bar">\
                            <div class="label"></div>\
                            <div class="fill' + (FC.RC.active_channels == 0 ? 'disabled' : '') + '">\
                                <div class="label"></div>\
                            </div>\
                        </div>\
                    </li>\
                </ul>\
            ');
        }

        // we could probably use min and max throttle for the range, will see
        const meterScale = {
            'min': 800,
            'max': 2200
        };

        const meterFillArray = [];
        $('.meter .fill', barContainer).each(function () {
            meterFillArray.push($(this));
        });

        const meterLabelArray = [];
        $('.meter', barContainer).each(function () {
            meterLabelArray.push($('.label' , this));
        });

        // correct inner label margin on window resize (i don't know how we could do this in css)
        tab.resize = function () {
            const containerWidth = $('.meter:first', barContainer).width(),
                labelWidth = $('.meter .label:first', barContainer).width(),
                margin = (containerWidth / 2) - (labelWidth / 2);

            for (let i = 0; i < meterLabelArray.length; i++) {
                meterLabelArray[i].css('margin-left', margin);
            }
        };

        $(window).on('resize', tab.resize).resize(); // trigger so labels get correctly aligned on creation

        // handle rcmap & rssi aux channel
        let rcMapLetters = ['A', 'E', 'R', 'T', '1', '2', '3', '4'];

        let strBuffer = [];
        for (let i = 0; i < FC.RC_MAP.length; i++) {
            strBuffer[FC.RC_MAP[i]] = rcMapLetters[i];
        }

        // reconstruct
        const str = strBuffer.join('');

        // set current value
        $('input[name="rcmap"]').val(str);

        // validation / filter
        const lastValid = str;

        $('input[name="rcmap"]').on('input', function () {
            let val = $(this).val();

            // limit length to max 8
            if (val.length > 8) {
                val = val.substr(0, 8);
                $(this).val(val);
            }
        });

        $('input[name="rcmap"]').focusout(function () {
            const val = $(this).val();
            strBuffer = val.split('');
            const duplicityBuffer = [];

            if (val.length != 8) {
                $(this).val(lastValid);
                return false;
            }

            // check if characters inside are all valid, also check for duplicity
            for (let i = 0; i < val.length; i++) {
                if (rcMapLetters.indexOf(strBuffer[i]) < 0) {
                    $(this).val(lastValid);
                    return false;
                }

                if (duplicityBuffer.indexOf(strBuffer[i]) < 0) {
                    duplicityBuffer.push(strBuffer[i]);
                } else {
                    $(this).val(lastValid);
                    return false;
                }
            }
        });

        // handle helper
        $('select[name="rcmap_helper"]').val(0); // go out of bounds
        $('select[name="rcmap_helper"]').change(function () {
            $('input[name="rcmap"]').val($(this).val());
        });

        // rssi
        const rssi_channel_e = $('select[name="rssi_channel"]');
        rssi_channel_e.append(`<option value="0">${i18n.getMessage("receiverRssiChannelDisabledOption")}</option>`);
        //1-4 reserved for Roll Pitch Yaw & Throttle, starting at 5
        for (let i = 5; i < FC.RC.active_channels + 1; i++) {
            rssi_channel_e.append(`<option value="${i}">${i18n.getMessage("controlAxisAux" + (i-4))}</option>`);
        }

        $('select[name="rssi_channel"]').val(FC.RSSI_CONFIG.channel);

        const serialRxSelectElement = $('select.serialRX');
        FC.getSerialRxTypes().forEach((serialRxType, index) => {
            serialRxSelectElement.append(`<option value="${index}">${serialRxType}</option>`);
        });

        serialRxSelectElement.change(function () {
            const serialRxValue = parseInt($(this).val());

            let newValue;
            if (serialRxValue !== FC.RX_CONFIG.serialrx_provider) {
                newValue = $(this).find('option:selected').text();
                updateSaveButton(true);
            }
            tab.analyticsChanges['SerialRx'] = newValue;

            FC.RX_CONFIG.serialrx_provider = serialRxValue;
        });

        // select current serial RX type
        serialRxSelectElement.val(FC.RX_CONFIG.serialrx_provider);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
            const spiRxTypes = [
                'NRF24_V202_250K',
                'NRF24_V202_1M',
                'NRF24_SYMA_X',
                'NRF24_SYMA_X5C',
                'NRF24_CX10',
                'CX10A',
                'NRF24_H8_3D',
                'NRF24_INAV',
                'FRSKY_D',
            ];

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
                spiRxTypes.push(
                    'FRSKY_X',
                    'A7105_FLYSKY',
                    'A7105_FLYSKY_2A',
                    'NRF24_KN'
                );
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                spiRxTypes.push(
                    'SFHSS',
                    'SPEKTRUM',
                    'FRSKY_X_LBT'
                );
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                spiRxTypes.push(
                    'REDPINE'
                );
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                spiRxTypes.push(
                    'FRSKY_X_V2',
                    'FRSKY_X_LBT_V2'
                );
            }

            const spiRxElement = $('select.spiRx');
            for (let i = 0; i < spiRxTypes.length; i++) {
                spiRxElement.append(`<option value="${i}">${spiRxTypes[i]}</option>`);
            }

            spiRxElement.change(function () {
                const value = parseInt($(this).val());

                let newValue = undefined;
                if (value !== FC.RX_CONFIG.rxSpiProtocol) {
                    newValue = $(this).find('option:selected').text();
                    updateSaveButton(true);
                }
                tab.analyticsChanges['SPIRXProtocol'] = newValue;

                FC.RX_CONFIG.rxSpiProtocol = value;
            });

            // select current serial RX type
            spiRxElement.val(FC.RX_CONFIG.rxSpiProtocol);
        }


        // UI Hooks

        function updateSaveButton(reboot=false) {
            if (reboot) {
                tab.needReboot = true;
            }
            if (tab.needReboot) {
                $('.update_btn').hide();
                $('.save_btn').show();
            } else {
                $('.update_btn').show();
                $('.save_btn').hide();
            }
        }

        $('input.feature', featuresElement).change(function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

            if (element.attr('name') === "RSSI_ADC") {
                updateSaveButton(true);
            }
        });

        function checkShowSerialRxBox() {
            if (FC.FEATURE_CONFIG.features.isEnabled('RX_SERIAL')) {
                $('div.serialRXBox').show();
            } else {
                $('div.serialRXBox').hide();
            }
        }

        function checkShowSpiRxBox() {
            if (FC.FEATURE_CONFIG.features.isEnabled('RX_SPI')) {
                $('div.spiRxBox').show();
            } else {
                $('div.spiRxBox').hide();
            }
        }

        $(featuresElement).filter('select').change(function () {
            const element = $(this);
            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);
            if (element.attr('name') === 'rxMode') {
                checkShowSerialRxBox();
                checkShowSpiRxBox();
                updateSaveButton(true);
            }
        });

        checkShowSerialRxBox();
        checkShowSpiRxBox();
        updateSaveButton();

        $('a.refresh').click(function () {
            tab.refresh(function () {
                GUI.log(i18n.getMessage('receiverDataRefreshed'));
            });
        });

        function saveConfiguration(boot=false) {

            if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
                FC.RX_CONFIG.stick_max = parseInt($('.sticks input[name="stick_max"]').val());
                FC.RX_CONFIG.stick_center = parseInt($('.sticks input[name="stick_center"]').val());
                FC.RX_CONFIG.stick_min = parseInt($('.sticks input[name="stick_min"]').val());
                FC.RC_DEADBAND_CONFIG.yaw_deadband = parseInt($('.deadband input[name="yaw_deadband"]').val());
                FC.RC_DEADBAND_CONFIG.deadband = parseInt($('.deadband input[name="deadband"]').val());
                FC.RC_DEADBAND_CONFIG.deadband3d_throttle = ($('.deadband input[name="3ddeadbandthrottle"]').val());
            }

            // catch rc map
            rcMapLetters = ['A', 'E', 'R', 'T', '1', '2', '3', '4'];
            strBuffer = $('input[name="rcmap"]').val().split('');

            for (let i = 0; i < FC.RC_MAP.length; i++) {
                FC.RC_MAP[i] = strBuffer.indexOf(rcMapLetters[i]);
            }

            // catch rssi aux
            FC.RSSI_CONFIG.channel = parseInt($('select[name="rssi_channel"]').val());


            if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                FC.RX_CONFIG.rcInterpolation = parseInt($('select[name="rcInterpolation-select"]').val());
                FC.RX_CONFIG.rcInterpolationInterval = parseInt($('input[name="rcInterpolationInterval-number"]').val());
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
                FC.RX_CONFIG.rcSmoothingSetpointCutoff = parseInt($('input[name="rcSmoothingSetpointHz-number"]').val());
                FC.RX_CONFIG.rcSmoothingFeedforwardCutoff = parseInt($('input[name="rcSmoothingFeedforwardCutoff-number"]').val());
                FC.RX_CONFIG.rcSmoothingDerivativeType = parseInt($('select[name="rcSmoothingFeedforwardType-select"]').val());
                FC.RX_CONFIG.rcInterpolationChannels = parseInt($('select[name="rcSmoothingChannels-select"]').val());
                FC.RX_CONFIG.rcSmoothingInputType = parseInt($('select[name="rcSmoothingSetpointType-select"]').val());
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                FC.RX_CONFIG.rcSmoothingAutoFactor = parseInt($('input[name="rcSmoothingAutoFactor-number"]').val());
            }

            function save_rssi_config() {
                MSP.send_message(MSPCodes.MSP_SET_RSSI_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RSSI_CONFIG), false, save_rc_configs);
            }

            function save_rc_configs() {
                const nextCallback = save_rx_config;
                if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND), false, nextCallback);
                } else {
                    nextCallback();
                }
            }

            function save_rx_config() {
                const nextCallback = (boot) ? save_feature_config : save_to_eeprom;
                if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, nextCallback);
                } else {
                    nextCallback();
                }
            }

            function save_feature_config() {
                MSP.send_message(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG), false, save_to_eeprom);
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
            }

            function reboot() {
                GUI.log(i18n.getMessage('configurationEepromSaved'));
                if (boot) {
                    GUI.tab_switch_cleanup(function() {
                        MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                        reinitialiseConnection(tab);
                    });
                }
            }

            analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, tab.analyticsChanges);
            tab.analyticsChanges = {};

            MSP.send_message(MSPCodes.MSP_SET_RX_MAP, mspHelper.crunch(MSPCodes.MSP_SET_RX_MAP), false, save_rssi_config);
        }

        $('a.update').click(function () {
            saveConfiguration(false);
        });

        $('a.save').click(function () {
            saveConfiguration(true);
            tab.needReboot = false;
        });

        $("a.sticks").click(function() {
            const windowWidth = 370;
            const windowHeight = 510;

            chrome.app.window.create("/tabs/receiver_msp.html", {
                id: "receiver_msp",
                innerBounds: {
                    minWidth: windowWidth, minHeight: windowHeight,
                    width: windowWidth, height: windowHeight,
                    maxWidth: windowWidth, maxHeight: windowHeight
                },
                alwaysOnTop: true
            }, function(createdWindow) {
                // Give the window a callback it can use to send the channels (otherwise it can't see those objects)
                createdWindow.contentWindow.setRawRx = function(channels) {
                    if (CONFIGURATOR.connectionValid && GUI.active_tab != 'cli') {
                        mspHelper.setRawRx(channels);
                        return true;
                    } else {
                        return false;
                    }
                };

                DarkTheme.isDarkThemeEnabled(function(isEnabled) {
                    windowWatcherUtil.passValue(createdWindow, 'darkTheme', isEnabled);
                });

            });
        });

        let showBindButton = false;
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            showBindButton = bit_check(FC.CONFIG.targetCapabilities, FC.TARGET_CAPABILITIES_FLAGS.SUPPORTS_RX_BIND);

            $("a.bind").click(function() {
                MSP.send_message(MSPCodes.MSP2_BETAFLIGHT_BIND);

                GUI.log(i18n.getMessage('receiverButtonBindMessage'));
            });
        }
        $(".bind_btn").toggle(showBindButton);

        // RC Smoothing
        const smoothingOnOff = ((semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) ?
            FC.RX_CONFIG.rcSmoothingMode : FC.RX_CONFIG.rcSmoothingType);

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
            $('.tab-receiver .rcSmoothing').show();

            const rc_smoothing_protocol_e = $('select[name="rcSmoothing-select"]');
            rc_smoothing_protocol_e.change(function () {
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    FC.RX_CONFIG.rcSmoothingMode = parseFloat($(this).val());
                } else {
                    FC.RX_CONFIG.rcSmoothingType = parseFloat($(this).val());
                }
                updateInterpolationView();
            });
            rc_smoothing_protocol_e.val(smoothingOnOff);

            const rcSmoothingNumberElement = $('input[name="rcSmoothingSetpointHz-number"]');
            const rcSmoothingFeedforwardNumberElement = $('input[name="rcSmoothingFeedforwardCutoff-number"]');
            rcSmoothingNumberElement.val(FC.RX_CONFIG.rcSmoothingSetpointCutoff);
            rcSmoothingFeedforwardNumberElement.val(FC.RX_CONFIG.rcSmoothingFeedforwardCutoff);
            $('.tab-receiver .rcSmoothing-setpoint-cutoff').show();
            $('select[name="rcSmoothing-setpoint-manual-select"]').val("1");
            if (FC.RX_CONFIG.rcSmoothingSetpointCutoff === 0) {
                $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
                $('select[name="rcSmoothing-setpoint-manual-select"]').val("0");
            }
            $('select[name="rcSmoothing-setpoint-manual-select"]').change(function () {
                if ($(this).val() === "0") {
                    rcSmoothingNumberElement.val(0);
                    $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
                }
                if ($(this).val() === "1") {
                    rcSmoothingNumberElement.val(FC.RX_CONFIG.rcSmoothingSetpointCutoff);
                    $('.tab-receiver .rcSmoothing-setpoint-cutoff').show();
                }
            }).change();

            $('.tab-receiver .rcSmoothing-feedforward-cutoff').show();
            $('select[name="rcSmoothing-feedforward-select"]').val("1");
            if (FC.RX_CONFIG.rcSmoothingFeedforwardCutoff === 0) {
                $('select[name="rcSmoothing-feedforward-select"]').val("0");
                $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
            }
            $('select[name="rcSmoothing-feedforward-select"]').change(function () {
                if ($(this).val() === "0") {
                    $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
                    rcSmoothingFeedforwardNumberElement.val(0);
                }
                if ($(this).val() === "1") {
                    $('.tab-receiver .rcSmoothing-feedforward-cutoff').show();
                    rcSmoothingFeedforwardNumberElement.val(FC.RX_CONFIG.rcSmoothingFeedforwardCutoff);
                }
            }).change();

            const rcSmoothingFeedforwardType = $('select[name="rcSmoothingFeedforwardType-select"]');
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                rcSmoothingFeedforwardType.append($(`<option value="3">${i18n.getMessage("receiverRcSmoothingFeedforwardTypeAuto")}</option>`));
            }

            rcSmoothingFeedforwardType.val(FC.RX_CONFIG.rcSmoothingDerivativeType);
            const rcSmoothingChannels = $('select[name="rcSmoothingChannels-select"]');
            rcSmoothingChannels.val(FC.RX_CONFIG.rcInterpolationChannels);
            const rcSmoothingSetpointType = $('select[name="rcSmoothingSetpointType-select"]');
            rcSmoothingSetpointType.val(FC.RX_CONFIG.rcSmoothingInputType);

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                $('select[name="rcSmoothing-setpoint-manual-select"], select[name="rcSmoothing-feedforward-select"]').change(function() {
                    if ($('select[name="rcSmoothing-setpoint-manual-select"]').val() === "0" || $('select[name="rcSmoothing-feedforward-select"]').val() === "0") {
                        $('.tab-receiver .rcSmoothing-auto-factor').show();
                    } else {
                        $('.tab-receiver .rcSmoothing-auto-factor').hide();
                    }
                });
                $('select[name="rcSmoothing-setpoint-manual-select"]').change();

                const rcSmoothingAutoFactor = $('input[name="rcSmoothingAutoFactor-number"]');
                rcSmoothingAutoFactor.val(FC.RX_CONFIG.rcSmoothingAutoFactor);
            } else {
                $('.tab-receiver .rcSmoothing-auto-factor').hide();
            }

            updateInterpolationView();
        } else {
            $('.tab-receiver .rcInterpolation').show();
            $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
            $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
            $('.tab-receiver .rcSmoothing-feedforward-type').hide();
            $('.tab-receiver .rcSmoothing-setpoint-type').hide();
            $('.tab-receiver .rcSmoothing-feedforward-manual').hide();
            $('.tab-receiver .rcSmoothing-setpoint-manual').hide();
            $('.tab-receiver .rc-smoothing-type').hide();
            $('.tab-receiver .rcSmoothing-auto-factor').hide();
        }

        // Only show the MSP control sticks if the MSP Rx feature is enabled
        $(".sticks_btn").toggle(FC.FEATURE_CONFIG.features.isEnabled('RX_MSP'));

        const labelsChannelData = {
            ch1: [],
            ch2: [],
            ch3: [],
            ch4: [],
        };

        $(`.plot_control .ch1, .plot_control .ch2, .plot_control .ch3, .plot_control .ch4`).each(function (){
            const element = $(this);
            if (element.hasClass('ch1')){
                labelsChannelData.ch1.push(element);
            } else if (element.hasClass('ch2')){
                labelsChannelData.ch2.push(element);
            } else if (element.hasClass('ch3')){
                labelsChannelData.ch3.push(element);
            } else if (element.hasClass('ch4')){
                labelsChannelData.ch4.push(element);
            }
        });

        let plotUpdateRate;
        const rxRefreshRate = $('select[name="rx_refresh_rate"]');

        $('a.reset_rate').click(function () {
            plotUpdateRate = 50;
            rxRefreshRate.val(plotUpdateRate).change();
        });

        rxRefreshRate.change(function () {
            plotUpdateRate = parseInt($(this).val(), 10);

            // save update rate
            ConfigStorage.set({'rx_refresh_rate': plotUpdateRate});

            function get_rc_refresh_data() {
                MSP.send_message(MSPCodes.MSP_RC, false, false, update_ui);
            }

            // setup plot
            const rxPlotData = new Array(FC.RC.active_channels);
            for (let i = 0; i < rxPlotData.length; i++) {
                rxPlotData[i] = [];
            }

            let samples = 0;
            const svg = d3.select("svg");
            const RX_plot_e = $('#RX_plot');
            const margin = {top: 20, right: 0, bottom: 10, left: 40};
            let width, height, widthScale, heightScale;

            function update_receiver_plot_size() {
                width = RX_plot_e.width() - margin.left - margin.right;
                height = RX_plot_e.height() - margin.top - margin.bottom;

                widthScale.range([0, width]);
                heightScale.range([height, 0]);
            }

            function update_ui() {

                if (FC.RC.active_channels > 0) {

                    // update bars with latest data
                    for (let i = 0; i < FC.RC.active_channels; i++) {
                        meterFillArray[i].css('width', ((FC.RC.channels[i] - meterScale.min) / (meterScale.max - meterScale.min) * 100).clamp(0, 100) + '%');
                        meterLabelArray[i].text(FC.RC.channels[i]);
                    }

                    labelsChannelData.ch1[0].text(FC.RC.channels[0]);
                    labelsChannelData.ch2[0].text(FC.RC.channels[1]);
                    labelsChannelData.ch3[0].text(FC.RC.channels[2]);
                    labelsChannelData.ch4[0].text(FC.RC.channels[3]);

                    // push latest data to the main array
                    for (let i = 0; i < FC.RC.active_channels; i++) {
                        rxPlotData[i].push([samples, FC.RC.channels[i]]);
                    }

                    // Remove old data from array
                    while (rxPlotData[0].length > 300) {
                        for (let i = 0; i < rxPlotData.length; i++) {
                            rxPlotData[i].shift();
                        }
                    }

                }

                // update required parts of the plot
                widthScale = d3.scale.linear().
                    domain([(samples - 299), samples]);

                heightScale = d3.scale.linear().
                    domain([800, 2200]);

                update_receiver_plot_size();

                const xGrid = d3.svg.axis().
                    scale(widthScale).
                    orient("bottom").
                    tickSize(-height, 0, 0).
                    tickFormat("");

                const yGrid = d3.svg.axis().
                    scale(heightScale).
                    orient("left").
                    tickSize(-width, 0, 0).
                    tickFormat("");

                const xAxis = d3.svg.axis().
                    scale(widthScale).
                    orient("bottom").
                    tickFormat(function (d) {return d;});

                const yAxis = d3.svg.axis().
                    scale(heightScale).
                    orient("left").
                    tickFormat(function (d) {return d;});

                const line = d3.svg.line().
                    x(function (d) {return widthScale(d[0]);}).
                    y(function (d) {return heightScale(d[1]);});

                svg.select(".x.grid").call(xGrid);
                svg.select(".y.grid").call(yGrid);
                svg.select(".x.axis").call(xAxis);
                svg.select(".y.axis").call(yAxis);

                const data = svg.select("g.data");
                const lines = data.selectAll("path").data(rxPlotData, function (d, i) {return i;});
                lines.enter().append("path").attr("class", "line");
                lines.attr('d', line);

                samples++;
            }

            // timer initialization
            GUI.interval_remove('receiver_pull');

            // enable RC data pulling
            GUI.interval_add('receiver_pull', get_rc_refresh_data, plotUpdateRate, true);
        });

        ConfigStorage.get('rx_refresh_rate', function (result) {
            if (result.rxRefreshRate) {
                rxRefreshRate.val(result.rxRefreshRate).change();
            } else {
                rxRefreshRate.change(); // start with default value
            }
        });

        // Setup model for preview
        tab.initModelPreview();
        tab.renderModel();

        // TODO: Combine two polls together
        GUI.interval_add('receiver_pull_for_model_preview', tab.getReceiverData, 33, false);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

TABS.receiver.getReceiverData = function () {
    MSP.send_message(MSPCodes.MSP_RC, false, false);
};

TABS.receiver.initModelPreview = function () {
    this.keepRendering = true;
    this.model = new Model($('.model_preview'), $('.model_preview canvas'));

    this.useSuperExpo = false;
    if (semver.gte(FC.CONFIG.apiVersion, "1.20.0") || (semver.gte(FC.CONFIG.apiVersion, "1.16.0") && FC.FEATURE_CONFIG.features.isEnabled('SUPEREXPO_RATES'))) {
        this.useSuperExpo = true;
    }

    let useOldRateCurve = false;
    if (FC.CONFIG.flightControllerIdentifier == 'CLFL' && semver.lt(FC.CONFIG.apiVersion, '2.0.0')) {
        useOldRateCurve = true;
    }
    if (FC.CONFIG.flightControllerIdentifier == 'BTFL' && semver.lt(FC.CONFIG.flightControllerVersion, '2.8.0')) {
        useOldRateCurve = true;
    }

    this.rateCurve = new RateCurve(useOldRateCurve);

    $(window).on('resize', $.proxy(this.model.resize, this.model));
};

TABS.receiver.renderModel = function () {
    if (this.keepRendering) { requestAnimationFrame(this.renderModel.bind(this)); }

    if (!this.clock) { this.clock = new THREE.Clock(); }

    if (FC.RC.channels[0] && FC.RC.channels[1] && FC.RC.channels[2]) {
        const delta = this.clock.getDelta();

        const roll  = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(FC.RC.channels[0], FC.RC_TUNING.roll_rate, FC.RC_TUNING.RC_RATE, FC.RC_TUNING.RC_EXPO, this.useSuperExpo, this.deadband, FC.RC_TUNING.roll_rate_limit),
            pitch = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(FC.RC.channels[1], FC.RC_TUNING.pitch_rate, FC.RC_TUNING.rcPitchRate, FC.RC_TUNING.RC_PITCH_EXPO, this.useSuperExpo, this.deadband, FC.RC_TUNING.pitch_rate_limit),
            yaw   = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(FC.RC.channels[2], FC.RC_TUNING.yaw_rate, FC.RC_TUNING.rcYawRate, FC.RC_TUNING.RC_YAW_EXPO, this.useSuperExpo, this.yawDeadband, FC.RC_TUNING.yaw_rate_limit);

        this.model.rotateBy(-degToRad(pitch), -degToRad(yaw), -degToRad(roll));
    }
};


TABS.receiver.cleanup = function (callback) {
    $(window).off('resize', this.resize);
    if (this.model) {
        $(window).off('resize', $.proxy(this.model.resize, this.model));
        this.model.dispose();
    }

    this.keepRendering = false;

    if (callback) callback();
};

TABS.receiver.refresh = function (callback) {
    const self = this;

    GUI.tab_switch_cleanup(function () {
        self.initialize();

        if (callback) {
            callback();
        }
    });
};

TABS.receiver.updateRcInterpolationParameters = function () {
    if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
        if ($('select[name="rcInterpolation-select"]').val() === '3') {
            $('.tab-receiver .rc-interpolation-manual').show();
        } else {
            $('.tab-receiver .rc-interpolation-manual').hide();
        }
    }
};

function updateInterpolationView() {
    const smoothingOnOff = ((semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) ?
        FC.RX_CONFIG.rcSmoothingMode : FC.RX_CONFIG.rcSmoothingType);

    $('.tab-receiver .rcInterpolation').hide();
    $('.tab-receiver .rcSmoothing-feedforward-cutoff').show();
    $('.tab-receiver .rcSmoothing-setpoint-cutoff').show();
    $('.tab-receiver .rcSmoothing-feedforward-type').show();
    $('.tab-receiver .rcSmoothing-setpoint-type').show();
    $('.tab-receiver .rcSmoothing-feedforward-manual').show();
    $('.tab-receiver .rcSmoothing-setpoint-manual').show();
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
        if (FC.RX_CONFIG.rcSmoothingFeedforwardCutoff === 0 || FC.RX_CONFIG.rcSmoothingSetpointCutoff === 0) {
            $('.tab-receiver .rcSmoothing-auto-factor').show();
        }
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        $('.tab-receiver .rcSmoothing-feedforward-type').hide();
        $('.tab-receiver .rcSmoothing-setpoint-type').hide();
        $('.tab-receiver .rc-smoothing-channels').hide();
        $('.tab-receiver input[name="rcSmoothingAutoFactor-number"]').attr("max", "250");
        $('.tab-receiver .rcSmoothingType').hide();
        $('.tab-receiver .rcSmoothingOff').text(i18n.getMessage('off'));
        $('.tab-receiver .rcSmoothingOn').text(i18n.getMessage('on'));
    } else {
        $('.tab-receiver .rcSmoothingMode').hide();
    }

    if (smoothingOnOff === 0) {
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
            $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
            $('.tab-receiver .rcSmoothing-feedforward-manual').hide();
            $('.tab-receiver .rcSmoothing-setpoint-manual').hide();
            $('.tab-receiver .rcSmoothing-auto-factor').hide();
        } else {
            $('.tab-receiver .rcInterpolation').show();
            $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
            $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
            $('.tab-receiver .rcSmoothing-feedforward-type').hide();
            $('.tab-receiver .rcSmoothing-setpoint-type').hide();
            $('.tab-receiver .rcSmoothing-feedforward-manual').hide();
            $('.tab-receiver .rcSmoothing-setpoint-manual').hide();
            $('.tab-receiver .rcSmoothing-auto-factor').hide();
        }
    }
    if (FC.RX_CONFIG.rcSmoothingFeedforwardCutoff === 0) {
        $('.tab-receiver .rcSmoothing-feedforward-cutoff').hide();
    }
    if (FC.RX_CONFIG.rcSmoothingSetpointCutoff === 0) {
        $('.tab-receiver .rcSmoothing-setpoint-cutoff').hide();
    }
}
