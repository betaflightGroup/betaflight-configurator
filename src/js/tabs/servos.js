import { i18n } from "../localization";

const servos = {};
servos.initialize = function (callback) {

    if (GUI.active_tab !== 'servos') {
        GUI.active_tab = 'servos';
    }

    function get_servo_configurations() {
        MSP.send_message(MSPCodes.MSP_SERVO_CONFIGURATIONS, false, false, get_servo_mix_rules);
    }

    function get_servo_mix_rules() {
        MSP.send_message(MSPCodes.MSP_SERVO_MIX_RULES, false, false, get_rc_data);
    }

    function get_rc_data() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, get_boxnames_data);
    }

    function get_boxnames_data() {
        MSP.send_message(MSPCodes.MSP_BOXNAMES, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/servos.html", process_html);
    }
    get_servo_configurations();

    function update_ui() {

        if (semver.lt(FC.CONFIG.apiVersion, "1.12.0") || FC.SERVO_CONFIG.length === 0) {

            $(".tab-servos").removeClass("supported");
            return;
        }

        $(".tab-servos").addClass("supported");

        let servoCheckbox = '';
        let servoHeader = '';
        for (let i = 0; i < FC.RC.active_channels-4; i++) {
            servoHeader += `<th>A${(i+1)}</th>`;
        }
        servoHeader += '<th style="width: 110px" i18n="servosDirectionAndRate"></th>';

        for (let i = 0; i < FC.RC.active_channels; i++) {
            servoCheckbox += `<td class="channel"><input type="checkbox"/></td>`;
        }

        $('div.tab-servos table.fields tr.main').append(servoHeader);

        /*
        *  function: void process_servos(string, object)
        */

        function process_servos(name, obj) {

            $('div.supported_wrapper').show();

            const subElement = `<input type="number" min="500" max="2500" value="`;

            let element = `<tr><td style="text-align: center">${name}</td>`;
            element += `<td class="middle">${subElement}${FC.SERVO_CONFIG[obj].middle}" /></td>`;
            element += `<td class="min">${subElement}${FC.SERVO_CONFIG[obj].min}" /></td>`;
            element += `<td class="max">${subElement}${FC.SERVO_CONFIG[obj].max}" /></td>`;
            element += `${servoCheckbox}<td class="direction"></td></tr>`;

            $('div.tab-servos table.fields').append(element);

            if (FC.SERVO_CONFIG[obj].indexOfChannelToForward >= 0) {
                $('div.tab-servos table.fields tr:last td.channel input').eq(FC.SERVO_CONFIG[obj].indexOfChannelToForward).prop('checked', true);
            }

            // adding select box and generating options
            $('div.tab-servos table.fields tr:last td.direction').append('<select class="rate" name="rate"></select>');

            const select = $('div.tab-servos table.fields tr:last td.direction select');

            for (let i = 100; i > -101; i--) {
                select.append(`<option value="${i}">Rate: ${i}%</option>`);
            }

            // select current rate
            select.val(FC.SERVO_CONFIG[obj].rate);

            $('div.tab-servos table.fields tr:last').data('info', {'obj': obj});

            // UI hooks

            // only one checkbox for indicating a channel to forward can be selected at a time, perhaps a radio group would be best here.
            $('div.tab-servos table.fields tr:last td.channel input').click(function () {
                if($(this).is(':checked')) {
                    $(this).parent().parent().find('.channel input').not($(this)).prop('checked', false);
                }
            });
        }

        /*
        *  function: void servos_update(boolean)
        */

        function servos_update(save_configuration_to_eeprom) {
            $('div.tab-servos table.fields tr:not(".main")').each(function () {
                const info = $(this).data('info');
                const selection = $('.channel input', this);

                let channelIndex = parseInt(selection.index(selection.filter(':checked')));
                if (channelIndex === -1) {
                    channelIndex = undefined;
                }

                FC.SERVO_CONFIG[info.obj].indexOfChannelToForward = channelIndex;


                FC.SERVO_CONFIG[info.obj].middle = parseInt($('.middle input', this).val());
                FC.SERVO_CONFIG[info.obj].min = parseInt($('.min input', this).val());
                FC.SERVO_CONFIG[info.obj].max = parseInt($('.max input', this).val());

                const val = parseInt($('.direction select', this).val());
                FC.SERVO_CONFIG[info.obj].rate = val;
            });

            //
            // send data to FC
            //
            mspHelper.sendServoConfigurations(send_servo_mixer_rules);

            function send_servo_mixer_rules() {
                mspHelper.sendServoConfigurations(save_to_eeprom);
            }

            function save_to_eeprom() {
                if (save_configuration_to_eeprom) {
                    MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                        GUI.log(i18n.getMessage('servosEepromSave'));
                    });
                }
            }

        }

        // drop previous table
        $('div.tab-servos table.fields tr:not(:first)').remove();

        // let's reflect CLI here to number servo's 1-8 instead of 0-7
        for (let servoIndex = 0; servoIndex < 8; servoIndex++) {
            process_servos(`Servo ${servoIndex+1}`, servoIndex);
        }

        const servosWrapper = $('.servos .bar-wrapper');

        for (let i = 0; i < 8; i++) {
            servosWrapper.append(`\
                    <div class="m-block servo-${(7 - i)}">\
                    <div class="meter-bar">\
                    <div class="label"></div>\
                    <div class="indicator">\
                    <div class="label">\
                    <div class="label"></div>\
                    </div>\
                    </div>\
                    </div>\
                    </div>\
            `);
        }

        const rangeMin = 1000;
        const rangeMax = 2000;

        $('div.values li:not(:last)').text(rangeMin);

        /*
        *  void test_update(void);
        */

        function test_update() {

            const blockHeight = 100;
            const fullBlockScale = rangeMax - rangeMin;

            for (let i = 0; i < FC.SERVO_DATA.length; i++) {

                const servoValue = FC.SERVO_DATA[i];
                const barHeight = servoValue - rangeMin;
                const marginTop = blockHeight - (barHeight * (blockHeight / fullBlockScale)).clamp(0, blockHeight);
                const height = (barHeight * (blockHeight / fullBlockScale)).clamp(0, blockHeight);
                const color = parseInt(barHeight * 0.009);

                $(`.servo-${i} .label`, servosWrapper).text(servoValue);
                $(`.servo-${i} .indicator`, servosWrapper).css({
                    'margin-top' : `${marginTop}px`,
                    'height' : `${height}px`,
                    'background-color' : `rgba(255,187,0,1${color})`,
                });
            }
        }

        function get_servo_data() {
            MSP.send_message(MSPCodes.MSP_SERVO, false, false, test_update);
        }

        // UI hooks for dynamically generated elements
        GUI.interval_add('servo_data_pull_and_test_update', get_servo_data, 50);

        $('table.directions select, table.directions input, table.fields select, table.fields input').change(function () {
            if ($('div.live input').is(':checked')) {
                // apply small delay as there seems to be some funky update business going wrong
                GUI.timeout_add('servos_update', servos_update, 10);
            }
        });

        $('a.update').click(function () {
            servos_update(true);
        });

    }

    function process_html() {

        update_ui();

        // translate to user-selected language
        i18n.localizePage();

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function () {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

servos.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};

window.TABS.servos = servos;
export {
    servos
};
