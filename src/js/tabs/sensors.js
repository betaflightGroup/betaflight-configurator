import { i18n } from "../localization";

const sensors = {};
sensors.initialize = function (callback) {

    if (GUI.active_tab != 'sensors') {
        GUI.active_tab = 'sensors';
    }

    function initSensorData(){
        for (let i = 0; i < 3; i++) {
            FC.SENSOR_DATA.accelerometer[i] = 0;
            FC.SENSOR_DATA.gyroscope[i] = 0;
            FC.SENSOR_DATA.magnetometer[i] = 0;
            FC.SENSOR_DATA.sonar = 0;
            FC.SENSOR_DATA.altitude = 0;
            FC.SENSOR_DATA.debug[i] = 0;
        }
    }

    function initDataArray(length) {
        const data = new Array(length);
        for (let i = 0; i < length; i++) {
            data[i] = new Array();
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
        for (let i = 0; i < data.length; i++) {
            const dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 300) {
            for (let i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    const margin = {top: 20, right: 10, bottom: 10, left: 40};
    function updateGraphHelperSize(helpers) {
        helpers.width = helpers.targetElement.width() - margin.left - margin.right;
        helpers.height = helpers.targetElement.height() - margin.top - margin.bottom;

        helpers.widthScale.range([0, helpers.width]);
        helpers.heightScale.range([helpers.height, 0]);

        helpers.xGrid.tickSize(-helpers.height, 0, 0);
        helpers.yGrid.tickSize(-helpers.width, 0, 0);
    }

    function initGraphHelpers(selector, sampleNumber, heightDomain) {
        const helpers = {selector: selector, targetElement: $(selector), dynamicHeightDomain: !heightDomain};

        helpers.widthScale = d3.scale.linear()
            .clamp(true)
            .domain([(sampleNumber - 299), sampleNumber]);

        helpers.heightScale = d3.scale.linear()
            .clamp(true)
            .domain(heightDomain || [1, -1]);

        helpers.xGrid = d3.svg.axis();
        helpers.yGrid = d3.svg.axis();

        updateGraphHelperSize(helpers);

        helpers.xGrid
            .scale(helpers.widthScale)
            .orient("bottom")
            .ticks(5)
            .tickFormat("");

        helpers.yGrid
            .scale(helpers.heightScale)
            .orient("left")
            .ticks(5)
            .tickFormat("");

        helpers.xAxis = d3.svg.axis()
            .scale(helpers.widthScale)
            .ticks(5)
            .orient("bottom")
            .tickFormat(function (d) {return d;});

        helpers.yAxis = d3.svg.axis()
            .scale(helpers.heightScale)
            .ticks(5)
            .orient("left")
            .tickFormat(function (d) {return d;});

        helpers.line = d3.svg.line()
            .x(function (d) {return helpers.widthScale(d[0]);})
            .y(function (d) {return helpers.heightScale(d[1]);});

        return helpers;
    }

    function drawGraph(graphHelpers, data, sampleNumber) {
        const svg = d3.select(graphHelpers.selector);

        if (graphHelpers.dynamicHeightDomain) {
            const limits = [];
            $.each(data, function (idx, datum) {
                limits.push(datum.min);
                limits.push(datum.max);
            });
            graphHelpers.heightScale.domain(d3.extent(limits));
        }
        graphHelpers.widthScale.domain([(sampleNumber - 299), sampleNumber]);

        svg.select(".x.grid").call(graphHelpers.xGrid);
        svg.select(".y.grid").call(graphHelpers.yGrid);
        svg.select(".x.axis").call(graphHelpers.xAxis);
        svg.select(".y.axis").call(graphHelpers.yAxis);

        const group = svg.select("g.data");
        const lines = group.selectAll("path").data(data, function (d, i) {return i;});
        lines.enter().append("path").attr("class", "line");
        lines.attr('d', graphHelpers.line);
    }

    function plot_gyro(enable) {
        if (enable) {
            $('.wrapper.gyro').show();
        } else {
            $('.wrapper.gyro').hide();
        }
    }

    function plot_accel(enable) {
        if (enable) {
            $('.wrapper.accel').show();
        } else {
            $('.wrapper.accel').hide();
        }
    }

    function plot_mag(enable) {
        if (enable) {
            $('.wrapper.mag').show();
        } else {
            $('.wrapper.mag').hide();
        }
    }

    function plot_altitude(enable) {
        if (enable) {
            $('.wrapper.altitude').show();
        } else {
            $('.wrapper.altitude').hide();
        }
    }

    function plot_sonar(enable) {
        if (enable) {
            $('.wrapper.sonar').show();
        } else {
            $('.wrapper.sonar').hide();
        }
    }

    function plot_debug(enable) {
        if (enable) {
            $('.wrapper.debug').show();
        } else {
            $('.wrapper.debug').hide();
        }
    }

    $('#content').load("./tabs/sensors.html", function load_html() {
        // translate to user-selected language
        i18n.localizePage();

        // disable graphs for sensors that are missing
        let checkboxes = $('.tab-sensors .info .checkboxes input');
        checkboxes.parent().show();

        if (FC.CONFIG.boardType == 0 || FC.CONFIG.boardType == 2) {
            if (!have_sensor(FC.CONFIG.activeSensors, 'acc')) {
                checkboxes.eq(1).prop('disabled', true);
            }
            if (!have_sensor(FC.CONFIG.activeSensors, 'mag')) {
                checkboxes.eq(2).prop('disabled', true);
            }
            if (!(have_sensor(FC.CONFIG.activeSensors, 'baro') || (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40) && have_sensor(FC.CONFIG.activeSensors, 'gps')))) {
                checkboxes.eq(3).prop('disabled', true);
            }
            if (!have_sensor(FC.CONFIG.activeSensors, 'sonar')) {
                checkboxes.eq(4).prop('disabled', true);
            }
        } else {
            for (let i = 0; i <= 4; i++) {
                checkboxes.eq(i).prop('disabled', true);
                checkboxes.eq(i).parent().hide();
            }
        }

        $('.tab-sensors .info .checkboxes input').change(function () {
            const enable = $(this).prop('checked');
            const index = $(this).parent().index();

            switch (index) {
                case 0:
                    plot_gyro(enable);
                    break;
                case 1:
                    plot_accel(enable);
                    break;
                case 2:
                    plot_mag(enable);
                    break;
                case 3:
                    plot_altitude(enable);
                    break;
                case 4:
                    plot_sonar(enable);
                    break;
                case 5:
                    plot_debug(enable);
                    break;
            }

            const _checkboxes = [];
            $('.tab-sensors .info .checkboxes input').each(function () {
                _checkboxes.push($(this).prop('checked'));
            });

            $('.tab-sensors .rate select:first').change();

            ConfigStorage.set({'graphs_enabled': _checkboxes});
        });

        let altitudeHint_e = $('.tab-sensors #sensorsAltitudeHint');
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
            altitudeHint_e.hide();
        }

        // Always start with default/empty sensor data array, clean slate all
        initSensorData();

        // Setup variables
        let samples_gyro_i = 0,
            samples_accel_i = 0,
            samples_mag_i = 0,
            samples_altitude_i = 0,
            samples_sonar_i = 0,
            samples_debug_i = 0;
        const gyro_data = initDataArray(3),
            accel_data = initDataArray(3),
            mag_data = initDataArray(3),
            altitude_data = initDataArray(1),
            sonar_data = initDataArray(1),
            debug_data = [
            initDataArray(1),
            initDataArray(1),
            initDataArray(1),
            initDataArray(1)
        ];

        let gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-2000, 2000]);
        let accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-2, 2]);
        let magHelpers = initGraphHelpers('#mag', samples_mag_i, [-1, 1]);
        const altitudeHelpers = initGraphHelpers('#altitude', samples_altitude_i);
        const sonarHelpers = initGraphHelpers('#sonar', samples_sonar_i);
        const debugHelpers = [
            initGraphHelpers('#debug1', samples_debug_i),
            initGraphHelpers('#debug2', samples_debug_i),
            initGraphHelpers('#debug3', samples_debug_i),
            initGraphHelpers('#debug4', samples_debug_i)
        ];

        const raw_data_text_ements = {
            x: [],
            y: [],
            z: []
        };
        $('.plot_control .x, .plot_control .y, .plot_control .z').each(function () {
            const el = $(this);
            if (el.hasClass('x')) {
                raw_data_text_ements.x.push(el);
            } else if (el.hasClass('y')) {
                raw_data_text_ements.y.push(el);
            } else {
                raw_data_text_ements.z.push(el);
            }
        });

        $('.tab-sensors .rate select, .tab-sensors .scale select').change(function () {
            // if any of the select fields change value, all of the select values are grabbed
            // and timers are re-initialized with the new settings
            const rates = {
                'gyro':   parseInt($('.tab-sensors select[name="gyro_refresh_rate"]').val(), 10),
                'accel':  parseInt($('.tab-sensors select[name="accel_refresh_rate"]').val(), 10),
                'mag':    parseInt($('.tab-sensors select[name="mag_refresh_rate"]').val(), 10),
                'altitude':   parseInt($('.tab-sensors select[name="altitude_refresh_rate"]').val(), 10),
                'sonar':  parseInt($('.tab-sensors select[name="sonar_refresh_rate"]').val(), 10),
                'debug':  parseInt($('.tab-sensors select[name="debug_refresh_rate"]').val(), 10)
            };

            const scales = {
                'gyro':  parseFloat($('.tab-sensors select[name="gyro_scale"]').val()),
                'accel': parseFloat($('.tab-sensors select[name="accel_scale"]').val()),
                'mag':   parseFloat($('.tab-sensors select[name="mag_scale"]').val())
            };

            // handling of "data pulling" is a little bit funky here, as MSP_RAW_IMU contains values for gyro/accel/mag but not altitude
            // this means that setting a slower refresh rate on any of the attributes would have no effect
            // what we will do instead is = determinate the fastest refresh rate for those 3 attributes, use that as a "polling rate"
            // and use the "slower" refresh rates only for re-drawing the graphs (to save resources/computing power)
            const fastest = d3.min([rates.gyro, rates.accel, rates.mag]);

            // store current/latest refresh rates in the storage
            ConfigStorage.set({'sensor_settings': {'rates': rates, 'scales': scales}});

            // re-initialize domains with new scales
            gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-scales.gyro, scales.gyro]);
            accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-scales.accel, scales.accel]);
            magHelpers = initGraphHelpers('#mag', samples_mag_i, [-scales.mag, scales.mag]);

            // fetch currently enabled plots
            checkboxes = [];
            $('.tab-sensors .info .checkboxes input').each(function () {
                checkboxes.push($(this).prop('checked'));
            });

            // timer initialization
            GUI.interval_kill_all(['status_pull']);

            // data pulling timers
            if (checkboxes[0] || checkboxes[1] || checkboxes[2]) {
                GUI.interval_add('IMU_pull', function imu_data_pull() {
                    MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_imu_graphs);
                }, fastest, true);
            }

            if (checkboxes[3]) {
                GUI.interval_add('altitude_pull', function altitude_data_pull() {
                    MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, update_altitude_graph);
                }, rates.altitude, true);
            }

            if (checkboxes[4]) {
                GUI.interval_add('sonar_pull', function sonar_data_pull() {
                    MSP.send_message(MSPCodes.MSP_SONAR, false, false, update_sonar_graphs);
                }, rates.sonar, true);
            }

            if (checkboxes[5]) {
                GUI.interval_add('debug_pull', function debug_data_pull() {
                    MSP.send_message(MSPCodes.MSP_DEBUG, false, false, update_debug_graphs);
                }, rates.debug, true);
            }

            function update_imu_graphs() {
                if (checkboxes[0]) {
                    updateGraphHelperSize(gyroHelpers);

                    samples_gyro_i = addSampleToData(gyro_data, samples_gyro_i, FC.SENSOR_DATA.gyroscope);
                    drawGraph(gyroHelpers, gyro_data, samples_gyro_i);
                    raw_data_text_ements.x[0].text(FC.SENSOR_DATA.gyroscope[0].toFixed(2));
                    raw_data_text_ements.y[0].text(FC.SENSOR_DATA.gyroscope[1].toFixed(2));
                    raw_data_text_ements.z[0].text(FC.SENSOR_DATA.gyroscope[2].toFixed(2));
                }

                if (checkboxes[1]) {
                    updateGraphHelperSize(accelHelpers);

                    samples_accel_i = addSampleToData(accel_data, samples_accel_i, FC.SENSOR_DATA.accelerometer);
                    drawGraph(accelHelpers, accel_data, samples_accel_i);
                    const x = FC.SENSOR_DATA.accelerometer[0].toFixed(2);
                    const y = FC.SENSOR_DATA.accelerometer[1].toFixed(2);
                    const z = FC.SENSOR_DATA.accelerometer[2].toFixed(2);
                    const pi = Math.PI;
                    const rollACC = Math.round(Math.atan(y / (Math.sqrt(Math.pow(x, 2)) + (Math.pow(z, 2)))) * (180 / pi));
                    const pitchACC = Math.round(Math.atan(x / (Math.sqrt(Math.pow(y, 2)) + (Math.pow(z, 2)))) * (180 / pi));
                    raw_data_text_ements.x[1].text(`${x} (${rollACC})`);
                    raw_data_text_ements.y[1].text(`${y} (${pitchACC})`);
                    raw_data_text_ements.z[1].text(`${z}`);
                }

                if (checkboxes[2]) {
                    updateGraphHelperSize(magHelpers);

                    samples_mag_i = addSampleToData(mag_data, samples_mag_i, FC.SENSOR_DATA.magnetometer);
                    drawGraph(magHelpers, mag_data, samples_mag_i);
                    raw_data_text_ements.x[2].text(FC.SENSOR_DATA.magnetometer[0].toFixed(2));
                    raw_data_text_ements.y[2].text(FC.SENSOR_DATA.magnetometer[1].toFixed(2));
                    raw_data_text_ements.z[2].text(FC.SENSOR_DATA.magnetometer[2].toFixed(2));
                }
            }

            function update_altitude_graph() {
                updateGraphHelperSize(altitudeHelpers);

                samples_altitude_i = addSampleToData(altitude_data, samples_altitude_i, [FC.SENSOR_DATA.altitude]);
                drawGraph(altitudeHelpers, altitude_data, samples_altitude_i);
                raw_data_text_ements.x[3].text(FC.SENSOR_DATA.altitude.toFixed(2));
            }

            function update_sonar_graphs() {
                updateGraphHelperSize(sonarHelpers);

                samples_sonar_i = addSampleToData(sonar_data, samples_sonar_i, [FC.SENSOR_DATA.sonar]);
                drawGraph(sonarHelpers, sonar_data, samples_sonar_i);
                raw_data_text_ements.x[4].text(FC.SENSOR_DATA.sonar.toFixed(2));
            }

            function update_debug_graphs() {
                for (let i = 0; i < 4; i++) {
                    updateGraphHelperSize(debugHelpers[i]);

                    addSampleToData(debug_data[i], samples_debug_i, [FC.SENSOR_DATA.debug[i]]);
                    drawGraph(debugHelpers[i], debug_data[i], samples_debug_i);
                    raw_data_text_ements.x[5 + i].text(FC.SENSOR_DATA.debug[i]);
                }
                samples_debug_i++;
            }
        });

        ConfigStorage.get('sensor_settings', function (result) {
            // set refresh speeds according to configuration saved in storage
            if (result.sensor_settings) {
                $('.tab-sensors select[name="gyro_refresh_rate"]').val(result.sensor_settings.rates.gyro);
                $('.tab-sensors select[name="gyro_scale"]').val(result.sensor_settings.scales.gyro);

                $('.tab-sensors select[name="accel_refresh_rate"]').val(result.sensor_settings.rates.accel);
                $('.tab-sensors select[name="accel_scale"]').val(result.sensor_settings.scales.accel);

                $('.tab-sensors select[name="mag_refresh_rate"]').val(result.sensor_settings.rates.mag);
                $('.tab-sensors select[name="mag_scale"]').val(result.sensor_settings.scales.mag);

                $('.tab-sensors select[name="altitude_refresh_rate"]').val(result.sensor_settings.rates.altitude);
                $('.tab-sensors select[name="sonar_refresh_rate"]').val(result.sensor_settings.rates.sonar);

                $('.tab-sensors select[name="debug_refresh_rate"]').val(result.sensor_settings.rates.debug);

                // start polling data by triggering refresh rate change event
                $('.tab-sensors .rate select:first').change();
            } else {
                // start polling immediatly (as there is no configuration saved in the storage)
                $('.tab-sensors .rate select:first').change();
            }
            ConfigStorage.get('graphs_enabled', function (resultGraphs) {
                if (resultGraphs.graphs_enabled) {
                    const _checkboxes = $('.tab-sensors .info .checkboxes input');
                    for (let i = 0; i < resultGraphs.graphs_enabled.length; i++) {
                        _checkboxes.eq(i).not(':disabled').prop('checked', resultGraphs.graphs_enabled[i]).change();
                    }
                } else {
                    $('.tab-sensors .info input:lt(4):not(:disabled)').prop('checked', true).change();
                }
            });
        });

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    });
};

sensors.cleanup = function (callback) {
    serial.emptyOutputBuffer();

    if (callback) callback();
};

window.TABS.sensors = sensors;
export {
    sensors
};
