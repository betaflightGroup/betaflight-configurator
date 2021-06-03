import { i18n } from "../localization";

const gps = {};
gps.initialize = function (callback) {

    if (GUI.active_tab !== 'gps') {
        GUI.active_tab = 'gps';
    }

    function load_html() {
        $('#content').load("./tabs/gps.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_html);

    function set_online(){
        $('#connect').hide();
        $('#waiting').show();
        $('#loadmap').hide();
    }

    function set_offline(){
        $('#connect').show();
        $('#waiting').hide();
        $('#loadmap').hide();
    }

    function process_html() {
        // translate to user-selected languageconsole.log('Online');
        i18n.localizePage();

        function get_raw_gps_data() {
            MSP.send_message(MSPCodes.MSP_RAW_GPS, false, false, get_comp_gps_data);
        }

        function get_comp_gps_data() {
            MSP.send_message(MSPCodes.MSP_COMP_GPS, false, false, get_gpsvinfo_data);
        }

        function get_gpsvinfo_data() {
            MSP.send_message(MSPCodes.MSP_GPS_SV_INFO, false, false, update_ui);
        }

        // To not flicker the divs while the fix is unstable
        let gpsWasFixed = false;

        function update_ui() {
            const lat = FC.GPS_DATA.lat / 10000000;
            const lon = FC.GPS_DATA.lon / 10000000;
            const url = `https://maps.google.com/?q=${lat},${lon}`;
            let alt = FC.GPS_DATA.alt;
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
                alt = alt / 10;
            }

            $('.GPS_info td.fix').html((FC.GPS_DATA.fix) ? i18n.getMessage('gpsFixTrue') : i18n.getMessage('gpsFixFalse'));
            $('.GPS_info td.alt').text(alt + ' m');
            $('.GPS_info td.lat a').prop('href', url).text(lat.toFixed(4) + ' deg');
            $('.GPS_info td.lon a').prop('href', url).text(lon.toFixed(4) + ' deg');
            $('.GPS_info td.speed').text(FC.GPS_DATA.speed + ' cm/s');
            $('.GPS_info td.sats').text(FC.GPS_DATA.numSat);
            $('.GPS_info td.distToHome').text(FC.GPS_DATA.distanceToHome + ' m');

            // Update GPS Signal Strengths
            const eSsTable = $('div.GPS_signal_strength table tr:not(.titles)');

            for (let i = 0; i < FC.GPS_DATA.chn.length; i++) {
                const row = eSsTable.eq(i);

                $('td', row).eq(0).text(FC.GPS_DATA.svid[i]);
                $('td', row).eq(1).text(FC.GPS_DATA.quality[i]);
                $('td', row).eq(2).find('progress').val(FC.GPS_DATA.cno[i]);
            }

            const message = {
                action: 'center',
                lat: lat,
                lon: lon
            };

            frame = document.getElementById('map');
            if (navigator.onLine) {
                $('#connect').hide();

                if (FC.GPS_DATA.fix) {
                   gpsWasFixed = true;
                   frame.contentWindow.postMessage(message, '*');
                   $('#loadmap').show();
                   $('#waiting').hide();
                } else if (!gpsWasFixed) {
                   $('#loadmap').hide();
                   $('#waiting').show();
                } else {
                    message.action = 'nofix';
                    frame.contentWindow.postMessage(message, '*');
                }
            }else{
                gpsWasFixed = false;
                $('#connect').show();
                $('#waiting').hide();
                $('#loadmap').hide();
            }
        }

        let frame = document.getElementById('map');

        // enable data pulling
        GUI.interval_add('gps_pull', function gps_update() {
            // avoid usage of the GPS commands until a GPS sensor is detected for targets that are compiled without GPS support.
            if (!have_sensor(FC.CONFIG.activeSensors, 'gps')) {
                //return;
            }

            get_raw_gps_data();
        }, 75, true);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);


        //check for internet connection on load
        if (navigator.onLine) {
            console.log('Online');
            set_online();
        } else {
            console.log('Offline');
            set_offline();
        }

        $("#check").on('click',function(){
            if (navigator.onLine) {
                console.log('Online');
                set_online();
            } else {
                console.log('Offline');
                set_offline();
            }
        });

        $('#zoom_in').click(function() {
            console.log('zoom in');
            const message = {
                action: 'zoom_in'
            };
            frame.contentWindow.postMessage(message, '*');
        });

        $('#zoom_out').click(function() {
            console.log('zoom out');
            const message = {
                action: 'zoom_out'
            };
            frame.contentWindow.postMessage(message, '*');
        });

        GUI.content_ready(callback);
    }

};

gps.cleanup = function (callback) {
    if (callback) callback();
};

window.TABS.gps = gps;
export {
    gps
};
