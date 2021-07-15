'use strict';

TABS.presets = {
    presetsRepo: null,
    cliEngine: null,
};

TABS.presets.initialize = function (callback) {
    const self = this;

    self.presetsRepo = new PresetsRepoIndexed("https://raw.githubusercontent.com/betaflight/firmware-presets/master/",
                                              "https://github.com/betaflight/firmware-presets/blob/master/");

    self.cliEngine = new CliEngine(self);
    self._presetPanels = [];

    $('#content').load("./tabs/presets/presets.html", () => self.onHtmlLoad(callback));

    if (GUI.active_tab !== 'presets') {
        GUI.active_tab = 'presets';
    }
};

TABS.presets.readDom = function()
{
    this._divGlobalLoading = $('#presets_global_loading');
    this._divGlobalLoadingError = $('#presets_global_loading_error');
    this._divCli = $('#presets_cli');
    this._divMainContent = $('#presets_main_content');
    this._selectCategory = $('#presets_filter_category');
    this._selectKeyword = $('#presets_filter_keyword');
    this._selectAuthor = $('#presets_filter_author');
    this._selectFirmwareVersion = $('#presets_filter_firmware_version');
    this._checkboxIncludeOfficialOnly = $('#presets_filter_official_only');
    this._inputTextFilter = $('#presets_filter_text');
    this._divPresetList = $('#presets_list');

    this._domButtonSave = $("#presets_save_button");
    this._domButtonCancel = $("#presets_cancel_button");
    this._domShowHideCli = $("#presets_show_hide_cli");
}

TABS.presets.setupMenuButtons = function()
{
    this._domButtonSave.on("click", () => {
        this.cliEngine.sendLine("save");
    });


    this._domButtonCancel.on("click", () => {
        this.cliEngine.sendLine("exit");
    });

    this._domShowHideCli.on("click", () => {
        this._divCli.toggle();
    });
}

TABS.presets.onHtmlLoad = function(callback)
{
    i18n.localizePage();
    TABS.presets.adaptPhones();
    CONFIGURATOR.cliEngineActive = true;
    this.cliEngine.setUi($('#presets_cli_window'), $('#presets_cli_window_wrapper'), $('#presets_cli_command'));
    this.cliEngine.enterCliMode();
    this.readDom();
    this.setupMenuButtons();

    this.presetsDetailedDialog = new PresetsDetailedDialog($("#presets_detailed_dialog"), this.cliEngine, this.presetsRepo);

    this.tryLoadPresets();

    this.presetsDetailedDialog.load(() => { GUI.content_ready(callback); });
}

TABS.presets.tryLoadPresets = function()
{
    this._divMainContent.toggle(false);
    this._divGlobalLoadingError.toggle(false);
    this._divGlobalLoading.toggle(true);

    this.presetsRepo.loadIndex().then(() => {
        this.prepareFilterFields();
        this._divGlobalLoading.toggle(false);
        this._divMainContent.toggle(true);
    }).catch(err => {
        this._divGlobalLoading.toggle(false);
        this._divGlobalLoadingError.toggle(true);
        console.error(err);
    });
}

TABS.presets.prepareFilterFields = function()
{
    this._freezeSearch = true;
    this.prepareFilterSelectField(this._selectCategory, this.presetsRepo.index.uniqueValues.category);
    this.prepareFilterSelectField(this._selectKeyword, this.presetsRepo.index.uniqueValues.keywords);
    this.prepareFilterSelectField(this._selectAuthor, this.presetsRepo.index.uniqueValues.author);
    this.prepareFilterSelectField(this._selectFirmwareVersion, this.presetsRepo.index.uniqueValues.firmwareVersion);

    this._inputTextFilter.on('input', () => { this.updateSearchResults(); });
    this._checkboxIncludeOfficialOnly.on('change', () => { this.updateSearchResults(); });

    this._freezeSearch = false;

    this.updateSearchResults();
}

TABS.presets.prepareFilterSelectField = function(domSelectElement, selectOptions) {
    domSelectElement.multipleSelect({
        data: selectOptions,
        placeholder: i18n.getMessage("dropDownAll"),
        onClick: () => { this.updateSearchResults(); },
        onCheckAll: () => { this.updateSearchResults(); },
        onUncheckAll: () => { this.updateSearchResults(); },
        formatSelectAll () { return i18n.getMessage("dropDownSelectAll"); },
        formatAllSelected() { return i18n.getMessage("dropDownAll"); },
    });

    domSelectElement

    // domSelectElement.multipleSelect('checkAll');
}

