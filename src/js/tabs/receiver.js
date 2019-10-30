'use strict';

var RCMapLetters = ['A', 'E', 'R', 'T', '1', '2', '3', '4'];

function rxMapLettersToNumber(letters) {
    return letters.split('').map(letter => RCMapLetters.indexOf(letter));
}

function serializeRxMap(map) {
    const buffer = [];
    map.forEach(map => {
        buffer.push8(map)
    });
    return buffer;
}

function serializeRxRange(range) {
    const buffer = [];
    buffer.push8(range.length);
    range.forEach(([min, max]) => {
        buffer.push16(min);
        buffer.push16(max);
    });
    return buffer;
}

TABS.receiver = {
    rateChartHeight: 117,
    useSuperExpo: false,
    deadband: 0,
    yawDeadband: 0
};

TABS.receiver.initialize = function (callback) {
    var tab = this;

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
        var next_callback = load_rx_config;
        if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
            MSP.send_message(MSPCodes.MSP_RC_DEADBAND, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_rx_config() {
        var next_callback = load_rxrange_config;
        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            MSP.send_message(MSPCodes.MSP_RX_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_mixer_config() {
        MSP.send_message(MSPCodes.MSP_MIXER_CONFIG, false, false, load_html);
    }

    function load_rxrange_config() {
        var next_callback = load_mixer_config;
        if (semver.gte(CONFIG.apiVersion, "1.43.0")) {
            MSP.send_message(MSPCodes.MSP_RXRANGE_CONFIG, false, false, next_callback);
        } else {
            next_callback();
        }
    }

    function load_html() {
        $('#content').load("./tabs/receiver.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_FEATURE_CONFIG, false, false, get_rc_data);

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        if (semver.lt(CONFIG.apiVersion, "1.15.0")) {
            $('.deadband').hide();
        } else {
            $('.deadband input[name="yaw_deadband"]').val(RC_DEADBAND_CONFIG.yaw_deadband);
            $('.deadband input[name="deadband"]').val(RC_DEADBAND_CONFIG.deadband);
            $('.deadband input[name="3ddeadbandthrottle"]').val(RC_DEADBAND_CONFIG.deadband3d_throttle);

            $('.deadband input[name="deadband"]').change(function () {
                tab.deadband = parseInt($(this).val());
            }).change();
            $('.deadband input[name="yaw_deadband"]').change(function () {
                tab.yawDeadband = parseInt($(this).val());
            }).change();
        }

        if (semver.lt(CONFIG.apiVersion, "1.15.0")) {
            $('.sticks').hide();
        } else {
            $('.sticks input[name="stick_min"]').val(RX_CONFIG.stick_min);
            $('.sticks input[name="stick_center"]').val(RX_CONFIG.stick_center);
            $('.sticks input[name="stick_max"]').val(RX_CONFIG.stick_max);

        }

        if (semver.gte(CONFIG.apiVersion, "1.43.0")) {
            const elems = RXRANGE_CONFIG.map(([min, max], idx) => {
                const PWM_PULSE_MIN = 750;
                const PWM_PULSE_MAX = 2250;
                return `<tr>
                            <td>ch${idx+1}</td>
                            <td><input type="number" name="rxrange_min" min="${PWM_PULSE_MIN}" max="${PWM_PULSE_MAX}" value="${min}" /></td>
                            <td><input type="number" name="rxrange_max" min="${PWM_PULSE_MIN}" max="${PWM_PULSE_MAX}" value="${max}" /></td>
                        </tr>`;
            });
            $('.rxrange .rxrange_channels').html(elems);
        } else {
            $('.rxrange').hide();
        }

        if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
            $('select[name="rcInterpolation-select"]').val(RX_CONFIG.rcInterpolation);
            $('input[name="rcInterpolationInterval-number"]').val(RX_CONFIG.rcInterpolationInterval);

            $('select[name="rcInterpolation-select"]').change(function () {
                tab.updateRcInterpolationParameters();
            }).change();
        } else {
            $('.tab-receiver div.rcInterpolation').hide();
        }

        // generate bars
        var bar_names = [
                i18n.getMessage('controlAxisRoll'),
                i18n.getMessage('controlAxisPitch'),
                i18n.getMessage('controlAxisYaw'),
                i18n.getMessage('controlAxisThrottle')
            ],
            bar_container = $('.tab-receiver .bars'),
            aux_index = 1;

        var num_bars = (RC.active_channels > 0) ? RC.active_channels : 8;

        for (var i = 0; i < num_bars; i++) {
            var name;
            if (i < bar_names.length) {
                name = bar_names[i];
            } else {
                name = i18n.getMessage("controlAxisAux" + (aux_index++));
            }

            bar_container.append('\
                <ul>\
                    <li class="name">' + name + '</li>\
                    <li class="meter">\
                        <div class="meter-bar">\
                            <div class="label"></div>\
                            <div class="fill' + (RC.active_channels == 0 ? 'disabled' : '') + '">\
                                <div class="label"></div>\
                            </div>\
                        </div>\
                    </li>\
                </ul>\
            ');
        }

        // we could probably use min and max throttle for the range, will see
        var meter_scale = {
            'min': 800,
            'max': 2200
        };

        var meter_fill_array = [];
        $('.meter .fill', bar_container).each(function () {
            meter_fill_array.push($(this));
        });

        var meter_label_array = [];
        $('.meter', bar_container).each(function () {
            meter_label_array.push($('.label' , this));
        });

        // correct inner label margin on window resize (i don't know how we could do this in css)
        tab.resize = function () {
            var containerWidth = $('.meter:first', bar_container).width(),
                labelWidth = $('.meter .label:first', bar_container).width(),
                margin = (containerWidth / 2) - (labelWidth / 2);

            for (var i = 0; i < meter_label_array.length; i++) {
                meter_label_array[i].css('margin-left', margin);
            }
        };

        $(window).on('resize', tab.resize).resize(); // trigger so labels get correctly aligned on creation

        // handle rcmap & rssi aux channel
        const rxMap = RC_MAP.map(channel => RCMapLetters[channel]).join('');

        // set current value
        $('input[name="rcmap"]').val(rxMap);

        // validation / filter
        const lastValid = rxMap;

        $('input[name="rcmap"]').on('input', function () {
            var val = $(this).val();

            // limit length to max 8
            if (val.length > 8) {
                val = val.substr(0, 8);
                $(this).val(val);
            }
        });

        $('input[name="rcmap"]').focusout(function () {
            var val = $(this).val(),
                strBuffer = val.split(''),
                duplicityBuffer = [];

            if (val.length !== 8) {
                $(this).val(lastValid);
                return false;
            }

            // check if characters inside are all valid, also check for duplicity
            for (var i = 0; i < val.length; i++) {
                if (RCMapLetters.indexOf(strBuffer[i]) < 0) {
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

        $('#calibrate_btn').click(() => {
            TABS.receiver.cleanup();

            $('#content').load("./tabs/receiver_calibration.html");
        });

        // rssi
        var rssi_channel_e = $('select[name="rssi_channel"]');
        rssi_channel_e.append('<option value="0">' + i18n.getMessage("receiverRssiChannelDisabledOption") + '</option>');
        //1-4 reserved for Roll Pitch Yaw & Throttle, starting at 5
        for (var i = 5; i < RC.active_channels + 1; i++) {
            rssi_channel_e.append('<option value="' + i + '">' + i18n.getMessage("controlAxisAux" + (i-4)) + '</option>');
        }

        $('select[name="rssi_channel"]').val(RSSI_CONFIG.channel);

        var rateHeight = TABS.receiver.rateChartHeight;

        // UI Hooks
        $('a.refresh').click(function () {
            tab.refresh(function () {
                GUI.log(i18n.getMessage('receiverDataRefreshed'));
            });
        });

        $('a.update').click(function () {
            if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
                RX_CONFIG.stick_max = parseInt($('.sticks input[name="stick_max"]').val());
                RX_CONFIG.stick_center = parseInt($('.sticks input[name="stick_center"]').val());
                RX_CONFIG.stick_min = parseInt($('.sticks input[name="stick_min"]').val());
                RC_DEADBAND_CONFIG.yaw_deadband = parseInt($('.deadband input[name="yaw_deadband"]').val());
                RC_DEADBAND_CONFIG.deadband = parseInt($('.deadband input[name="deadband"]').val());
                RC_DEADBAND_CONFIG.deadband3d_throttle = ($('.deadband input[name="3ddeadbandthrottle"]').val());
            }

            RC_MAP = rxMapLettersToNumber($('input[name="rcmap"]').val());

            // catch rssi aux
            RSSI_CONFIG.channel = parseInt($('select[name="rssi_channel"]').val());

            if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                RX_CONFIG.rcInterpolation = parseInt($('select[name="rcInterpolation-select"]').val());
                RX_CONFIG.rcInterpolationInterval = parseInt($('input[name="rcInterpolationInterval-number"]').val());
            }

            if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
                RXRANGE_CONFIG = RXRANGE_CONFIG.map((config, idx) => {
                    const elem = $('.rxrange .rxrange_channels tr').get(idx);
                    return [
                        $('[name=rxrange_min]', elem).val(),
                        $('[name=rxrange_max]', elem).val()
                    ]
                })
            }

            function save_rssi_config() {
                MSP.send_message(MSPCodes.MSP_SET_RSSI_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RSSI_CONFIG), false, save_rc_configs);
            }

            function save_rc_configs() {
                var next_callback = save_rx_config;
                if (semver.gte(CONFIG.apiVersion, "1.15.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RC_DEADBAND, mspHelper.crunch(MSPCodes.MSP_SET_RC_DEADBAND), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_rx_config() {
                var next_callback = save_rxrange_config;
                if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_rxrange_config() {
                var next_callback = save_to_eeprom;
                if (semver.gte(CONFIG.apiVersion, "1.43.0")) {
                    MSP.send_message(MSPCodes.MSP_SET_RXRANGE_CONFIG, serializeRxRange(RXRANGE_CONFIG), false, next_callback);
                } else {
                    next_callback();
                }
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(i18n.getMessage('receiverEepromSaved'));
                });
            }

            MSP.send_message(MSPCodes.MSP_SET_RX_MAP, serializeRxMap(RC_MAP), false, save_rssi_config);
        });

        $("a.sticks").click(function() {
            var
                windowWidth = 370,
                windowHeight = 510;

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
                    if (CONFIGURATOR.connectionValid && GUI.active_tab !== 'cli') {
                        mspHelper.setRawRx(channels);
                        return true;
                    } else {
                        return false;
                    }
                }

                windowWatcherUtil.passValue(createdWindow, 'darkTheme', DarkTheme.isDarkThemeEnabled(DarkTheme.configEnabled));

            });
        });

        // RC Smoothing
        if (semver.gte(CONFIG.apiVersion, "1.40.0")) {
            $('.tab-receiver .rcSmoothing').show();

            var rc_smoothing_protocol_e = $('select[name="rcSmoothing-select"]');
            rc_smoothing_protocol_e.change(function () {
                RX_CONFIG.rcSmoothingType = $(this).val();
                updateInterpolationView();
            });
            rc_smoothing_protocol_e.val(RX_CONFIG.rcSmoothingType);

            var rcSmoothingnNumberElement = $('input[name="rcSmoothingInputHz-number"]');
            var rcSmoothingnDerivativeNumberElement = $('input[name="rcSmoothingDerivativeCutoff-number"]');

            $('.tab-receiver .rcSmoothing-input-cutoff').show();
            $('select[name="rcSmoothing-input-manual-select"]').val("1");
            if (RX_CONFIG.rcSmoothingInputCutoff == 0) {
                $('.tab-receiver .rcSmoothing-input-cutoff').hide();
                $('select[name="rcSmoothing-input-manual-select"]').val("0");
            }
            $('select[name="rcSmoothing-input-manual-select"]').change(function () {
                if ($(this).val() == 0) {
                    RX_CONFIG.rcSmoothingInputCutoff = 0;
                    $('.tab-receiver .rcSmoothing-input-cutoff').hide();
                }
                if ($(this).val() == 1) {
                    rcSmoothingnNumberElement.val(RX_CONFIG.rcSmoothingInputCutoff);
                    $('.tab-receiver .rcSmoothing-input-cutoff').show();
                }
            });

            $('.tab-receiver .rcSmoothing-derivative-cutoff').show();
            $('select[name="rcSmoothing-input-derivative-select"]').val("1");
            if (RX_CONFIG.rcSmoothingDerivativeCutoff == 0) {
                $('select[name="rcSmoothing-input-derivative-select"]').val("0");
                $('.tab-receiver .rcSmoothing-derivative-cutoff').hide();
            }
            $('select[name="rcSmoothing-input-derivative-select"]').change(function () {
                if ($(this).val() == 0) {
                    $('.tab-receiver .rcSmoothing-derivative-cutoff').hide();
                    RX_CONFIG.rcSmoothingDerivativeCutoff = 0;
                }
                if ($(this).val() == 1) {
                    $('.tab-receiver .rcSmoothing-derivative-cutoff').show();
                    rcSmoothingnDerivativeNumberElement.val(RX_CONFIG.rcSmoothingDerivativeCutoff);
                }
            });

            rcSmoothingnNumberElement.change(function () {
                RX_CONFIG.rcSmoothingInputCutoff = $(this).val();
            });
            rcSmoothingnNumberElement.val(RX_CONFIG.rcSmoothingInputCutoff);

            rcSmoothingnDerivativeNumberElement.change(function () {
                RX_CONFIG.rcSmoothingDerivativeCutoff = $(this).val();
            });
            rcSmoothingnDerivativeNumberElement.val(RX_CONFIG.rcSmoothingDerivativeCutoff);
            var rc_smoothing_derivative_type = $('select[name="rcSmoothingDerivativeType-select"]');
            rc_smoothing_derivative_type.change(function () {
                RX_CONFIG.rcSmoothingDerivativeType = $(this).val();
            });
            rc_smoothing_derivative_type.val(RX_CONFIG.rcSmoothingDerivativeType);
            var rc_smoothing_channels = $('select[name="rcSmoothingChannels-select"]');
            rc_smoothing_channels.change(function () {
                RX_CONFIG.rcInterpolationChannels = $(this).val();
            });
            rc_smoothing_channels.val(RX_CONFIG.rcInterpolationChannels);
            var rc_smoothing_input_type = $('select[name="rcSmoothingInputType-select"]');
            rc_smoothing_input_type.change(function () {
                RX_CONFIG.rcSmoothingInputType = $(this).val();
            });
            rc_smoothing_input_type.val(RX_CONFIG.rcSmoothingInputType);

            if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
                $('select[name="rcSmoothing-input-manual-select"], select[name="rcSmoothing-input-derivative-select"]').change(function() {
                    if ($('select[name="rcSmoothing-input-manual-select"]').val() == 0 || $('select[name="rcSmoothing-input-derivative-select"]').val() == 0) {
                        $('.tab-receiver .rcSmoothing-auto-smoothness').show();
                    } else {
                        $('.tab-receiver .rcSmoothing-auto-smoothness').hide();
                    }
                });
                $('select[name="rcSmoothing-input-manual-select"]').change();

                var rc_smoothing_auto_smoothness = $('input[name="rcSmoothingAutoSmoothness-number"]');
                rc_smoothing_auto_smoothness.change(function() {
                    RX_CONFIG.rcSmoothingAutoSmoothness = $(this).val();
                });
                rc_smoothing_auto_smoothness.val(RX_CONFIG.rcSmoothingAutoSmoothness);
            } else {
                $('.tab-receiver .rcSmoothing-auto-smoothness').hide();
            }

            updateInterpolationView();
        } else {
            $('.tab-receiver .rcInterpolation').show();
            $('.tab-receiver .rcSmoothing-derivative-cutoff').hide();
            $('.tab-receiver .rcSmoothing-input-cutoff').hide();
            $('.tab-receiver .rcSmoothing-derivative-type').hide();
            $('.tab-receiver .rcSmoothing-input-type').hide();
            $('.tab-receiver .rcSmoothing-derivative-manual').hide();
            $('.tab-receiver .rcSmoothing-input-manual').hide();
            $('.tab-receiver .rc-smoothing-type').hide();
            $('.tab-receiver .rcSmoothing-auto-smoothness').hide();
        }

        // Only show the MSP control sticks if the MSP Rx feature is enabled
        $(".sticks_btn").toggle(FEATURE_CONFIG.features.isEnabled('RX_MSP'));

        $('select[name="rx_refresh_rate"]').change(function () {
            var plot_update_rate = parseInt($(this).val(), 10);

            // save update rate
            ConfigStorage.set({'rx_refresh_rate': plot_update_rate});

            function get_rc_data() {
                MSP.send_message(MSPCodes.MSP_RC, false, false, update_ui);
            }

            // setup plot
            var RX_plot_data = new Array(RC.active_channels);
            for (var i = 0; i < RX_plot_data.length; i++) {
                RX_plot_data[i] = [];
            }

            var samples = 0,
                svg = d3.select("svg"),
                RX_plot_e = $('#RX_plot'),
                margin = {top: 20, right: 0, bottom: 10, left: 40},
                width, height, widthScale, heightScale;

            function update_receiver_plot_size() {
                width = RX_plot_e.width() - margin.left - margin.right;
                height = RX_plot_e.height() - margin.top - margin.bottom;

                widthScale.range([0, width]);
                heightScale.range([height, 0]);
            }

            function update_ui() {
                // update bars with latest data
                for (var i = 0; i < RC.active_channels; i++) {
                    meter_fill_array[i].css('width', ((RC.channels[i] - meter_scale.min) / (meter_scale.max - meter_scale.min) * 100).clamp(0, 100) + '%');
                    meter_label_array[i].text(RC.channels[i]);
                }

                // push latest data to the main array
                for (var i = 0; i < RC.active_channels; i++) {
                    RX_plot_data[i].push([samples, RC.channels[i]]);
                }

                // Remove old data from array
                while (RX_plot_data[0].length > 300) {
                    for (var i = 0; i < RX_plot_data.length; i++) {
                        RX_plot_data[i].shift();
                    }
                }

                // update required parts of the plot
                widthScale = d3.scale.linear().
                    domain([(samples - 299), samples]);

                heightScale = d3.scale.linear().
                    domain([800, 2200]);

                update_receiver_plot_size();

                var xGrid = d3.svg.axis().
                    scale(widthScale).
                    orient("bottom").
                    tickSize(-height, 0, 0).
                    tickFormat("");

                var yGrid = d3.svg.axis().
                    scale(heightScale).
                    orient("left").
                    tickSize(-width, 0, 0).
                    tickFormat("");

                var xAxis = d3.svg.axis().
                    scale(widthScale).
                    orient("bottom").
                    tickFormat(function (d) {return d;});

                var yAxis = d3.svg.axis().
                    scale(heightScale).
                    orient("left").
                    tickFormat(function (d) {return d;});

                var line = d3.svg.line().
                    x(function (d) {return widthScale(d[0]);}).
                    y(function (d) {return heightScale(d[1]);});

                svg.select(".x.grid").call(xGrid);
                svg.select(".y.grid").call(yGrid);
                svg.select(".x.axis").call(xAxis);
                svg.select(".y.axis").call(yAxis);

                var data = svg.select("g.data"),
                    lines = data.selectAll("path").data(RX_plot_data, function (d, i) {return i;}),
                    newLines = lines.enter().append("path").attr("class", "line");
                lines.attr('d', line);

                samples++;
            }

            // timer initialization
            GUI.interval_remove('receiver_pull');

            // enable RC data pulling
            GUI.interval_add('receiver_pull', get_rc_data, plot_update_rate, true);
        });

        ConfigStorage.get('rx_refresh_rate', function (result) {
            if (result.rx_refresh_rate) {
                $('select[name="rx_refresh_rate"]').val(result.rx_refresh_rate).change();
            } else {
                $('select[name="rx_refresh_rate"]').change(); // start with default value
            }
        });

        // Setup model for preview
        tab.initModelPreview();
        tab.renderModel();

        // TODO: Combine two polls together
        GUI.interval_add('receiver_pull_for_model_preview', tab.getRecieverData, 33, false);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

TABS.receiver.getRecieverData = function () {
    MSP.send_message(MSPCodes.MSP_RC, false, false);
};

TABS.receiver.initModelPreview = function () {
    this.keepRendering = true;
    this.model = new Model($('.model_preview'), $('.model_preview canvas'));

    this.useSuperExpo = false;
    if (semver.gte(CONFIG.apiVersion, "1.20.0") || (semver.gte(CONFIG.apiVersion, "1.16.0") && FEATURE_CONFIG.features.isEnabled('SUPEREXPO_RATES'))) {
        this.useSuperExpo = true;
    }

    var useOldRateCurve = false;
    if (CONFIG.flightControllerIdentifier == 'CLFL' && semver.lt(CONFIG.apiVersion, '2.0.0')) {
        useOldRateCurve = true;
    }
    if (CONFIG.flightControllerIdentifier == 'BTFL' && semver.lt(CONFIG.flightControllerVersion, '2.8.0')) {
        useOldRateCurve = true;
    }

    this.rateCurve = new RateCurve(useOldRateCurve);

    $(window).on('resize', $.proxy(this.model.resize, this.model));
};

TABS.receiver.renderModel = function () {
    if (this.keepRendering) { requestAnimationFrame(this.renderModel.bind(this)); }

    if (!this.clock) { this.clock = new THREE.Clock(); }

    if (RC.channels[0] && RC.channels[1] && RC.channels[2]) {
        var delta = this.clock.getDelta();

        var roll  = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(RC.channels[0], RC_tuning.roll_rate, RC_tuning.RC_RATE, RC_tuning.RC_EXPO, this.useSuperExpo, this.deadband, RC_tuning.roll_rate_limit),
            pitch = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(RC.channels[1], RC_tuning.pitch_rate, RC_tuning.rcPitchRate, RC_tuning.RC_PITCH_EXPO, this.useSuperExpo, this.deadband, RC_tuning.pitch_rate_limit),
            yaw   = delta * this.rateCurve.rcCommandRawToDegreesPerSecond(RC.channels[2], RC_tuning.yaw_rate, RC_tuning.rcYawRate, RC_tuning.RC_YAW_EXPO, this.useSuperExpo, this.yawDeadband, RC_tuning.yaw_rate_limit);

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
    var self = this;

    GUI.tab_switch_cleanup(function () {
        self.initialize();

        if (callback) {
            callback();
        }
    });
};

TABS.receiver.updateRcInterpolationParameters = function () {
    if (semver.gte(CONFIG.apiVersion, "1.20.0")) {
        if ($('select[name="rcInterpolation-select"]').val() === '3') {
            $('.tab-receiver .rc-interpolation-manual').show();
        } else {
            $('.tab-receiver .rc-interpolation-manual').hide();
        }
    }
};

function updateInterpolationView() {
    $('.tab-receiver .rcInterpolation').hide();
    $('.tab-receiver .rcSmoothing-derivative-cutoff').show();
    $('.tab-receiver .rcSmoothing-input-cutoff').show();
    $('.tab-receiver .rcSmoothing-derivative-type').show();
    $('.tab-receiver .rcSmoothing-input-type').show();
    $('.tab-receiver .rcSmoothing-derivative-manual').show();
    $('.tab-receiver .rcSmoothing-input-manual').show();
    if (semver.gte(CONFIG.apiVersion, "1.42.0")) {
        if (RX_CONFIG.rcSmoothingDerivativeCutoff == 0 || RX_CONFIG.rcSmoothingInputCutoff == 0) {
            $('.tab-receiver .rcSmoothing-auto-smoothness').show();
        }
    }

    if (RX_CONFIG.rcSmoothingType == 0) {
        $('.tab-receiver .rcInterpolation').show();
        $('.tab-receiver .rcSmoothing-derivative-cutoff').hide();
        $('.tab-receiver .rcSmoothing-input-cutoff').hide();
        $('.tab-receiver .rcSmoothing-derivative-type').hide();
        $('.tab-receiver .rcSmoothing-input-type').hide();
        $('.tab-receiver .rcSmoothing-derivative-manual').hide();
        $('.tab-receiver .rcSmoothing-input-manual').hide();
        $('.tab-receiver .rcSmoothing-auto-smoothness').hide();
    }
    if (RX_CONFIG.rcSmoothingDerivativeCutoff == 0) {
        $('.tab-receiver .rcSmoothing-derivative-cutoff').hide();
    }
    if (RX_CONFIG.rcSmoothingInputCutoff == 0) {
        $('.tab-receiver .rcSmoothing-input-cutoff').hide();
    }
}
