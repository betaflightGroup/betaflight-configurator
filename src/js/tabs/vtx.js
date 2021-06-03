import { i18n } from "../localization";

const vtx = {
    supported: false,
    vtxTableSavePending: false,
    vtxTableFactoryBandsSupported: false,
    MAX_POWERLEVEL_VALUES: 8,
    MAX_BAND_VALUES: 8,
    MAX_BAND_CHANNELS_VALUES: 8,
    VTXTABLE_BAND_LIST: [],
    VTXTABLE_POWERLEVEL_LIST: [],
    analyticsChanges: {},
    updating: true,
    env: new djv(),
    get _DEVICE_STATUS_UPDATE_INTERVAL_NAME() {
        return "vtx_device_status_request";
    }
};

vtx.isVtxDeviceStatusNotReady = function()
{
    const isReady = (null !== FC.VTX_DEVICE_STATUS) && (FC.VTX_DEVICE_STATUS.deviceIsReady);
    return !isReady;
};

vtx.updateVtxDeviceStatus = function()
{
    MSP.send_message(MSPCodes.MSP2_GET_VTX_DEVICE_STATUS, false, false, vtxDeviceStatusReceived);

    function vtxDeviceStatusReceived()
    {
        $("#vtx_type_description").text(TABS.vtx.getVtxTypeString());
    }
};

vtx.getVtxTypeString = function()
{
    let result = i18n.getMessage(`vtxType_${FC.VTX_CONFIG.vtx_type}`);

    const isSmartAudio = VtxDeviceTypes.VTXDEV_SMARTAUDIO === FC.VTX_CONFIG.vtx_type;
    const isVtxDeviceStatusReceived = null !== FC.VTX_DEVICE_STATUS;

    if (isSmartAudio && isVtxDeviceStatusReceived) {
        result += ` ${FC.VTX_DEVICE_STATUS.smartAudioVersion}`;
    }

    return result;
};

