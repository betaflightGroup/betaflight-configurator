import semver from 'semver';
import { i18n } from "../localization";

const ports = {
    analyticsChanges: {},
};

ports.initialize = function (callback, scrollPosition) {
    const self = this;

    let board_definition = {};

    const functionRules = [
        { name: 'MSP',                  groups: ['configuration', 'msp'], maxPorts: 2 },
        { name: 'GPS',                  groups: ['sensors'], maxPorts: 1 },
        { name: 'TELEMETRY_FRSKY',      groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1 },
        { name: 'TELEMETRY_HOTT',       groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1 },
        { name: 'TELEMETRY_SMARTPORT',  groups: ['telemetry'], maxPorts: 1 },
        { name: 'RX_SERIAL',            groups: ['rx'], maxPorts: 1 },
        { name: 'BLACKBOX',     groups: ['peripherals'], sharableWith: ['msp'], notSharableWith: ['telemetry'], maxPorts: 1 },
    ];

    if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
        const ltmFunctionRule = {name: 'TELEMETRY_LTM', groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1};
        functionRules.push(ltmFunctionRule);
    } else {
        const mspFunctionRule = {name: 'TELEMETRY_MSP', groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1};
        functionRules.push(mspFunctionRule);
    }

    if (semver.gte(FC.CONFIG.apiVersion, "1.18.0")) {
        const mavlinkFunctionRule = {name: 'TELEMETRY_MAVLINK', groups: ['telemetry'], sharableWith: ['msp'], notSharableWith: ['peripherals'], maxPorts: 1};
        functionRules.push(mavlinkFunctionRule);
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
        functionRules.push({ name: 'ESC_SENSOR', groups: ['sensors'], maxPorts: 1 });
        functionRules.push({ name: 'TBS_SMARTAUDIO', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(FC.CONFIG.apiVersion, "1.27.0")) {
        functionRules.push({ name: 'IRC_TRAMP', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_32)) {
        functionRules.push({ name: 'TELEMETRY_IBUS', groups: ['telemetry'], maxPorts: 1 });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
        functionRules.push({ name: 'RUNCAM_DEVICE_CONTROL', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
        functionRules.push({ name: 'LIDAR_TF', groups: ['peripherals'], maxPorts: 1 });
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
        functionRules.push({ name: 'FRSKY_OSD', groups: ['peripherals'], maxPorts: 1 });
    }

    for (const rule of functionRules) {
        rule.displayName = i18n.getMessage(`portsFunction_${rule.name}`);
    }

    let mspBaudRates = [
        '9600',
        '19200',
        '38400',
        '57600',
        '115200',
        '230400',
        '250000',
    ];

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
        mspBaudRates = mspBaudRates.concat(['500000', '1000000']);
    }

    const gpsBaudRates = [
        'AUTO',
        '9600',
        '19200',
        '38400',
        '57600',
        '115200',
    ];

    const telemetryBaudRates = [
        'AUTO',
        '9600',
        '19200',
        '38400',
        '57600',
        '115200',
    ];

    const blackboxBaudRates = [
        'AUTO',
        '19200',
        '38400',
        '57600',
        '115200',
        '230400',
        '250000',
        '1500000',
        '2000000',
        '2470000',
    ];

    const columns = ['configuration', 'peripherals', 'sensors', 'telemetry', 'rx'];

    if (GUI.active_tab != 'ports') {
        GUI.active_tab = 'ports';
    }

    load_configuration_from_fc();

    function load_configuration_from_fc() {
        let promise;
        if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            promise = MSP.promise(MSPCodes.MSP_VTX_CONFIG);
        } else {
            promise = Promise.resolve();
        }
        promise.then(function() {
            mspHelper.loadSerialConfig(on_configuration_loaded_handler);
        });

        function on_configuration_loaded_handler() {
            $('#content').load("./tabs/ports.html", on_tab_loaded_handler);

            board_definition = BOARD.find_board_definition(FC.CONFIG.boardIdentifier);
            console.log('Using board definition', board_definition);
        }
    }

    function update_ui() {
        self.analyticsChanges = {};

        if (semver.lt(FC.CONFIG.apiVersion, "1.6.0")) {

            $(".tab-ports").removeClass("supported");
            return;
        }

        $(".tab-ports").addClass("supported");

        const VCP_PORT_IDENTIFIER = 20;

        const portIdentifierToNameMapping = {
           0: 'UART1',
           1: 'UART2',
           2: 'UART3',
           3: 'UART4',
           4: 'UART5',
           5: 'UART6',
           6: 'UART7',
           7: 'UART8',
           8: 'UART9',
           9: 'UART10',
           20: 'USB VCP',
           30: 'SOFTSERIAL1',
           31: 'SOFTSERIAL2',
        };

        let gpsBaudrateElement = $('select.gps_baudrate');
        for (const baudrate of gpsBaudRates) {
            gpsBaudrateElement.append(`<option value="${baudrate}">${baudrate}</option>`);
        }

        let mspBaudrateElement = $('select.msp_baudrate');
        for (const baudrate of mspBaudRates) {
            mspBaudrateElement.append(`<option value="${baudrate}">${baudrate}</option>`);
        }

        let telemetryBaudrateElement = $('select.telemetry_baudrate');
        for (const baudrate of telemetryBaudRates) {
            telemetryBaudrateElement.append(`<option value="${baudrate}">${baudrate}</option>`);
        }

        let blackboxBaudrateElement = $('select.blackbox_baudrate');
        for (const baudrate of blackboxBaudRates) {
            blackboxBaudrateElement.append(`<option value="${baudrate}">${baudrate}</option>`);
        }

        let lastVtxControlSelected;
        const portsElement = $('.tab-ports .ports');
        const portIdentifierTemplateElement = $('#tab-ports-templates .portIdentifier');
        const portConfigurationTemplateElement = $('#tab-ports-templates .portConfiguration');

        for (let portIndex = 0; portIndex < FC.SERIAL_CONFIG.ports.length; portIndex++) {
            const portIdentifierElement = portIdentifierTemplateElement.clone();
            const portConfigurationElement = portConfigurationTemplateElement.clone();
            const serialPort = FC.SERIAL_CONFIG.ports[portIndex];

            portConfigurationElement.data('serialPort', serialPort);

            mspBaudrateElement = portConfigurationElement.find('select.msp_baudrate');
            mspBaudrateElement.val(serialPort.msp_baudrate);

            telemetryBaudrateElement = portConfigurationElement.find('select.telemetry_baudrate');
            telemetryBaudrateElement.val(serialPort.telemetry_baudrate);

            let gpsBaudrate;
            if (serialPort.functions.indexOf('GPS') >= 0) {
                gpsBaudrate = serialPort.gps_baudrate;
            } else {
                gpsBaudrate = 'AUTO';
            }
            gpsBaudrateElement = portConfigurationElement.find('select.gps_baudrate');
            gpsBaudrateElement.val(gpsBaudrate);

            let blackboxBaudrate;
            if (serialPort.functions.indexOf('BLACKBOX') >= 0) {
                blackboxBaudrate = serialPort.blackbox_baudrate;
            } else {
                blackboxBaudrate = 'AUTO';
            }
            blackboxBaudrateElement = portConfigurationElement.find('select.blackbox_baudrate');
            blackboxBaudrateElement.val(blackboxBaudrate);

            portIdentifierElement.find('.identifier').text(portIdentifierToNameMapping[serialPort.identifier]);
            portConfigurationElement.find('.identifier').text(portIdentifierToNameMapping[serialPort.identifier]);

            portConfigurationElement.data('index', portIndex);
            portConfigurationElement.data('port', serialPort);


            for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
                const column = columns[columnIndex];

                const functionsElement = $(portConfigurationElement).find(`.functionsCell-${column}`);

                for (let i = 0; i < functionRules.length; i++) {
                    const functionRule = functionRules[i];
                    const functionName = functionRule.name;

                    if (functionRule.groups.indexOf(column) === -1) {
                        continue;
                    }

                    let selectElement;
                    if (column !== 'telemetry' && column !== 'sensors' && column !== 'peripherals') {
                        const checkboxId = `functionCheckbox-${portIndex}-${columnIndex}-${i}`;
                        let longElement = `<span class="function"><input type="checkbox" class="togglemedium" id=`;
                        longElement += `"${checkboxId}" value="${functionName}" /><label for="${checkboxId}"></label></span>`;
                        functionsElement.prepend(longElement);

                        if (serialPort.functions.indexOf(functionName) >= 0) {
                            const checkboxElement = functionsElement.find(`#${checkboxId}`);
                            checkboxElement.prop("checked", true);
                        }

                        if (serialPort.identifier === VCP_PORT_IDENTIFIER && functionName === "MSP") {
                            const checkboxElement = functionsElement.find(`#${checkboxId}`);
                            checkboxElement.prop("checked", true);
                            checkboxElement.prop("disabled", true);
                        }

                    } else {
                        const selectElementName = `function-${column}`;
                        const selectElementSelector = `select[name=${selectElementName}]`;
                        selectElement = functionsElement.find(selectElementSelector);

                        if (selectElement.length === 0) {
                            functionsElement.prepend(`<span class="function"><select name="${selectElementName}" /></span>`);
                            selectElement = functionsElement.find(selectElementSelector);
                            const disabledText = i18n.getMessage('portsTelemetryDisabled');
                            selectElement.append(`<option value="">${disabledText}</option>`);
                        }
                        selectElement.append(`<option value="${functionName}">${functionRule.displayName}</option>`);

                        if (serialPort.functions.indexOf(functionName) >= 0) {
                            selectElement.val(functionName);

                            if (column === 'peripherals' && (functionName === "TBS_SMARTAUDIO" || functionName === "IRC_TRAMP")) {
                                lastVtxControlSelected = functionName;
                            }
                        }

                        if (column === 'telemetry') {
                            const initialValue = functionName;
                            selectElement.change(function () {
                                const telemetryValue = $(this).val();

                                let newValue;
                                if (telemetryValue !== initialValue) {
                                    newValue = $(this).find('option:selected').text();
                                }
                                self.analyticsChanges['Telemetry'] = newValue;
                            });
                        }
                    }
                }
            }

            portsElement.find('tbody').append(portIdentifierElement);
            portsElement.find('tbody').append(portConfigurationElement);
        }

        let vtxTableNotConfigured = true;
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            vtxTableNotConfigured = FC.VTX_CONFIG.vtx_table_available &&
                                        (FC.VTX_CONFIG.vtx_table_bands === 0 ||
                                        FC.VTX_CONFIG.vtx_table_channels === 0 ||
                                        FC.VTX_CONFIG.vtx_table_powerlevels === 0);
        } else {
            $('.vtxTableNotSet').hide();
        }

        const pheripheralsSelectElement = $('select[name="function-peripherals"]');
        pheripheralsSelectElement.change(function() {
            let vtxControlSelected = undefined;
            pheripheralsSelectElement.each(function() {
                const el = $(this);
                if (el.val() === "TBS_SMARTAUDIO" || el.val() === "IRC_TRAMP") {
                    vtxControlSelected = el.val();
                }
            });

            if (lastVtxControlSelected !== vtxControlSelected) {
                self.analyticsChanges['VtxControl'] = vtxControlSelected;

                lastVtxControlSelected = vtxControlSelected;
            }

            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                if (vtxControlSelected && vtxTableNotConfigured) {
                    $('.vtxTableNotSet').show();
                } else {
                    $('.vtxTableNotSet').hide();
                }
            }
        });
        pheripheralsSelectElement.change();
    }

    function on_tab_loaded_handler() {

        i18n.localizePage();

        update_ui();

        $('a.save').click(on_save_handler);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }

   function on_save_handler() {
        analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);
       self.analyticsChanges = {};

        // update configuration based on current ui state
        FC.SERIAL_CONFIG.ports = [];

        $('.tab-ports .portConfiguration').each(function (port, portConfig) {

            const serialPort = $(portConfig).data('serialPort');

            const functions = $(portConfig).find('input:checkbox:checked').map(function() {
                return this.value;
            }).get();

            const telemetryFunction = $(portConfig).find('select[name=function-telemetry]').val();
            if (telemetryFunction) {
                functions.push(telemetryFunction);
            }

            const sensorFunction = $(portConfig).find('select[name=function-sensors]').val();
            if (sensorFunction) {
                functions.push(sensorFunction);
            }

            const peripheralFunction = $(portConfig).find('select[name=function-peripherals]').val();
            if (peripheralFunction) {
                functions.push(peripheralFunction);
            }

            let gpsBaudrate = $(portConfig).find('.gps_baudrate').val();
            if (gpsBaudrate === 'AUTO') {
                gpsBaudrate = '57600';
            }

            let blackboxBaudrate = $(portConfig).find('.blackbox_baudrate').val();
            if (blackboxBaudrate === 'AUTO') {
                blackboxBaudrate = '115200';
            }

            const serialPortConfig = {
                functions: functions,
                msp_baudrate: $(portConfig).find('.msp_baudrate').val(),
                telemetry_baudrate: $(portConfig).find('.telemetry_baudrate').val(),
                gps_baudrate: gpsBaudrate,
                blackbox_baudrate: blackboxBaudrate,
                identifier: serialPort.identifier,
            };
            FC.SERIAL_CONFIG.ports.push(serialPortConfig);
        });

        mspHelper.sendSerialConfig(save_to_eeprom);

        function save_to_eeprom() {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, on_saved_handler);
        }

        function on_saved_handler() {
            GUI.log(i18n.getMessage('configurationEepromSaved'));

            GUI.tab_switch_cleanup(function() {
                MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                reinitialiseConnection(self);
            });
        }
    }
};

ports.cleanup = function (callback) {
    if (callback) callback();
};

// TODO: remove once all tabs are modules
window.TABS.ports = ports;
export { ports };
