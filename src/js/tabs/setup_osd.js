import { i18n } from "../localization";

const setup_osd = {
};

setup_osd.initialize = function (callback) {

    if (GUI.active_tab != 'setup_osd') {
        GUI.active_tab = 'setup_osd';
        // Disabled on merge into betaflight-configurator
        //googleAnalytics.sendAppView('Setup OSD');
    }

    function load_status() {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/setup_osd.html", process_html);
    }

    load_status();

    function process_html() {

        $('.tab-setup-osd .info').hide(); // requires an MSP update
/*      Only used by get_slow_data() which is commented out.
        const osdVideoModes = new Set([
            'AUTO',
            'NTSC',
            'PAL'
        ]);
*/
        // translate to user-selected language
        i18n.localizePage();

        $('a.resetSettings').click(function () {
            MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
                GUI.log(i18n.getMessage('initialSetupSettingsRestored'));

                GUI.tab_switch_cleanup(function () {
                    TABS.setup_osd.initialize();
                });
            });
        });

        function get_slow_data() {
            /* FIXME requires MSP update
            MSP.send_message(MSPCodes.MSP_OSD_VIDEO_STATUS, false, false, function () {
                let element element = $('.video-mode');
                const osdVideoMode = osdVideoModes[OSD_VIDEO_STATE.video_mode];
                element.text(osdVideoMode);

                element = $('.camera-connected');
                element.text(OSD_VIDEO_STATE.camera_connected ? i18n.getMessage('yes') : i18n.getMessage('No'));
            });
            */
        }

        GUI.interval_add('setup_data_pull_slow', get_slow_data, 250, true); // 4 fps

        GUI.content_ready(callback);
    }
};

setup_osd.cleanup = function (callback) {
    if (callback) callback();
};

window.TABS.setup_osd = setup_osd;
export {
    setup_osd
};