vtx.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab !== 'vtx') {
        GUI.active_tab = 'vtx';
    }

    self.analyticsChanges = {};

    this.supported = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42);

    if (!this.supported) {
        load_html();
    } else {
        read_vtx_config(load_html);
    }

    function load_html() {
        $('#content').load("./tabs/vtx.html", process_html);
    }

    function process_html() {
        initDisplay();

        // translate to user-selected language
        i18n.localizePage();

        if (GUI.isCordova()) {
            UI_PHONES.initToolbar();
        }

        self.updating = false;
        GUI.content_ready(callback);
    }

    // Read all the MSP data needed by the tab
    function read_vtx_config(callback_after_msp) {

        vtx_config();

        function vtx_config() {
            MSP.send_message(MSPCodes.MSP_VTX_CONFIG, false, false, vtxConfigReceived);
        }

        function vtxConfigReceived() {
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                GUI.interval_add_condition(self._DEVICE_STATUS_UPDATE_INTERVAL_NAME,
                    TABS.vtx.updateVtxDeviceStatus,
                    1000, false,
                    TABS.vtx.isVtxDeviceStatusNotReady
                );
            }

            vtxtable_bands();
        }

        function vtxtable_bands() {

            // Simulation of static variable
            if (typeof vtxtable_bands.counter === 'undefined') {
                TABS.vtx.VTXTABLE_BAND_LIST = [];
                vtxtable_bands.counter = 1;
            } else {
                TABS.vtx.VTXTABLE_BAND_LIST.push(Object.assign({}, FC.VTXTABLE_BAND));
                vtxtable_bands.counter++;
            }

            const buffer = [];
            buffer.push8(vtxtable_bands.counter);

            if (vtxtable_bands.counter <= FC.VTX_CONFIG.vtx_table_bands) {
                MSP.send_message(MSPCodes.MSP_VTXTABLE_BAND, buffer, false, vtxtable_bands);
            } else {
                vtxtable_bands.counter = undefined;
                vtxtable_powerlevels();
            }

        }

        function vtxtable_powerlevels() {

            // Simulation of static variable
            if (typeof vtxtable_powerlevels.counter === 'undefined') {
                TABS.vtx.VTXTABLE_POWERLEVEL_LIST = [];
                vtxtable_powerlevels.counter = 1;
            } else {
                TABS.vtx.VTXTABLE_POWERLEVEL_LIST.push(Object.assign({}, FC.VTXTABLE_POWERLEVEL));
                vtxtable_powerlevels.counter++;
            }

            const buffer = [];
            buffer.push8(vtxtable_powerlevels.counter);

            if (vtxtable_powerlevels.counter <= FC.VTX_CONFIG.vtx_table_powerlevels) {
                MSP.send_message(MSPCodes.MSP_VTXTABLE_POWERLEVEL, buffer, false, vtxtable_powerlevels);
            } else {
                vtxtable_powerlevels.counter = undefined;
                callback_after_msp();
            }
        }
    }

    // Validates the vtxConfig object against a JSON Schema
    function validateVtxJson(vtxConfig, callback_valid, callback_error) {

        // At minimum the version must be defined
        if (!vtxConfig.version) {
            console.error("Validation against schema failed, version missing");
            callback_error();
        }

        // Load schema
        const urlVtxSchema = chrome.runtime.getURL(`resources/jsonschema/vtxconfig_schema-${vtxConfig.version}.json`);

        if (GUI.isCordova()) {
            // FIXME On android : Fetch API cannot load : URL scheme "file" is not supported
            callback_valid();
        } else {
            fetch(urlVtxSchema)
                .then(response => response.json())
                .catch(error => console.error('Error fetching VTX Schema:', error))
                .then(schemaJson => {

                    let valid = false;
                    if (schemaJson !== undefined) {
                        // Validate
                        valid = (TABS.vtx.env.validate(schemaJson, vtxConfig) === undefined);
                    }

                    console.log("Validation against schema result:", valid);
                    valid ? callback_valid() : callback_error();
                }
            );
        }

    }

    // Emulates the MSP read from a vtxConfig object (JSON)
    function read_vtx_config_json(vtxConfig, vtxcallback_after_read) {

        // Bands and channels
        FC.VTX_CONFIG.vtx_table_bands = vtxConfig.vtx_table.bands_list.length;


        let maxChannels = 0;
        TABS.vtx.VTXTABLE_BAND_LIST = [];
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_bands; i++) {
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1] = {};
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_number = i;
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_name = vtxConfig.vtx_table.bands_list[i - 1].name;
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_letter = vtxConfig.vtx_table.bands_list[i - 1].letter;
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_is_factory_band = vtxConfig.vtx_table.bands_list[i - 1].is_factory_band;
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies = vtxConfig.vtx_table.bands_list[i - 1].frequencies;

            maxChannels = Math.max(maxChannels, TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies.length);
        }

        FC.VTX_CONFIG.vtx_table_channels = maxChannels;

        // Power levels
        FC.VTX_CONFIG.vtx_table_powerlevels = vtxConfig.vtx_table.powerlevels_list.length;

        TABS.vtx.VTXTABLE_POWERLEVEL_LIST = [];
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_powerlevels; i++) {
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1] = {};
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_number = i;
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_value = vtxConfig.vtx_table.powerlevels_list[i - 1].value;
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_label = vtxConfig.vtx_table.powerlevels_list[i - 1].label;
        }

        vtxcallback_after_read();
    }

    // Prepares all the UI elements, the MSP command has been executed before
    function initDisplay() {

        if (!TABS.vtx.supported) {
            $(".tab-vtx").removeClass("supported");
            return;
        }

        $(".tab-vtx").addClass("supported");

        // Load all the dynamic elements
        loadPowerLevelsTemplate();
        loadBandsChannelsTemplate();
        populateBandSelect();
        populatePowerSelect();

        $(".uppercase").keyup(function(){
            this.value = this.value.toUpperCase().trim();
        });

        // Supported?
        const vtxSupported = FC.VTX_CONFIG.vtx_type !== VtxDeviceTypes.VTXDEV_UNSUPPORTED && FC.VTX_CONFIG.vtx_type !== VtxDeviceTypes.VTXDEV_UNKNOWN;
        const vtxTableNotConfigured = vtxSupported && FC.VTX_CONFIG.vtx_table_available &&
            (FC.VTX_CONFIG.vtx_table_bands === 0 || FC.VTX_CONFIG.vtx_table_channels === 0 || FC.VTX_CONFIG.vtx_table_powerlevels === 0);

        TABS.vtx.vtxTableFactoryBandsSupported = FC.VTX_CONFIG.vtx_type === VtxDeviceTypes.VTXDEV_SMARTAUDIO;

        $(".vtx_supported").toggle(vtxSupported);
        $(".vtx_not_supported").toggle(!vtxSupported);
        $(".vtx_table_available").toggle(vtxSupported && FC.VTX_CONFIG.vtx_table_available);
        $(".vtx_table_not_configured").toggle(vtxTableNotConfigured);
        $(".vtx_table_save_pending").toggle(TABS.vtx.vtxTableSavePending);
        $(".factory_band").toggle(TABS.vtx.vtxTableFactoryBandsSupported);

        // Buttons
        $('.clipboard_available').toggle(Clipboard.available && Clipboard.readAvailable);

        // Insert actual values in the fields
        // Values of the selected mode
        $("#vtx_frequency").val(FC.VTX_CONFIG.vtx_frequency);
        $("#vtx_band").val(FC.VTX_CONFIG.vtx_band);

        $("#vtx_band").change(populateChannelSelect).change();

        $("#vtx_channel").val(FC.VTX_CONFIG.vtx_channel);
        if (FC.VTX_CONFIG.vtx_table_available) {
            $("#vtx_channel").attr("max", FC.VTX_CONFIG.vtx_table_channels);
        }

        $("#vtx_power").val(FC.VTX_CONFIG.vtx_power);
        $("#vtx_pit_mode").prop('checked', FC.VTX_CONFIG.vtx_pit_mode);
        $("#vtx_pit_mode_frequency").val(FC.VTX_CONFIG.vtx_pit_mode_frequency);
        $("#vtx_low_power_disarm").val(FC.VTX_CONFIG.vtx_low_power_disarm);

        // Values of the current values
        const yesMessage =  i18n.getMessage("yes");
        const noMessage =  i18n.getMessage("no");

        $("#vtx_device_ready_description").text(FC.VTX_CONFIG.vtx_device_ready ? yesMessage : noMessage);
        $("#vtx_type_description").text(self.getVtxTypeString());
        $("#vtx_channel_description").text(FC.VTX_CONFIG.vtx_channel);
        $("#vtx_frequency_description").text(FC.VTX_CONFIG.vtx_frequency);
        $("#vtx_pit_mode_description").text(FC.VTX_CONFIG.vtx_pit_mode ? yesMessage : noMessage);
        $("#vtx_pit_mode_frequency_description").text(FC.VTX_CONFIG.vtx_pit_mode_frequency);
        $("#vtx_low_power_disarm_description").text(i18n.getMessage(`vtxLowPowerDisarmOption_${FC.VTX_CONFIG.vtx_low_power_disarm}`));

        if (FC.VTX_CONFIG.vtx_band === 0) {
            $("#vtx_band_description").text(i18n.getMessage("vtxBand_0"));
        } else {
            if (FC.VTX_CONFIG.vtx_table_available && TABS.vtx.VTXTABLE_BAND_LIST[FC.VTX_CONFIG.vtx_band - 1]) {
                let bandName = TABS.vtx.VTXTABLE_BAND_LIST[FC.VTX_CONFIG.vtx_band - 1].vtxtable_band_name;
                if (bandName.trim() === '') {
                    bandName = FC.VTX_CONFIG.vtx_band;
                }
                $("#vtx_band_description").text(bandName);
            } else {
                $("#vtx_band_description").text(FC.VTX_CONFIG.vtx_band);
            }
        }

        if (FC.VTX_CONFIG.vtx_power === 0) {
            $("#vtx_power_description").text(i18n.getMessage("vtxPower_0"));
        } else {
            if (FC.VTX_CONFIG.vtx_table_available) {
                let powerLevel = TABS.vtx.VTXTABLE_POWERLEVEL_LIST[FC.VTX_CONFIG.vtx_power - 1].vtxtable_powerlevel_label;
                if (powerLevel.trim() === '') {
                    powerLevel = FC.VTX_CONFIG.vtx_power;
                }
                $("#vtx_power_description").text(powerLevel);
            } else {
                const levelText = i18n.getMessage('vtxPower_X', {powerLevel: FC.VTX_CONFIG.vtx_power});
                $("#vtx_power_description").text(levelText);
            }
        }

        $("#vtx_table_powerlevels").val(FC.VTX_CONFIG.vtx_table_powerlevels);

        // Populate power levels
        for (let i = 1; i <= TABS.vtx.VTXTABLE_POWERLEVEL_LIST.length; i++) {
            $(`#vtx_table_powerlevels_${i}`).val(TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_value);
            $(`#vtx_table_powerlabels_${i}`).val(TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_label);
        }

        $("#vtx_table_bands").val(FC.VTX_CONFIG.vtx_table_bands);
        $("#vtx_table_channels").val(FC.VTX_CONFIG.vtx_table_channels);

        // Populate VTX Table
        let hasFactoryBands = false;
        for (let i = 1; i <= TABS.vtx.VTXTABLE_BAND_LIST.length; i++) {
            $(`#vtx_table_band_name_${i}`).val(TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_name);
            $(`#vtx_table_band_letter_${i}`).val(TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_letter);
            $(`#vtx_table_band_factory_${i}`).prop("checked", TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_is_factory_band);
            hasFactoryBands = hasFactoryBands || TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_is_factory_band;
            for (let j = 1; j <= TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies.length; j++) {
                $(`#vtx_table_band_channel_${i}_${j}`).val(TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies[j - 1]);
            }
        }

        $(".vtx_table_factory_bands_not_supported").toggle(!TABS.vtx.vtxTableFactoryBandsSupported && hasFactoryBands);

        // Actions and other
        function frequencyOrBandChannel() {

            const frequencyEnabled = $(this).prop('checked');

            if (frequencyEnabled) {
                $(".field.vtx_channel").slideUp(100, function() {
                    $(".field.vtx_band").slideUp(100, function() {
                        $(".field.vtx_frequency").slideDown(100);
                    });
                });

            } else {
                $(".field.vtx_frequency").slideUp(100, function() {
                    $(".field.vtx_band").slideDown(100,function() {
                        $(".field.vtx_channel").slideDown(100);
                    });
                });
            }
        }

        $("#vtx_frequency_channel").prop('checked', FC.VTX_CONFIG.vtx_band === 0 && FC.VTX_CONFIG.vtx_frequency > 0).change(frequencyOrBandChannel);

        if ($("#vtx_frequency_channel").prop('checked')) {
            $(".field.vtx_channel").hide();
            $(".field.vtx_band").hide();
            $(".field.vtx_frequency").show();
        } else {
            $(".field.vtx_channel").show();
            $(".field.vtx_band").show();
            $(".field.vtx_frequency").hide();
        }

        function showHidePowerlevels() {
            const powerlevelsValue = $(this).val();

            for (let i = 1; i <= TABS.vtx.MAX_POWERLEVEL_VALUES; i++) {
                $(`.vtx_table_powerlevels_table td:nth-child(${i})`).toggle(i <= powerlevelsValue);
            }
        }

        $("#vtx_table_powerlevels").on('input', showHidePowerlevels).trigger('input');

        function showHideBands() {
            const bandsValue = $(this).val();

            for (let i = 1; i <= TABS.vtx.MAX_BAND_VALUES; i++) {
                $(`.vtx_table_bands_table tr:nth-child(${(i + 1)})`).toggle(i <= bandsValue);
            }
        }

        $("#vtx_table_bands").on('input', showHideBands).trigger('input');

        function showHideBandChannels() {
            const channelsValue = $(this).val();

            for (let i = 1; i <= TABS.vtx.MAX_BAND_CHANNELS_VALUES; i++) {
                $(`.vtx_table_bands_table td:nth-child(${(i + 3)})`).toggle(i <= channelsValue);
            }
        }

        $("#vtx_table_channels").on('input', showHideBandChannels).trigger('input');
        $("#vtx_table").change(function() {
            let fromScratch = true;
            if (self.analyticsChanges['VtxTableLoadFromClipboard'] !== undefined || self.analyticsChanges['VtxTableLoadFromFile'] !== undefined) {
                fromScratch = false;
            }
            self.analyticsChanges['VtxTableEdit'] = fromScratch ? 'modificationOnly' : 'fromTemplate';
        });

        /*** Helper functions */

        function loadPowerLevelsTemplate() {

            // Power levels title
            const powerLevelsTitleEle = $(".vtx_table_powerlevels_table .vtx_table_powerlevels_title");

            for (let i = 1; i <= TABS.vtx.MAX_POWERLEVEL_VALUES; i++) {
                powerLevelsTitleEle.append(`<td><span>${i}</span></td>`);
            }

            // Power levels
            const powerLevelsRowEle = $(".vtx_table_powerlevels_table .vtx_table_powerlevels_values");

            const powerValuesEle = $("#tab-vtx-templates #tab-vtx-powerlevel-values td");
            for (let i = 1; i <= TABS.vtx.MAX_POWERLEVEL_VALUES; i++) {
                const newPowerValuesEle = powerValuesEle.clone();
                $(newPowerValuesEle).find('input').attr('id', `vtx_table_powerlevels_${i}`);
                powerLevelsRowEle.append(newPowerValuesEle);
            }
            powerLevelsRowEle.append(`<td><span>${i18n.getMessage('vtxTablePowerLevelsValue')}</span></td>`);

            // Power labels
            const powerLabelsRowEle = $(".vtx_table_powerlevels_table .vtx_table_powerlevels_labels");

            const powerLabelsEle = $("#tab-vtx-templates #tab-vtx-powerlevel-labels td");
            for (let i = 1; i <= TABS.vtx.MAX_POWERLEVEL_VALUES; i++) {
                const newPowerLabelsEle = powerLabelsEle.clone();
                $(newPowerLabelsEle).find('input').attr('id', `vtx_table_powerlabels_${i}`);
                powerLabelsRowEle.append(newPowerLabelsEle);
            }
            powerLabelsRowEle.append(`<td><span>${i18n.getMessage('vtxTablePowerLevelsLabel')}</span></td>`);
        }

        function loadBandsChannelsTemplate() {
            const bandsTableEle = $(".vtx_table_bands_table tbody");

            // Title
            const titleEle = $("#tab-vtx-templates #tab-vtx-bands-title tr");

            for (let i = 1; i <= TABS.vtx.MAX_BAND_VALUES; i++) {
                titleEle.append(`<td><span>${i}</span></td>`);
            }
            bandsTableEle.append(titleEle);

            // Bands
            const bandEle = $("#tab-vtx-templates #tab-vtx-bands tr");
            const channelEle = $("#tab-vtx-templates #tab-vtx-channels td");
            for (let i = 1; i <= TABS.vtx.MAX_BAND_VALUES; i++) {
                const newBandEle = bandEle.clone();
                $(newBandEle).find('#vtx_table_band_name').attr('id', `vtx_table_band_name_${i}`);
                $(newBandEle).find('#vtx_table_band_letter').attr('id', `vtx_table_band_letter_${i}`);
                $(newBandEle).find('#vtx_table_band_factory').attr('id', `vtx_table_band_factory_${i}`);

                // Channels
                for (let j = 1; j <= TABS.vtx.MAX_BAND_CHANNELS_VALUES; j++) {
                    const newChannelEle = channelEle.clone();
                    $(newChannelEle).find('input').attr('id', `vtx_table_band_channel_${i}_${j}`);

                    newBandEle.append(newChannelEle);
                }

                // Append to the end an index of the band
                newBandEle.append(`<td><span>${i18n.getMessage("vtxBand_X", {bandName: i})}</span></td>`);

                bandsTableEle.append(newBandEle);
            }
        }

        function populateBandSelect() {

            const selectBand = $(".field #vtx_band");

            selectBand.append(new Option(i18n.getMessage('vtxBand_0'), 0));
            if (FC.VTX_CONFIG.vtx_table_available) {
                for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_bands; i++) {
                    let bandName = TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_name;
                    if (bandName.trim() === '') {
                        bandName = i18n.getMessage('vtxBand_X', {bandName: i});
                    }
                    selectBand.append(new Option(bandName, i));
                }
            } else {
                for (let i = 1; i <= TABS.vtx.MAX_BAND_VALUES; i++) {
                    selectBand.append(new Option(i18n.getMessage('vtxBand_X', {bandName: i}), i));
                }
            }
        }

        function populateChannelSelect() {

            const selectChannel = $(".field #vtx_channel");
            const selectedBand = $("#vtx_band").val();

            selectChannel.empty();

            selectChannel.append(new Option(i18n.getMessage('vtxChannel_0'), 0));
            if (FC.VTX_CONFIG.vtx_table_available) {
                if (TABS.vtx.VTXTABLE_BAND_LIST[selectedBand - 1]) {
                    for (let i = 1; i <= TABS.vtx.VTXTABLE_BAND_LIST[selectedBand - 1].vtxtable_band_frequencies.length; i++) {
                        const channelName = TABS.vtx.VTXTABLE_BAND_LIST[selectedBand - 1].vtxtable_band_frequencies[i - 1];
                        if (channelName > 0) {
                            selectChannel.append(new Option(i18n.getMessage('vtxChannel_X', {channelName: i}), i));
                        }
                    }
                }
            } else {
                for (let i = 1; i <= TABS.vtx.MAX_BAND_CHANNELS_VALUES; i++) {
                    selectChannel.append(new Option(i18n.getMessage('vtxChannel_X', {channelName: i}), i));
                }
            }
        }

        function populatePowerSelect() {
            const selectPower = $(".field #vtx_power");

            if (FC.VTX_CONFIG.vtx_table_available) {
                selectPower.append(new Option(i18n.getMessage('vtxPower_0'), 0));
                for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_powerlevels; i++) {
                    let powerLevel = TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_label;
                    if (powerLevel.trim() === '') {
                        powerLevel = i18n.getMessage('vtxPower_X', {powerLevel: i});
                    }
                    selectPower.append(new Option(powerLevel, i));
                }
            } else {
                const powerMaxMinValues = getPowerValues(FC.VTX_CONFIG.vtx_type);
                for (let i = powerMaxMinValues.min; i <= powerMaxMinValues.max; i++) {
                    if (i === 0) {
                        selectPower.append(new Option(i18n.getMessage('vtxPower_0'), 0));
                    } else {
                        selectPower.append(new Option(i18n.getMessage('vtxPower_X', {powerLevel: i}), i));
                    }
                }
            }
        }

        // Returns the power values min and max depending on the VTX Type
        function getPowerValues(vtxType) {

            let powerMinMax = {};

            if (FC.VTX_CONFIG.vtx_table_available) {
                powerMinMax = {min: 1, max: FC.VTX_CONFIG.vtx_table_powerlevels};
            } else {

                switch (vtxType) {

                case VtxDeviceTypes.VTXDEV_UNSUPPORTED:
                    powerMinMax = {};
                    break;

                case VtxDeviceTypes.VTXDEV_RTC6705:
                    powerMinMax = {min: 1, max: 3};
                    break;

                case VtxDeviceTypes.VTXDEV_SMARTAUDIO:
                    powerMinMax = {min: 1, max: 4};
                    break;

                case VtxDeviceTypes.VTXDEV_TRAMP:
                    powerMinMax = {min: 1, max: 5};
                    break;

                case VtxDeviceTypes.VTXDEV_UNKNOWN:
                default:
                    powerMinMax = {min: 0, max: 7};
                }
            }
            return powerMinMax;
        }

        // Save and other button functions
        $('a.save_file').click(function () {
            save_json();
        });

        $('a.save_lua').click(function () {
            save_lua();
        });

        $('a.load_file').click(function () {
            load_json();
        });

        $('a.load_clipboard').click(function () {
            load_clipboard_json();
        });

        $('a.save').click(function () {
            if (!self.updating) {
                save_vtx();
            }
        });

    }

    function save_lua() {
        const suffix = 'lua';

        const uid0 = FC.CONFIG.uid[0].toString(16).padStart(8, '0');
        const uid1 = FC.CONFIG.uid[1].toString(16).padStart(8, '0');
        const uid2 = FC.CONFIG.uid[2].toString(16).padStart(8, '0');

        const filename = `${uid0}${uid1}${uid2}.${suffix}`;

        const accepts = [{
            description: `${suffix.toUpperCase()} files`, extensions: [suffix],
        }];

        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename, accepts}, function(entry) {
            if (checkChromeRuntimeError()) {
                return;
            }

            entry.createWriter(function (writer) {

                writer.onerror = function(){
                    console.error('Failed to write VTX table lua file');
                    GUI.log(i18n.getMessage('vtxSavedFileKo'));
                };

                writer.onwriteend = function() {
                    dump_html_to_msp();
                    const vtxConfig = createVtxConfigInfo();
                    const text = createLuaTables(vtxConfig);
                    const data = new Blob([text], { type: "application/text" });

                    // we get here at the end of the truncate method, change to the new end
                    writer.onwriteend = function() {
                        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'VtxTableLuaSave', text.length);
                        console.log('Write VTX table lua file end');
                        GUI.log(i18n.getMessage('vtxSavedFileOk'));
                    };

                    writer.write(data);
                };

                writer.truncate(0);

            }, function (){
                console.error('Failed to get VTX table lua file writer');
                GUI.log(i18n.getMessage('vtxSavedFileKo'));
            });
        });
    }
    function save_json() {
        const suggestedName = 'vtxtable';
        const suffix = 'json';

        const filename = generateFilename(suggestedName, suffix);

        const accepts = [{
            description: `${suffix.toUpperCase()} files`, extensions: [suffix],
        }];

        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename, accepts}, function(entry) {
            if (checkChromeRuntimeError()) {
                return;
            }

            if (!entry) {
                console.log('No file selected');
                return;
            }

            entry.createWriter(function (writer) {

                writer.onerror = function(){
                    console.error('Failed to write VTX file');
                    GUI.log(i18n.getMessage('vtxSavedFileKo'));
                };

                writer.onwriteend = function() {
                    dump_html_to_msp();
                    const vtxConfig = createVtxConfigInfo();
                    const text = JSON.stringify(vtxConfig, null, 4);
                    const data = new Blob([text], { type: "application/json" });

                    // we get here at the end of the truncate method, change to the new end
                    writer.onwriteend = function() {
                        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'VtxTableSave', text.length);
                        console.log(vtxConfig);
                        console.log('Write VTX file end');
                        GUI.log(i18n.getMessage('vtxSavedFileOk'));
                    };

                    writer.write(data);
                };

                writer.truncate(0);

            }, function (){
                console.error('Failed to get VTX file writer');
                GUI.log(i18n.getMessage('vtxSavedFileKo'));
            });
        });
    }

    function load_json() {

        const suffix = 'json';

        const accepts = [{
            description: `${suffix.toUpperCase()} files`, extensions: [suffix],
        }];

        chrome.fileSystem.chooseEntry({type: 'openFile', accepts}, function(entry) {
            if (checkChromeRuntimeError()) {
                return;
            }

            entry.file(function(file) {

                const reader = new FileReader();

                reader.onload = function(e) {

                    const text = e.target.result;
                    try {

                        const vtxConfig = JSON.parse(text);

                        validateVtxJson(
                            vtxConfig,
                            function() {

                                // JSON is valid
                                read_vtx_config_json(vtxConfig, load_html);

                                TABS.vtx.vtxTableSavePending = true;

                                self.analyticsChanges['VtxTableLoadFromClipboard'] = undefined;
                                self.analyticsChanges['VtxTableLoadFromFile'] = file.name;

                                console.log('Load VTX file end');
                                GUI.log(i18n.getMessage('vtxLoadFileOk'));
                            },
                            function() {

                                // JSON is NOT valid
                                console.error('VTX Config from file failed validation against schema');
                                GUI.log(i18n.getMessage('vtxLoadFileKo'));

                            }
                        );

                    } catch (err) {
                        console.error('Failed loading VTX file config');
                        GUI.log(i18n.getMessage('vtxLoadFileKo'));
                    }
                };

                reader.readAsText(file);

            }, function() {
                console.error('Failed to get VTX file reader');
                GUI.log(i18n.getMessage('vtxLoadFileKo'));
            });
        });
    }

    function load_clipboard_json() {

        try {

            Clipboard.readText(
                function(text) {

                    console.log('Pasted content: ', text);

                    const vtxConfig = JSON.parse(text);

                    validateVtxJson(
                        vtxConfig,
                        function() {

                            // JSON is valid
                            read_vtx_config_json(vtxConfig, load_html);

                            TABS.vtx.vtxTableSavePending = true;

                            self.analyticsChanges['VtxTableLoadFromFile'] = undefined;
                            self.analyticsChanges['VtxTableLoadFromClipboard'] = text.length;

                            console.log('Load VTX clipboard end');
                            GUI.log(i18n.getMessage('vtxLoadClipboardOk'));
                        },
                        function() {

                            // JSON is NOT valid
                            GUI.log(i18n.getMessage('vtxLoadClipboardKo'));
                            console.error('VTX Config from clipboard failed validation against schema');
                        }
                    );

                }, function(err) {
                    GUI.log(i18n.getMessage('vtxLoadClipboardKo'));
                    console.error('Failed to read clipboard contents: ', err);
                }
            );

        } catch (err) {
            console.error(`Failed loading VTX file config: ${err}`);
            GUI.log(i18n.getMessage('vtxLoadClipboardKo'));
        }

    }

    // Save all the values from the tab to MSP
    function save_vtx() {
        self.updating = true;

        dump_html_to_msp();

        // Start MSP saving
        save_vtx_config();

        analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);

        function save_vtx_config() {
            MSP.send_message(MSPCodes.MSP_SET_VTX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_VTX_CONFIG), false, save_vtx_powerlevels);
        }

        function save_vtx_powerlevels() {

            // Simulation of static variable
            if (typeof save_vtx_powerlevels.counter === 'undefined') {
                save_vtx_powerlevels.counter = 0;
            } else {
                save_vtx_powerlevels.counter++;
            }


            if (save_vtx_powerlevels.counter < FC.VTX_CONFIG.vtx_table_powerlevels) {
                FC.VTXTABLE_POWERLEVEL = Object.assign({}, TABS.vtx.VTXTABLE_POWERLEVEL_LIST[save_vtx_powerlevels.counter]);
                MSP.send_message(MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL, mspHelper.crunch(MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL), false, save_vtx_powerlevels);
            } else {
                save_vtx_powerlevels.counter = undefined;
                save_vtx_bands();
            }
        }

        function save_vtx_bands() {

            // Simulation of static variable
            if (typeof save_vtx_bands.counter === 'undefined') {
                save_vtx_bands.counter = 0;
            } else {
                save_vtx_bands.counter++;
            }


            if (save_vtx_bands.counter < FC.VTX_CONFIG.vtx_table_bands) {
                FC.VTXTABLE_BAND = Object.assign({}, TABS.vtx.VTXTABLE_BAND_LIST[save_vtx_bands.counter]);
                MSP.send_message(MSPCodes.MSP_SET_VTXTABLE_BAND, mspHelper.crunch(MSPCodes.MSP_SET_VTXTABLE_BAND), false, save_vtx_bands);
            } else {
                save_vtx_bands.counter = undefined;
                save_to_eeprom();
            }
        }

        function save_to_eeprom() {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, save_completed);
        }

        function save_completed() {
            GUI.log(i18n.getMessage('configurationEepromSaved'));

            TABS.vtx.vtxTableSavePending = false;

            const oldText = $("#save_button").text();
            $("#save_button").html(i18n.getMessage('vtxButtonSaved'));
            setTimeout(function () {
                $("#save_button").html(oldText);
            }, 2000);

            TABS.vtx.initialize();
        }
    }

    function dump_html_to_msp() {

        // General config
        const frequencyEnabled = $("#vtx_frequency_channel").prop('checked');
        if (frequencyEnabled) {
            FC.VTX_CONFIG.vtx_frequency = parseInt($("#vtx_frequency").val());
            FC.VTX_CONFIG.vtx_band = 0;
            FC.VTX_CONFIG.vtx_channel = 0;
        } else {
            FC.VTX_CONFIG.vtx_band = parseInt($("#vtx_band").val());
            FC.VTX_CONFIG.vtx_channel = parseInt($("#vtx_channel").val());
            FC.VTX_CONFIG.vtx_frequency = 0;
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                if (FC.VTX_CONFIG.vtx_band > 0 || FC.VTX_CONFIG.vtx_channel > 0) {
                    FC.VTX_CONFIG.vtx_frequency = (band - 1) * 8 + (channel - 1);
                }
            }
        }
        FC.VTX_CONFIG.vtx_power = parseInt($("#vtx_power").val());
        FC.VTX_CONFIG.vtx_pit_mode = $("#vtx_pit_mode").prop('checked');
        FC.VTX_CONFIG.vtx_low_power_disarm = parseInt($("#vtx_low_power_disarm").val());
        FC.VTX_CONFIG.vtx_table_clear = true;

        // Power levels
        FC.VTX_CONFIG.vtx_table_powerlevels = parseInt($("#vtx_table_powerlevels").val());

        TABS.vtx.VTXTABLE_POWERLEVEL_LIST = [];
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_powerlevels; i++) {
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1] = {};
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_number = i;
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_value = parseInt($(`#vtx_table_powerlevels_${i}`).val());
            TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_label = $(`#vtx_table_powerlabels_${i}`).val();
        }

        // Bands and channels
        FC.VTX_CONFIG.vtx_table_bands = parseInt($("#vtx_table_bands").val());
        FC.VTX_CONFIG.vtx_table_channels = parseInt($("#vtx_table_channels").val());
        TABS.vtx.VTXTABLE_BAND_LIST = [];
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_bands; i++) {
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1] = {};
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_number = i;
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_name = $(`#vtx_table_band_name_${i}`).val();
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_letter = $(`#vtx_table_band_letter_${i}`).val();
            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_is_factory_band = TABS.vtx.vtxTableFactoryBandsSupported ? $(`#vtx_table_band_factory_${i}`).prop('checked') : false;

            TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies = [];
            for (let j = 1; j <= FC.VTX_CONFIG.vtx_table_channels; j++) {
                TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies.push(parseInt($(`#vtx_table_band_channel_${i}_${j}`).val()));
            }
        }

    }

    // Copies from the MSP data to the vtxInfo object (JSON)
    function createVtxConfigInfo() {

        const vtxConfig = {
            description: "Betaflight VTX Config file",
            version: "1.0",
        };

        vtxConfig.vtx_table = {};

        vtxConfig.vtx_table.bands_list = [];
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_bands; i++) {
            vtxConfig.vtx_table.bands_list[i - 1] = {};
            vtxConfig.vtx_table.bands_list[i - 1].name = TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_name;
            vtxConfig.vtx_table.bands_list[i - 1].letter = TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_letter;
            vtxConfig.vtx_table.bands_list[i - 1].is_factory_band = TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_is_factory_band;
            vtxConfig.vtx_table.bands_list[i - 1].frequencies = TABS.vtx.VTXTABLE_BAND_LIST[i - 1].vtxtable_band_frequencies;
        }

        vtxConfig.vtx_table.powerlevels_list = [];
        for (let i = 1; i <= FC.VTX_CONFIG.vtx_table_powerlevels; i++) {
            vtxConfig.vtx_table.powerlevels_list[i - 1] = {};
            vtxConfig.vtx_table.powerlevels_list[i - 1].value = TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_value;
            vtxConfig.vtx_table.powerlevels_list[i - 1].label = TABS.vtx.VTXTABLE_POWERLEVEL_LIST[i - 1].vtxtable_powerlevel_label;
        }

        return vtxConfig;
    }

    function createLuaTables(vtxConfig) {

        let bandsString = "bandTable = { [0]=\"U\"";
        let frequenciesString = "frequencyTable = {\n";

        const bandsList = vtxConfig.vtx_table.bands_list;
        for (let index = 0, len = bandsList.length; index < len; ++index) {
            bandsString += `, "${bandsList[index].letter}"`;
            frequenciesString += "        { ";
            for (let i = 0, l = bandsList[index].frequencies.length; i < l; ++i) {
                frequenciesString += `${bandsList[index].frequencies[i]}, `;
            }
            frequenciesString += "},\n";
        }
        bandsString += " },\n";
        frequenciesString += "    },\n";

        const freqBandsString = `frequenciesPerBand = ${bandsList[1].frequencies.length},\n`;

        const powerList = vtxConfig.vtx_table.powerlevels_list;
        let powersString = "powerTable = { ";
        for (let index = 0, len = powerList.length; index < len; ++index) {
            powersString += `[${(index + 1)}]="${powerList[index].label}", `;
        }
        powersString += "},\n";

        return `return {\n    ${frequenciesString}    ${freqBandsString}    ${bandsString}    ${powersString}}`;
    }

};

vtx.cleanup = function (callback) {

    // Add here things that need to be cleaned or closed before leaving the tab
    this.vtxTableSavePending = false;
    this.VTXTABLE_BAND_LIST = [];
    this.VTXTABLE_POWERLEVEL_LIST = [];

    GUI.interval_remove(this._DEVICE_STATUS_UPDATE_INTERVAL_NAME);

    if (callback) {
        callback();
    }
};

window.TABS.vtx = vtx;
export {
    vtx
};
