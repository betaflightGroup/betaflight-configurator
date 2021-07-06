import { i18n } from '../localization';

const options = {};
options.initialize = function (callback) {
    if (GUI.active_tab !== 'options') {
        GUI.active_tab = 'options';
    }

    $('#content').load("./tabs/options.html", function () {
        i18n.localizePage();

        TABS.options.initPermanentExpertMode();
        TABS.options.initRememberLastTab();
        TABS.options.initCheckForConfiguratorUnstableVersions();
        TABS.options.initAnalyticsOptOut();
        TABS.options.initCliAutoComplete();
        TABS.options.initAutoConnectConnectionTimeout();
        TABS.options.initMacSetHideMinimize();
        TABS.options.initCordovaForceComputerUI();
        TABS.options.initDarkTheme();

        GUI.content_ready(callback);
    });
};

options.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};

options.initPermanentExpertMode = function () {
    ConfigStorage.get('permanentExpertMode', function (result) {
        if (result.permanentExpertMode) {
            $('div.permanentExpertMode input').prop('checked', true);
        }

        $('div.permanentExpertMode input').change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'permanentExpertMode': checked});

            $('input[name="expertModeCheckbox"]').prop('checked', checked).change();
        }).change();
    });
};

options.initRememberLastTab = function () {
    ConfigStorage.get('rememberLastTab', function (result) {
        $('div.rememberLastTab input')
            .prop('checked', !!result.rememberLastTab)
            .change(function() { ConfigStorage.set({rememberLastTab: $(this).is(':checked')}); })
            .change();
    });
};

options.initCheckForConfiguratorUnstableVersions = function () {
    ConfigStorage.get('checkForConfiguratorUnstableVersions', function (result) {
        if (result.checkForConfiguratorUnstableVersions) {
            $('div.checkForConfiguratorUnstableVersions input').prop('checked', true);
        }

        $('div.checkForConfiguratorUnstableVersions input').change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'checkForConfiguratorUnstableVersions': checked});

            checkForConfiguratorUpdates();
        });
    });
};

options.initAnalyticsOptOut = function () {
    ConfigStorage.get('analyticsOptOut', function (result) {
        if (result.analyticsOptOut) {
            $('div.analyticsOptOut input').prop('checked', true);
        }

        $('div.analyticsOptOut input').change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'analyticsOptOut': checked});

            checkSetupAnalytics(function (analyticsService) {
                if (checked) {
                    analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'OptOut');
                }

                analyticsService.setOptOut(checked);

                if (!checked) {
                    analyticsService.sendEvent(analyticsService.EVENT_CATEGORIES.APPLICATION, 'OptIn');
                }
            });
        }).change();
    });
};

options.initCliAutoComplete = function () {
    $('div.cliAutoComplete input')
        .prop('checked', CliAutoComplete.configEnabled)
        .change(function () {
            const checked = $(this).is(':checked');

            ConfigStorage.set({'cliAutoComplete': checked});
            CliAutoComplete.setEnabled(checked);
        }).change();
};

options.initAutoConnectConnectionTimeout = function () {
    ConfigStorage.get('connectionTimeout', function (result) {
        if (result.connectionTimeout) {
            $('#connectionTimeoutSelect').val(result.connectionTimeout);
        }
        $('#connectionTimeoutSelect').on('change', function () {
            const value = parseInt($(this).val());
            ConfigStorage.set({'connectionTimeout': value});
        });
    });
};

options.initMacSetHideMinimize = function () {
    if (GUI.operating_system === 'MacOS') {
        ConfigStorage.get('macSetHideMinimize', function (result) {
            $('div.macSetHideMinimize input')
                .prop('checked', !!result.macSetHideMinimize)
                .change(function() { ConfigStorage.set({macSetHideMinimize: $(this).is(':checked')}); })
                .change();
        });
    } else {
        $('div.macSetHideMinimize').hide();
    }
};

options.initCordovaForceComputerUI = function () {
    if (GUI.isCordova() && cordovaUI.canChangeUI) {
        ConfigStorage.get('cordovaForceComputerUI', function (result) {
            if (result.cordovaForceComputerUI) {
                $('div.cordovaForceComputerUI input').prop('checked', true);
            }

            $('div.cordovaForceComputerUI input').change(function () {
                const checked = $(this).is(':checked');

                ConfigStorage.set({'cordovaForceComputerUI': checked});

                if (typeof cordovaUI.set === 'function') {
                    cordovaUI.set();
                }
            });
        });
    } else {
        $('div.cordovaForceComputerUI').hide();
    }
};

options.initDarkTheme = function () {
    $('#darkThemeSelect')
        .val(DarkTheme.configEnabled)
        .change(function () {
            const value = parseInt($(this).val());

            ConfigStorage.set({'darkTheme': value});
            setDarkTheme(value);
        }).change();
};

// TODO: remove when modules are in place
window.TABS.options = options;
export { options };