TABS.presets.updateSearchResults = function()
{
    if (!this._freezeSearch)
    {
        let searchParams = {
            categories: this._selectCategory.multipleSelect("getSelects", "text"),
            keywords: this._selectKeyword.multipleSelect("getSelects", "text"),
            authors: this._selectAuthor.multipleSelect("getSelects", "text"),
            firmwareVersions: this._selectFirmwareVersion.multipleSelect("getSelects", "text"),
            officialOnly: this._checkboxIncludeOfficialOnly.is(':checked'),
            searchString: this._inputTextFilter.val().trim()
        }

        let fitPresets = this.getFitPresets(searchParams);
        this.displayPresets(fitPresets);
    }
}

TABS.presets.displayPresets = function(fitPresets)
{
    this._presetPanels.forEach((presetPanel) => {
        presetPanel.remove();
    });
    this._presetPanels = [];

    fitPresets.forEach((preset, presetIndex) => {
        const presetPanel = new PresetTitlePanel(this._divPresetList, preset, true, ()=>{});
        this._presetPanels.push(presetPanel);
        presetPanel.subscribeClick(this.presetsDetailedDialog);
    });
}

TABS.presets.getFitPresets = function(searchParams)
{
    const result = [];

    this.presetsRepo.index.presets.forEach((preset) => {
        if(this.isPresetFit(preset, searchParams)) {
            result.push(preset);
        }
    });

    return result;
}

TABS.presets.isPresetFit = function(preset, searchParams)
{
    if (searchParams.officialOnly && !preset.official) {
        return false;
    }

    if (0 !== searchParams.categories.length) {
        if (undefined === preset.category) {
            return false;
        }

        if (!searchParams.categories.includes(preset.category)) {
            return false;
        }
    }

    if (0 !== searchParams.keywords.length) {
        if (!Array.isArray(preset.keywords)) {
            return false;
        }

        const keywordsIntersection = searchParams.keywords.filter(value => preset.keywords.includes(value));
        if (0 === keywordsIntersection.length) {
            return false;
        }
    }

    if (0 !== searchParams.authors.length) {
        if (undefined === preset.author) {
            return false;
        }

        if (!searchParams.authors.includes(preset.author)) {
            return false;
        }
    }

    if (0 !== searchParams.firmwareVersions.length) {
        if (!Array.isArray(preset.firmwareVersion)) {
            return false;
        }

        const firmwareVersionsIntersection = searchParams.firmwareVersions.filter(value => preset.firmwareVersion.includes(value));
        console.log("==================================");
        console.log(preset.firmwareVersion);
        console.log(searchParams.firmwareVersions);
        console.log(firmwareVersionsIntersection);
        if (0 === firmwareVersionsIntersection.length) {
            return false;
        }
    }

    if (searchParams.searchString)
    {
        const  arrayStringContains = function(array, str) {
            if (!Array.isArray(array)) {
                return false;
            }

            for (let i = 0; i < array.length; i++)
            {
                if (array[i].toLowerCase().includes(str)) {
                    return true;
                }
            }

            return false;
        }

        const  stringContains = function(str1, str2) {
            if (!str1) {
                return false;
            }

            return str1.toLowerCase().includes(str2);
        }

        const lowerCaseSearchString = searchParams.searchString.toLowerCase();

        if (!arrayStringContains(preset.description, lowerCaseSearchString) &&
            !arrayStringContains(preset.keywords, lowerCaseSearchString) &&
            !stringContains(preset.title, lowerCaseSearchString) &&
            !stringContains(preset.author, lowerCaseSearchString)) {
                return false;
            }
    }

    return true;
}

TABS.presets.adaptPhones = function() {
    if (GUI.isCordova()) {
        UI_PHONES.initToolbar();
    }
};

TABS.presets.read = function (readInfo) {
    TABS.presets.cliEngine.readSerial(readInfo);
};

TABS.presets.cleanup = function (callback) {
    if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.cliEngineActive && CONFIGURATOR.cliEngineValid)) {
        if (callback) {
            callback();
        }

        return;
    }

    TABS.presets.cliEngine.close(() => {
        if (callback) {
            callback();
        }

        CONFIGURATOR.cliEngineActive = false;
        CONFIGURATOR.cliEngineValid = false;
        TABS.presets.presetsRepo = null;
    });

};
