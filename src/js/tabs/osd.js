'use strict';

var SYM = SYM || {};

SYM.loadSymbols = function() {
    SYM.BLANK = 0x20;
    SYM.VOLT = 0x06;
    SYM.RSSI = 0x01;
    SYM.LINK_QUALITY = 0x7B;
    SYM.AH_RIGHT = 0x02;
    SYM.AH_LEFT = 0x03;
    SYM.THR = 0x04;
    SYM.FLY_M = 0x9C;
    SYM.ON_M = 0x9B;
    SYM.AH_CENTER_LINE = 0x72;
    SYM.AH_CENTER = 0x73;
    SYM.AH_CENTER_LINE_RIGHT = 0x74;
    SYM.AH_BAR9_0 = 0x80;
    SYM.AH_DECORATION = 0x13;
    SYM.LOGO = 0xA0;
    SYM.AMP = 0x9A;
    SYM.MAH = 0x07;
    SYM.METRE = 0xC;
    SYM.FEET = 0xF;
    SYM.KPH = 0x9E;
    SYM.MPH = 0x9D;
    SYM.MPS = 0x9F;
    SYM.FTPS = 0x99;
    SYM.SPEED = 0x70;
    SYM.TOTAL_DIST = 0x71;
    SYM.GPS_SAT_L = 0x1E;
    SYM.GPS_SAT_R = 0x1F;
    SYM.GPS_LAT = 0x89;
    SYM.GPS_LON = 0x98;
    SYM.HOMEFLAG = 0x11;
    SYM.PB_START = 0x8A;
    SYM.PB_FULL = 0x8B;
    SYM.PB_EMPTY = 0x8D;
    SYM.PB_END = 0x8E;
    SYM.PB_CLOSE = 0x8F;
    SYM.BATTERY = 0x96;
    SYM.ARROW_NORTH = 0x68;
    SYM.ARROW_SOUTH = 0x60;
    SYM.ARROW_EAST = 0x64;
    SYM.ARROW_SMALL_UP = 0x75;
    SYM.HEADING_LINE = 0x1D;
    SYM.HEADING_DIVIDED_LINE = 0x1C;
    SYM.HEADING_N = 0x18;
    SYM.HEADING_S = 0x19;
    SYM.HEADING_E = 0x1A;
    SYM.HEADING_W = 0x1B;
    SYM.TEMPERATURE = 0x7A;
    SYM.TEMP_F = 0x0D;
    SYM.TEMP_C = 0x0E;
    SYM.STICK_OVERLAY_SPRITE_HIGH = 0x08;
    SYM.STICK_OVERLAY_SPRITE_MID = 0x09;
    SYM.STICK_OVERLAY_SPRITE_LOW = 0x0A;
    SYM.STICK_OVERLAY_CENTER = 0x0B;
    SYM.STICK_OVERLAY_VERTICAL = 0x16;
    SYM.STICK_OVERLAY_HORIZONTAL = 0x17;
    SYM.BBLOG = 0x10;
    SYM.ALTITUDE = 0x7F;
    SYM.PITCH = 0x15;
    SYM.ROLL = 0x14;
    SYM.KM = 0x7d;
    SYM.MILES = 0x7e;

    /* Versions before Betaflight 4.1 use font V1
     * To maintain this list at minimum, we only add here:
     * - Symbols used in this versions
     * - That were moved or didn't exist in the font file
     */
    if (semver.lt(FC.CONFIG.apiVersion, "1.42.0")) {
        SYM.AH_CENTER_LINE = 0x26;
        SYM.AH_CENTER = 0x7E;
        SYM.AH_CENTER_LINE_RIGHT = 0x27;
        SYM.SPEED = null;
        SYM.LINK_QUALITY = null;
    }
}

var STICK_OVERLAY_SPRITE = [
    SYM.STICK_OVERLAY_SPRITE_HIGH,
    SYM.STICK_OVERLAY_SPRITE_MID,
    SYM.STICK_OVERLAY_SPRITE_LOW
];

var FONT = FONT || {};

FONT.initData = function () {
    if (FONT.data) {
        return;
    }
    FONT.data = {
        // default font file name
        loaded_font_file: 'default',
        // array of arry of image bytes ready to upload to fc
        characters_bytes: [],
        // array of array of image bits by character
        characters: [],
        // an array of base64 encoded image strings by character
        character_image_urls: []
    }
};

FONT.constants = {
    MAX_CHAR_COUNT: 256,
    SIZES: {
        /** NVM ram size for one font char, actual character bytes **/
        MAX_NVM_FONT_CHAR_SIZE: 54,
        /** NVM ram field size for one font char, last 10 bytes dont matter **/
        MAX_NVM_FONT_CHAR_FIELD_SIZE: 64,
        CHAR_HEIGHT: 18,
        CHAR_WIDTH: 12,
        LINE: 30
    },
    COLORS: {
        // black
        0: 'rgba(0, 0, 0, 1)',
        // also the value 3, could yield transparent according to
        // https://www.sparkfun.com/datasheets/BreakoutBoards/MAX7456.pdf
        1: 'rgba(255, 255, 255, 0)',
        // white
        2: 'rgba(255,255,255, 1)'
    },
};

/**
* Each line is composed of 8 asci 1 or 0, representing 1 bit each for a total of 1 byte per line
*/
FONT.parseMCMFontFile = function (data) {
    var data = data.trim().split("\n");
    // clear local data
    FONT.data.characters.length = 0;
    FONT.data.characters_bytes.length = 0;
    FONT.data.character_image_urls.length = 0;
    // reset logo image info when font data is changed
    LogoManager.resetImageInfo();
    // make sure the font file is valid
    if (data.shift().trim() != 'MAX7456') {
        var msg = 'that font file doesnt have the MAX7456 header, giving up';
        console.debug(msg);
        Promise.reject(msg);
    }
    var character_bits = [];
    var character_bytes = [];
    // hexstring is for debugging
    FONT.data.hexstring = [];
    var pushChar = function () {
        // Only push full characters onto the stack.
        if (character_bytes.length != FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE) {
            return;
        }
        FONT.data.characters_bytes.push(character_bytes);
        FONT.data.characters.push(character_bits);
        FONT.draw(FONT.data.characters.length - 1);
        character_bits = [];
        character_bytes = [];
    };
    for (var i = 0; i < data.length; i++) {
        var line = data[i];
        // hexstring is for debugging
        FONT.data.hexstring.push('0x' + parseInt(line, 2).toString(16));
        // every 64 bytes (line) is a char, we're counting chars though, which are 2 bits
        if (character_bits.length == FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE * (8 / 2)) {
            pushChar()
        }
        for (var y = 0; y < 8; y = y + 2) {
            var v = parseInt(line.slice(y, y + 2), 2);
            character_bits.push(v);
        }
        character_bytes.push(parseInt(line, 2));
    }
    // push the last char
    pushChar();
    return FONT.data.characters;
};

FONT.openFontFile = function (fontPreviewElement) {
    return new Promise(function (resolve) {
        chrome.fileSystem.chooseEntry({ type: 'openFile', accepts: [{ description: 'MCM files', extensions: ['mcm'] }] }, function (fileEntry) {
            FONT.data.loaded_font_file = fileEntry.name;
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                return;
            }
            fileEntry.file(function (file) {
                var reader = new FileReader();
                reader.onloadend = function (e) {
                    if (e.total != 0 && e.total == e.loaded) {
                        FONT.parseMCMFontFile(e.target.result);
                        resolve();
                    }
                    else {
                        console.error('could not load whole font file');
                    }
                };
                reader.readAsText(file);
            });
        });
    });
};

/**
* returns a canvas image with the character on it
*/
var drawCanvas = function (charAddress) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext("2d");

    // TODO: do we want to be able to set pixel size? going to try letting the consumer scale the image.
    var pixelSize = pixelSize || 1;
    var width = pixelSize * FONT.constants.SIZES.CHAR_WIDTH;
    var height = pixelSize * FONT.constants.SIZES.CHAR_HEIGHT;

    canvas.width = width;
    canvas.height = height;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            if (!(charAddress in FONT.data.characters)) {
                console.log('charAddress', charAddress, ' is not in ', FONT.data.characters.length);
            }
            var v = FONT.data.characters[charAddress][(y * width) + x];
            ctx.fillStyle = FONT.constants.COLORS[v];
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    return canvas;
};

FONT.draw = function (charAddress) {
    var cached = FONT.data.character_image_urls[charAddress];
    if (!cached) {
        cached = FONT.data.character_image_urls[charAddress] = drawCanvas(charAddress).toDataURL('image/png');
    }
    return cached;
};

// Returns the font data for a blank character
FONT.blank = function() {
    var blank = 0x55; // A byte with all pixels set to transparent
    var size = FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE;
    return Array.apply(null, {length: size}).map(function() { return blank; });
};

FONT.msp = {
    encode: function (charAddress) {
        if(semver.gte(CONFIG.apiVersion, "1.42.0")) {
            var addr = [];
            addr.push8(0);
            addr.push16(charAddress);
            var data = FONT.data.characters_bytes[charAddress];
            if (!data) {
                data = FONT.blank();
            }
            return addr.concat(data.slice(0, FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE));
        }
        return [charAddress].concat(FONT.data.characters_bytes[charAddress].slice(0, FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE));
    }
};

FONT.upload = function ($progress) {
    var fontSeries = FONT.data.characters;
    if(semver.lte(CONFIG.apiVersion, "1.41.0") && FONT.data.characters.length > 256) {
        fontSeries = Array(256);
    }
    return Promise.mapSeries(fontSeries, function (data, i) {
        $progress.val((i / fontSeries.length) * 100);
        return MSP.promise(MSPCodes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
    })
        .then(function () {

            console.log('Uploaded all ' + FONT.data.characters.length + ' characters');
            GUI.log(i18n.getMessage('osdSetupUploadingFontEnd', {length: FONT.data.characters.length}));

            OSD.GUI.fontManager.close();

            return MSP.promise(MSPCodes.MSP_SET_REBOOT);
        });
};

FONT.preview = function ($el) {
    $el.empty()
    for (var i = 0; i < SYM.LOGO; i++) {
        var url = FONT.data.character_image_urls[i];
        $el.append('<img src="' + url + '" title="0x' + i.toString(16) + '"></img>');
    }
};

FONT.symbol = function (hexVal) {
    return (hexVal == '' || hexVal == null)? '' : String.fromCharCode(hexVal);
};

var OSD = OSD || {};

OSD.getNumberOfProfiles = function() {
    return OSD.data.osd_profiles.number;
}

OSD.getCurrentPreviewProfile = function() {
    let osdprofile_e = $('.osdprofile-selector');
    if (osdprofile_e.length > 0) {
        return osdprofile_e.val();
    } else {
        return 0;
    }
}

// parsed fc output and output to fc, used by to OSD.msp.encode
OSD.initData = function () {
    OSD.data = {
        video_system: null,
        unit_mode: null,
        alarms: [],
        stat_items: [],
        warnings: [],
        display_items: [],
        timers: [],
        last_positions: {},
        preview: [],
        tooltips: [],
        osd_profiles: {}
    };
};
OSD.initData();

OSD.generateTimerPreview = function (osd_data, timer_index) {
    var preview = '';
    switch (osd_data.timers[timer_index].src) {
        case 0:
        case 3:
            preview += FONT.symbol(SYM.ON_M);
            break;
        case 1:
        case 2:
            preview += FONT.symbol(SYM.FLY_M);
            break;
    }
    switch (osd_data.timers[timer_index].precision) {
        case 0:
            preview += '00:00';
            break;
        case 1:
            preview += '00:00.00';
            break;
        case 2:
            preview += '00:00.0';
            break;
    }
    return preview;
};

OSD.generateTemperaturePreview = function (osd_data, temperature) {
    var preview = FONT.symbol(SYM.TEMPERATURE);
    switch (osd_data.unit_mode) {
        case 0:
            temperature *= (9.0 / 5.0);
            temperature += 32.0;
            preview += Math.floor(temperature) + FONT.symbol(SYM.TEMP_F);
            break;
        case 1:
        case 2:
            preview += temperature + FONT.symbol(SYM.TEMP_C);
            break;
    }
    return preview;
}

OSD.generateLQPreview = function() {
    const crsfIndex = FC.RX_CONFIG.getSerialRxTypes().findIndex(name => name === 'CRSF');
    const isXF = crsfIndex === FC.RX_CONFIG.serialrx_provider;
    return FONT.symbol(SYM.LINK_QUALITY) + (isXF ? '2:100' : '8');
}

OSD.generateCraftName = function (osd_data) {
    var preview = 'CRAFT_NAME';
    if (FC.CONFIG.name != '') {
        preview = FC.CONFIG.name.toUpperCase();
    }
    return preview;
}

OSD.generateDisplayName = function(osd_data) {
  var preview = 'DISPLAY_NAME';
  if (FC.CONFIG.displayName != '')
      preview = FC.CONFIG.displayName.toUpperCase();
  return preview;
}

OSD.drawStickOverlayPreview = function () {
    function randomInt(count) {
        return Math.floor(Math.random() * Math.floor(count));
    }

    var OVERLAY_WIDTH = 7;
    var OVERLAY_HEIGHT = 5;

    var stickX = randomInt(OVERLAY_WIDTH);
    var stickY = randomInt(OVERLAY_HEIGHT);
    var stickSymbol = randomInt(3);

    // From 'osdDrawStickOverlayAxis' in 'src/main/io/osd.c'
    var stickOverlay = new Array();
    for (var x = 0; x < OVERLAY_WIDTH; x++) {
        for (var y = 0; y < OVERLAY_HEIGHT; y++) {
            var symbol = undefined;

            if (x === stickX && y === stickY) {
                symbol = STICK_OVERLAY_SPRITE[stickSymbol];
            } else if (x === (OVERLAY_WIDTH - 1) / 2 && y === (OVERLAY_HEIGHT - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_CENTER;
            } else if (x === (OVERLAY_WIDTH - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_VERTICAL;
            } else if (y === (OVERLAY_HEIGHT - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_HORIZONTAL;
            }

            if (symbol) {
                var element = {
                    x: x,
                    y: y,
                    sym: symbol
                };
                stickOverlay.push(element);
            }
        }
    }
    return stickOverlay;
};

OSD.drawCameraFramePreview = function () {

    const FRAME_WIDTH = OSD.data.parameters.cameraFrameWidth;
    const FRAME_HEIGHT = OSD.data.parameters.cameraFrameHeight;

    const cameraFrame = [];

    for (let x = 0; x < FRAME_WIDTH; x++) {
        const sym = (x === 0 || x === (FRAME_WIDTH -1)) ? SYM.STICK_OVERLAY_CENTER : SYM.STICK_OVERLAY_HORIZONTAL;
        const frameUp = { x, y : 0, sym };
        const frameDown = { x, y : FRAME_HEIGHT - 1, sym };

        cameraFrame.push(frameUp);
        cameraFrame.push(frameDown);
    }

    for (let y = 1; y < FRAME_HEIGHT - 1; y++) {
        const sym = SYM.STICK_OVERLAY_VERTICAL;
        const frameLeft = { x : 0, y, sym };
        const frameRight = { x : FRAME_WIDTH - 1, y, sym };

        cameraFrame.push(frameLeft);
        cameraFrame.push(frameRight);
    }

    return cameraFrame;
};

OSD.loadDisplayFields = function() {

 // All display fields, from every version, do not remove elements, only add!
    OSD.ALL_DISPLAY_FIELDS = {
        MAIN_BATT_VOLTAGE: {
            name: 'MAIN_BATT_VOLTAGE',
            text: 'osdTextElementMainBattVoltage',
            desc: 'osdDescElementMainBattVoltage',
            default_position: -29,
            draw_order: 20,
            positionable: true,
            preview: FONT.symbol(SYM.BATTERY) + '16.8' + FONT.symbol(SYM.VOLT)
        },
        RSSI_VALUE: {
            name: 'RSSI_VALUE',
            text: 'osdTextElementRssiValue',
            desc: 'osdDescElementRssiValue',
            default_position: -59,
            draw_order: 30,
            positionable: true,
            preview: FONT.symbol(SYM.RSSI) + '99'
        },
        TIMER: {
            name: 'TIMER',
            text: 'osdTextElementTimer',
            desc: 'osdDescElementTimer',
            default_position: -39,
            positionable: true,
            preview: FONT.symbol(SYM.ON_M) + ' 11:11'
        },
        THROTTLE_POSITION: {
            name: 'THROTTLE_POSITION',
            text: 'osdTextElementThrottlePosition',
            desc: 'osdDescElementThrottlePosition',
            default_position: -9,
            draw_order: 110,
            positionable: true,
            preview: FONT.symbol(SYM.THR) + ' 69'
        },
        CPU_LOAD: {
            name: 'CPU_LOAD',
            text: 'osdTextElementCpuLoad',
            desc: 'osdDescElementCpuLoad',
            default_position: 26,
            positionable: true,
            preview: '15'
        },
        VTX_CHANNEL: {
            name: 'VTX_CHANNEL',
            text: 'osdTextElementVtxChannel',
            desc: 'osdDescElementVtxChannel',
            default_position: 1,
            draw_order: 120,
            positionable: true,
            preview: 'R:2:200:P'
        },
        VOLTAGE_WARNING: {
            name: 'VOLTAGE_WARNING',
            text: 'osdTextElementVoltageWarning',
            desc: 'osdDescElementVoltageWarning',
            default_position: -80,
            positionable: true,
            preview: 'LOW VOLTAGE'
        },
        ARMED: {
            name: 'ARMED',
            text: 'osdTextElementArmed',
            desc: 'osdDescElementArmed',
            default_position: -107,
            positionable: true,
            preview: 'ARMED'
        },
        DISARMED: {
            name: 'DISARMED',
            text: 'osdTextElementDisarmed',
            desc: 'osdDescElementDisarmed',
            default_position: -109,
            draw_order: 280,
            positionable: true,
            preview: 'DISARMED'
        },
        CROSSHAIRS: {
            name: 'CROSSHAIRS',
            text: 'osdTextElementCrosshairs',
            desc: 'osdDescElementCrosshairs',
            default_position: function () {
                var position = 193;
                if (OSD.constants.VIDEO_TYPES[OSD.data.video_system] != 'NTSC') {
                    position += FONT.constants.SIZES.LINE;
                }
                return position;
            },
            draw_order: 40,
            positionable: function () {
                return semver.gte(FC.CONFIG.apiVersion, "1.39.0") ? true : false;
            },
            preview: function () {
                return FONT.symbol(SYM.AH_CENTER_LINE) + FONT.symbol(SYM.AH_CENTER) + FONT.symbol(SYM.AH_CENTER_LINE_RIGHT);
            }
        },
        ARTIFICIAL_HORIZON: {
            name: 'ARTIFICIAL_HORIZON',
            text: 'osdTextElementArtificialHorizon',
            desc: 'osdDescElementArtificialHorizon',
            default_position: function () {
                var position = 74;
                if (OSD.constants.VIDEO_TYPES[OSD.data.video_system] != 'NTSC') {
                    position += FONT.constants.SIZES.LINE;
                }
                return position;
            },
            draw_order: 10,
            positionable: function () {
                return semver.gte(FC.CONFIG.apiVersion, "1.39.0") ? true : false;
            },
            preview: function () {
                var artificialHorizon = new Array();

                for (var j = 1; j < 8; j++) {
                    for (var i = -4; i <= 4; i++) {

                        var element;

                        // Blank char to mark the size of the element
                        if (j != 4) {
                            element = { x: i, y: j, sym: SYM.BLANK };

                            // Sample of horizon
                        } else {
                            element = { x: i, y: j, sym: SYM.AH_BAR9_0 + 4 };
                        }
                        artificialHorizon.push(element);
                    }
                }
                return artificialHorizon;
            }
        },
        HORIZON_SIDEBARS: {
            name: 'HORIZON_SIDEBARS',
            text: 'osdTextElementHorizonSidebars',
            desc: 'osdDescElementHorizonSidebars',
            default_position: function () {
                var position = 194;
                if (OSD.constants.VIDEO_TYPES[OSD.data.video_system] != 'NTSC') {
                    position += FONT.constants.SIZES.LINE;
                }
                return position;
            },
            draw_order: 50,
            positionable: function () {
                return semver.gte(FC.CONFIG.apiVersion, "1.39.0") ? true : false;
            },
            preview: function (fieldPosition) {

                var horizonSidebar = new Array();

                var hudwidth = OSD.constants.AHISIDEBARWIDTHPOSITION;
                var hudheight = OSD.constants.AHISIDEBARHEIGHTPOSITION;
                for (var i = -hudheight; i <= hudheight; i++) {
                    var element = { x: -hudwidth, y: i, sym: SYM.AH_DECORATION };
                    horizonSidebar.push(element);

                    element = { x: hudwidth, y: i, sym: SYM.AH_DECORATION };
                    horizonSidebar.push(element);
                }

                // AH level indicators
                var element = { x: -hudwidth + 1, y: 0, sym: SYM.AH_LEFT };
                horizonSidebar.push(element);

                element = { x: hudwidth - 1, y: 0, sym: SYM.AH_RIGHT };
                horizonSidebar.push(element);

                return horizonSidebar;
            }
        },
        CURRENT_DRAW: {
            name: 'CURRENT_DRAW',
            text: 'osdTextElementCurrentDraw',
            desc: 'osdDescElementCurrentDraw',
            default_position: -23,
            draw_order: 130,
            positionable: true,
            preview: function () {
                return semver.gte(FC.CONFIG.apiVersion, "1.36.0") ? ' 42.00' + FONT.symbol(SYM.AMP) : FONT.symbol(SYM.AMP) + '42.0';
            }
        },
        MAH_DRAWN: {
            name: 'MAH_DRAWN',
            text: 'osdTextElementMahDrawn',
            desc: 'osdDescElementMahDrawn',
            default_position: -18,
            draw_order: 140,
            positionable: true,
            preview: function () {
                return semver.gte(FC.CONFIG.apiVersion, "1.36.0") ? ' 690' + FONT.symbol(SYM.MAH) : FONT.symbol(SYM.MAH) + '690';
            }
        },
        CRAFT_NAME: {
            name: 'CRAFT_NAME',
            text: 'osdTextElementCraftName',
            desc: 'osdDescElementCraftName',
            default_position: -77,
            draw_order: 150,
            positionable: true,
            preview: OSD.generateCraftName
        },
        ALTITUDE: {
            name: 'ALTITUDE',
            text: 'osdTextElementAltitude',
            desc: 'osdDescElementAltitude',
            default_position: 62,
            draw_order: 160,
            positionable: true,
            preview: function (osd_data) {
                const unit = FONT.symbol(osd_data.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.ALTITUDE)}399.7${unit}`;
            }
        },
        ONTIME: {
            name: 'ONTIME',
            text: 'osdTextElementOnTime',
            desc: 'osdDescElementOnTime',
            default_position: -1,
            positionable: true,
            preview: FONT.symbol(SYM.ON_M) + '05:42'
        },
        FLYTIME: {
            name: 'FLYTIME',
            text: 'osdTextElementFlyTime',
            desc: 'osdDescElementFlyTime',
            default_position: -1,
            positionable: true,
            preview: FONT.symbol(SYM.FLY_M) + '04:11'
        },
        FLYMODE: {
            name: 'FLYMODE',
            text: 'osdTextElementFlyMode',
            desc: 'osdDescElementFlyMode',
            default_position: -1,
            draw_order: 90,
            positionable: true,
            preview: 'ANGL'
        },
        GPS_SPEED: {
            name: 'GPS_SPEED',
            text: 'osdTextElementGPSSpeed',
            desc: 'osdDescElementGPSSpeed',
            default_position: -1,
            draw_order: 810,
            positionable: true,
            preview: function (osd_data) {
                const unit = FONT.symbol(osd_data.unit_mode === 0 || osd_data.unit_mode === 1 ? SYM.MPH : SYM.KPH);
                return `${FONT.symbol(SYM.SPEED)}40${unit}`;
            }
        },
        GPS_SATS: {
            name: 'GPS_SATS',
            text: 'osdTextElementGPSSats',
            desc: 'osdDescElementGPSSats',
            default_position: -1,
            draw_order: 800,
            positionable: true,
            preview: FONT.symbol(SYM.GPS_SAT_L) + FONT.symbol(SYM.GPS_SAT_R) + '14'
        },
        GPS_LON: {
            name: 'GPS_LON',
            text: 'osdTextElementGPSLon',
            desc: 'osdDescElementGPSLon',
            default_position: -1,
            draw_order: 830,
            positionable: true,
            preview: FONT.symbol(SYM.GPS_LON) + '-000.0000000'
        },
        GPS_LAT: {
            name: 'GPS_LAT',
            text: 'osdTextElementGPSLat',
            desc: 'osdDescElementGPSLat',
            default_position: -1,
            draw_order: 820,
            positionable: true,
            preview: FONT.symbol(SYM.GPS_LAT) + '-00.0000000 '
        },
        DEBUG: {
            name: 'DEBUG',
            text: 'osdTextElementDebug',
            desc: 'osdDescElementDebug',
            default_position: -1,
            draw_order: 240,
            positionable: true,
            preview: 'DBG     0     0     0     0'
        },
        PID_ROLL: {
            name: 'PID_ROLL',
            text: 'osdTextElementPIDRoll',
            desc: 'osdDescElementPIDRoll',
            default_position: 0x800 | (10 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 170,
            positionable: true,
            preview: 'ROL  43  40  20'
        },
        PID_PITCH: {
            name: 'PID_PITCH',
            text: 'osdTextElementPIDPitch',
            desc: 'osdDescElementPIDPitch',
            default_position: 0x800 | (11 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 180,
            positionable: true,
            preview: 'PIT  58  50  22'
        },
        PID_YAW: {
            name: 'PID_YAW',
            text: 'osdTextElementPIDYaw',
            desc: 'osdDescElementPIDYaw',
            default_position: 0x800 | (12 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 190,
            positionable: true,
            preview: 'YAW  70  45  20'
        },
        POWER: {
            name: 'POWER',
            text: 'osdTextElementPower',
            desc: 'osdDescElementPower',
            default_position: (15 << 5) | 2,
            draw_order: 200,
            positionable: true,
            preview: function () {
                return semver.gte(FC.CONFIG.apiVersion, "1.36.0") ? ' 142W' : '142W';
            }
        },
        PID_RATE_PROFILE: {
            name: 'PID_RATE_PROFILE',
            text: 'osdTextElementPIDRateProfile',
            desc: 'osdDescElementPIDRateProfile',
            default_position: 0x800 | (13 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 210,
            positionable: true,
            preview: '1-2'
        },
        BATTERY_WARNING: {
            name: 'BATTERY_WARNING',
            text: 'osdTextElementBatteryWarning',
            desc: 'osdDescElementBatteryWarning',
            default_position: -1,
            positionable: true,
            preview: 'LOW VOLTAGE'
        },
        AVG_CELL_VOLTAGE: {
            name: 'AVG_CELL_VOLTAGE',
            text: 'osdTextElementAvgCellVoltage',
            desc: 'osdDescElementAvgCellVoltage',
            default_position: 12 << 5,
            draw_order: 230,
            positionable: true,
            preview: FONT.symbol(SYM.BATTERY) + '3.98' + FONT.symbol(SYM.VOLT)
        },
        PITCH_ANGLE: {
            name: 'PITCH_ANGLE',
            text: 'osdTextElementPitchAngle',
            desc: 'osdDescElementPitchAngle',
            default_position: -1,
            draw_order: 250,
            positionable: true,
            preview: FONT.symbol(SYM.PITCH) + '-00.0'
        },
        ROLL_ANGLE: {
            name: 'ROLL_ANGLE',
            text: 'osdTextElementRollAngle',
            desc: 'osdDescElementRollAngle',
            default_position: -1,
            draw_order: 260,
            positionable: true,
            preview: FONT.symbol(SYM.ROLL) + '-00.0'
        },
        MAIN_BATT_USAGE: {
            name: 'MAIN_BATT_USAGE',
            text: 'osdTextElementMainBattUsage',
            desc: 'osdDescElementMainBattUsage',
            default_position: -17,
            draw_order: 270,
            positionable: true,
            preview: FONT.symbol(SYM.PB_START) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_FULL) + FONT.symbol(SYM.PB_END) + FONT.symbol(SYM.PB_EMPTY) + FONT.symbol(SYM.PB_CLOSE)
        },
        ARMED_TIME: {
            name: 'ARMED_TIME',
            text: 'osdTextElementArmedTime',
            desc: 'osdDescElementArmedTime',
            default_position: -1,
            positionable: true,
            preview: FONT.symbol(SYM.FLY_M) + '02:07'
        },
        HOME_DIR: {
            name: 'HOME_DIRECTION',
            text: 'osdTextElementHomeDirection',
            desc: 'osdDescElementHomeDirection',
            default_position: -1,
            draw_order: 850,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_SOUTH + 2)
        },
        HOME_DIST: {
            name: 'HOME_DISTANCE',
            text: 'osdTextElementHomeDistance',
            desc: 'osdDescElementHomeDistance',
            default_position: -1,
            draw_order: 840,
            positionable: true,
            preview: function (osd_data) {
                const unit = FONT.symbol(osd_data.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.HOMEFLAG)}432${unit}`;
            }
        },
        NUMERICAL_HEADING: {
            name: 'NUMERICAL_HEADING',
            text: 'osdTextElementNumericalHeading',
            desc: 'osdDescElementNumericalHeading',
            default_position: -1,
            draw_order: 290,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_EAST) + '90'
        },
        NUMERICAL_VARIO: {
            name: 'NUMERICAL_VARIO',
            text: 'osdTextElementNumericalVario',
            desc: 'osdDescElementNumericalVario',
            default_position: -1,
            draw_order: 300,
            positionable: true,
            preview: function (osd_data) {
                const unit = FONT.symbol(osd_data.unit_mode === 0 ? SYM.FTPS : SYM.MPS);
                return `${FONT.symbol(SYM.ARROW_SMALL_UP)}8.7${unit}`;
            }
        },
        COMPASS_BAR: {
            name: 'COMPASS_BAR',
            text: 'osdTextElementCompassBar',
            desc: 'osdDescElementCompassBar',
            default_position: -1,
            draw_order: 310,
            positionable: true,
            preview: function (osd_data) {
                return FONT.symbol(SYM.HEADING_W) + FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_DIVIDED_LINE) +
                    FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_N) + FONT.symbol(SYM.HEADING_LINE) +
                    FONT.symbol(SYM.HEADING_DIVIDED_LINE) + FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_E)
            }
        },
        WARNINGS: {
            name: 'WARNINGS',
            text: 'osdTextElementWarnings',
            desc: 'osdDescElementWarnings',
            default_position: -1,
            draw_order: 220,
            positionable: true,
            preview: 'LOW VOLTAGE'
        },
        ESC_TEMPERATURE: {
            name: 'ESC_TEMPERATURE',
            text: 'osdTextElementEscTemperature',
            desc: 'osdDescElementEscTemperature',
            default_position: -1,
            draw_order: 900,
            positionable: true,
            preview: function (osd_data) {
                return "E" + OSD.generateTemperaturePreview(osd_data, 45);
            }
        },
        ESC_RPM: {
            name: 'ESC_RPM',
            text: 'osdTextElementEscRpm',
            desc: 'osdDescElementEscRpm',
            default_position: -1,
            draw_order: 1000,
            positionable: true,
            preview: [ "22600", "22600", "22600", "22600"]
        },
        REMAINING_TIME_ESTIMATE: {
            name: 'REMAINING_TIME_ESTIMATE',
            text: 'osdTextElementRemaningTimeEstimate',
            desc: 'osdDescElementRemaningTimeEstimate',
            default_position: -1,
            draw_order: 80,
            positionable: true,
            preview: '01:13'
        },
        RTC_DATE_TIME: {
            name: 'RTC_DATE_TIME',
            text: 'osdTextElementRtcDateTime',
            desc: 'osdDescElementRtcDateTime',
            default_position: -1,
            draw_order: 360,
            positionable: true,
            preview: '2017-11-11 16:20:00'
        },
        ADJUSTMENT_RANGE: {
            name: 'ADJUSTMENT_RANGE',
            text: 'osdTextElementAdjustmentRange',
            desc: 'osdDescElementAdjustmentRange',
            default_position: -1,
            draw_order: 370,
            positionable: true,
            preview: 'PITCH/ROLL P: 42'
        },
        TIMER_1: {
            name: 'TIMER_1',
            text: 'osdTextElementTimer1',
            desc: 'osdDescElementTimer1',
            default_position: -1,
            draw_order: 60,
            positionable: true,
            preview: function (osd_data) {
                return OSD.generateTimerPreview(osd_data, 0);
            }
        },
        TIMER_2: {
            name: 'TIMER_2',
            text: 'osdTextElementTimer2',
            desc: 'osdDescElementTimer2',
            default_position: -1,
            draw_order: 70,
            positionable: true,
            preview: function (osd_data) {
                return OSD.generateTimerPreview(osd_data, 1);
            }
        },
        CORE_TEMPERATURE: {
            name: 'CORE_TEMPERATURE',
            text: 'osdTextElementCoreTemperature',
            desc: 'osdDescElementCoreTemperature',
            default_position: -1,
            draw_order: 380,
            positionable: true,
            preview: function (osd_data) {
                return "C" + OSD.generateTemperaturePreview(osd_data, 33);
            }
        },
        ANTI_GRAVITY: {
            name: 'ANTI_GRAVITY',
            text: 'osdTextAntiGravity',
            desc: 'osdDescAntiGravity',
            default_position: -1,
            draw_order: 320,
            positionable: true,
            preview: 'AG'
        },
        G_FORCE: {
            name: 'G_FORCE',
            text: 'osdTextGForce',
            desc: 'osdDescGForce',
            default_position: -1,
            draw_order: 15,
            positionable: true,
            preview: '1.0G'
        },
        MOTOR_DIAG: {
            name: 'MOTOR_DIAGNOSTICS',
            text: 'osdTextElementMotorDiag',
            desc: 'osdDescElementMotorDiag',
            default_position: -1,
            draw_order: 335,
            positionable: true,
            preview: FONT.symbol(0x84)
                + FONT.symbol(0x85)
                + FONT.symbol(0x84)
                + FONT.symbol(0x83)
        },
        LOG_STATUS: {
            name: 'LOG_STATUS',
            text: 'osdTextElementLogStatus',
            desc: 'osdDescElementLogStatus',
            default_position: -1,
            draw_order: 330,
            positionable: true,
            preview: FONT.symbol(SYM.BBLOG) + '16'
        },
        FLIP_ARROW: {
            name: 'FLIP_ARROW',
            text: 'osdTextElementFlipArrow',
            desc: 'osdDescElementFlipArrow',
            default_position: -1,
            draw_order: 340,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_EAST)
        },
        LINK_QUALITY: {
            name: 'LINK_QUALITY',
            text: 'osdTextElementLinkQuality',
            desc: 'osdDescElementLinkQuality',
            default_position: -1,
            draw_order: 390,
            positionable: true,
            preview: OSD.generateLQPreview,
        },
        FLIGHT_DIST: {
            name: 'FLIGHT_DISTANCE',
            text: 'osdTextElementFlightDist',
            desc: 'osdDescElementFlightDist',
            default_position: -1,
            draw_order: 860,
            positionable: true,
            preview: function (osd_data) {
                const unit = FONT.symbol(osd_data.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.TOTAL_DIST)}653${unit}`;
            }
        },
        STICK_OVERLAY_LEFT: {
            name: 'STICK_OVERLAY_LEFT',
            text: 'osdTextElementStickOverlayLeft',
            desc: 'osdDescElementStickOverlayLeft',
            default_position: -1,
            draw_order: 400,
            positionable: true,
            preview: OSD.drawStickOverlayPreview
        },
        STICK_OVERLAY_RIGHT: {
            name: 'STICK_OVERLAY_RIGHT',
            text: 'osdTextElementStickOverlayRight',
            desc: 'osdDescElementStickOverlayRight',
            default_position: -1,
            draw_order: 410,
            positionable: true,
            preview: OSD.drawStickOverlayPreview
        },
        DISPLAY_NAME: {
            name: 'DISPLAY_NAME',
            text: 'osdTextElementDisplayName',
            desc: 'osdDescElementDisplayName',
            default_position: -77,
            draw_order: 350,
            positionable: true,
            preview: function(osd_data) {
                return OSD.generateDisplayName(osd_data, 1);
            }
        },
        ESC_RPM_FREQ: {
            name: 'ESC_RPM_FREQ',
            text: 'osdTextElementEscRpmFreq',
            desc: 'osdDescElementEscRpmFreq',
            default_position: -1,
            draw_order: 1010,
            positionable: true,
            preview: [ "22600", "22600", "22600", "22600"]
        },
        RATE_PROFILE_NAME: {
            name: 'RATE_PROFILE_NAME',
            text: 'osdTextElementRateProfileName',
            desc: 'osdDescElementRateProfileName',
            default_position: -1,
            draw_order: 420,
            positionable: true,
            preview: 'RATE_1'
        },
        PID_PROFILE_NAME: {
            name: 'PID_PROFILE_NAME',
            text: 'osdTextElementPidProfileName',
            desc: 'osdDescElementPidProfileName',
            default_position: -1,
            draw_order: 430,
            positionable: true,
            preview: 'PID_1'
        },
        OSD_PROFILE_NAME: {
            name: 'OSD_PROFILE_NAME',
            text: 'osdTextElementOsdProfileName',
            desc: 'osdDescElementOsdProfileName',
            default_position: -1,
            draw_order: 440,
            positionable: true,
            preview: 'OSD_1'
        },
        RSSI_DBM_VALUE: {
            name: 'RSSI_DBM_VALUE',
            text: 'osdTextElementRssiDbmValue',
            desc: 'osdDescElementRssiDbmValue',
            default_position: -1,
            draw_order: 395,
            positionable: true,
            preview: FONT.symbol(SYM.RSSI) + '-130'
        },
        RC_CHANNELS: {
            name: 'OSD_RC_CHANNELS',
            text: 'osdTextElementRcChannels',
            desc: 'osdDescElementRcChannels',
            default_position: -1,
            draw_order: 445,
            positionable: true,
            preview: [ "-1000", "  545", "  689", " 1000"],
        },
        CAMERA_FRAME: {
            name: 'OSD_CAMERA_FRAME',
            text: 'osdTextElementCameraFrame',
            desc: 'osdDescElementCameraFrame',
            default_position: -1,
            draw_order: 450,
            positionable: true,
            preview: OSD.drawCameraFramePreview,
        },
        OSD_EFFICIENCY: {
            name: 'OSD_EFFICIENCY',
            text: 'osdTextElementEfficiency',
            desc: 'osdDescElementEfficiency',
            default_position: -1,
            draw_order: 455,
            positionable: true,
            preview: function (osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.MILES : SYM.KM);
                return `1234${FONT.symbol(SYM.MAH)}/${unit}`;
            },
        },

    };
};

OSD.constants = {
    VISIBLE: 0x0800,
    VIDEO_TYPES: [
        'AUTO',
        'PAL',
        'NTSC'
    ],
    VIDEO_LINES: {
        PAL: 16,
        NTSC: 13
    },
    VIDEO_BUFFER_CHARS: {
        PAL: 480,
        NTSC: 390
    },
    UNIT_TYPES: [
        'IMPERIAL',
        'METRIC',
        'BRITISH',
    ],
    TIMER_PRECISION: [
        'SECOND',
        'HUNDREDTH',
        'TENTH'
    ],
    AHISIDEBARWIDTHPOSITION: 7,
    AHISIDEBARHEIGHTPOSITION: 3,

    UNKNOWN_DISPLAY_FIELD: {
        name: 'UNKNOWN',
        text: 'osdTextElementUnknown',
        desc: 'osdDescElementUnknown',
        default_position: -1,
        positionable: true,
        preview: 'UNKNOWN '
    },
    ALL_STATISTIC_FIELDS: {
        MAX_SPEED: {
            name: 'MAX_SPEED',
            text: 'osdTextStatMaxSpeed',
            desc: 'osdDescStatMaxSpeed'
        },
        MIN_BATTERY: {
            name: 'MIN_BATTERY',
            text: 'osdTextStatMinBattery',
            desc: 'osdDescStatMinBattery'
        },
        MIN_RSSI: {
            name: 'MIN_RSSI',
            text: 'osdTextStatMinRssi',
            desc: 'osdDescStatMinRssi'
        },
        MAX_CURRENT: {
            name: 'MAX_CURRENT',
            text: 'osdTextStatMaxCurrent',
            desc: 'osdDescStatMaxCurrent'
        },
        USED_MAH: {
            name: 'USED_MAH',
            text: 'osdTextStatUsedMah',
            desc: 'osdDescStatUsedMah'
        },
        MAX_ALTITUDE: {
            name: 'MAX_ALTITUDE',
            text: 'osdTextStatMaxAltitude',
            desc: 'osdDescStatMaxAltitude'
        },
        BLACKBOX: {
            name: 'BLACKBOX',
            text: 'osdTextStatBlackbox',
            desc: 'osdDescStatBlackbox'
        },
        END_BATTERY: {
            name: 'END_BATTERY',
            text: 'osdTextStatEndBattery',
            desc: 'osdDescStatEndBattery'
        },
        FLYTIME: {
            name: 'FLY_TIME',
            text: 'osdTextStatFlyTime',
            desc: 'osdDescStatFlyTime'
        },
        ARMEDTIME: {
            name: 'ARMED_TIME',
            text: 'osdTextStatArmedTime',
            desc: 'osdDescStatArmedTime'
        },
        MAX_DISTANCE: {
            name: 'MAX_DISTANCE',
            text: 'osdTextStatMaxDistance',
            desc: 'osdDescStatMaxDistance'
        },
        BLACKBOX_LOG_NUMBER: {
            name: 'BLACKBOX_LOG_NUMBER',
            text: 'osdTextStatBlackboxLogNumber',
            desc: 'osdDescStatBlackboxLogNumber'
        },
        TIMER_1: {
            name: 'TIMER_1',
            text: 'osdTextStatTimer1',
            desc: 'osdDescStatTimer1'
        },
        TIMER_2: {
            name: 'TIMER_2',
            text: 'osdTextStatTimer2',
            desc: 'osdDescStatTimer2'
        },
        RTC_DATE_TIME: {
            name: 'RTC_DATE_TIME',
            text: 'osdTextStatRtcDateTime',
            desc: 'osdDescStatRtcDateTime'
        },
        STAT_BATTERY: {
            name: 'BATTERY_VOLTAGE',
            text: 'osdTextStatBattery',
            desc: 'osdDescStatBattery'
        },
        MAX_G_FORCE: {
            name: 'MAX_G_FORCE',
            text: 'osdTextStatGForce',
            desc: 'osdDescStatGForce'
        },
        MAX_ESC_TEMP: {
            name: 'MAX_ESC_TEMP',
            text: 'osdTextStatEscTemperature',
            desc: 'osdDescStatEscTemperature'
        },
        MAX_ESC_RPM: {
            name: 'MAX_ESC_RPM',
            text: 'osdTextStatEscRpm',
            desc: 'osdDescStatEscRpm'
        },
        MIN_LINK_QUALITY: {
            name: 'MIN_LINK_QUALITY',
            text: 'osdTextStatMinLinkQuality',
            desc: 'osdDescStatMinLinkQuality'
        },
        FLIGHT_DISTANCE: {
            name: 'FLIGHT_DISTANCE',
            text: 'osdTextStatFlightDistance',
            desc: 'osdDescStatFlightDistance',
        },
        MAX_FFT: {
            name: 'MAX_FFT',
            text: 'osdTextStatMaxFFT',
            desc: 'osdDescStatMaxFFT'
        },
        TOTAL_FLIGHTS: {
            name: 'TOTAL_FLIGHTS',
            text: 'osdTextStatTotalFlights',
            desc: 'osdDescStatTotalFlights'
        },
        TOTAL_FLIGHT_TIME: {
            name: 'TOTAL_FLIGHT_TIME',
            text: 'osdTextStatTotalFlightTime',
            desc: 'osdDescStatTotalFlightTime'
        },
        TOTAL_FLIGHT_DIST: {
            name: 'TOTAL_FLIGHT_DIST',
            text: 'osdTextStatTotalFlightDistance',
            desc: 'osdDescStatTotalFlightDistance'
        },
        MIN_RSSI_DBM: {
            name: 'MIN_RSSI_DBM',
            text: 'osdTextStatMinRssiDbm',
            desc: 'osdDescStatMinRssiDbm'
        },
    },
    ALL_WARNINGS: {
        ARMING_DISABLED: {
            name: 'ARMING_DISABLED',
            text: 'osdWarningTextArmingDisabled',
            desc: 'osdWarningArmingDisabled'
        },
        BATTERY_NOT_FULL: {
            name: 'BATTERY_NOT_FULL',
            text: 'osdWarningTextBatteryNotFull',
            desc: 'osdWarningBatteryNotFull'
        },
        BATTERY_WARNING: {
            name: 'BATTERY_WARNING',
            text: 'osdWarningTextBatteryWarning',
            desc: 'osdWarningBatteryWarning'
        },
        BATTERY_CRITICAL: {
            name: 'BATTERY_CRITICAL',
            text: 'osdWarningTextBatteryCritical',
            desc: 'osdWarningBatteryCritical'
        },
        VISUAL_BEEPER: {
            name: 'VISUAL_BEEPER',
            text: 'osdWarningTextVisualBeeper',
            desc: 'osdWarningVisualBeeper'
        },
        CRASH_FLIP_MODE: {
            name: 'CRASH_FLIP_MODE',
            text: 'osdWarningTextCrashFlipMode',
            desc: 'osdWarningCrashFlipMode'
        },
        ESC_FAIL: {
            name: 'ESC_FAIL',
            text: 'osdWarningTextEscFail',
            desc: 'osdWarningEscFail'
        },
        CORE_TEMPERATURE: {
            name: 'CORE_TEMPERATURE',
            text: 'osdWarningTextCoreTemperature',
            desc: 'osdWarningCoreTemperature'
        },
        RC_SMOOTHING_FAILURE: {
            name: 'RC_SMOOTHING_FAILURE',
            text: 'osdWarningTextRcSmoothingFailure',
            desc: 'osdWarningRcSmoothingFailure'
        },
        FAILSAFE: {
            name: 'FAILSAFE',
            text: 'osdWarningTextFailsafe',
            desc: 'osdWarningFailsafe'
        },
        LAUNCH_CONTROL: {
            name: 'LAUNCH_CONTROL',
            text: 'osdWarningTextLaunchControl',
            desc: 'osdWarningLaunchControl'
        },
        GPS_RESCUE_UNAVAILABLE: {
            name: 'GPS_RESCUE_UNAVAILABLE',
            text: 'osdWarningTextGpsRescueUnavailable',
            desc: 'osdWarningGpsRescueUnavailable'
        },
        GPS_RESCUE_DISABLED: {
            name: 'GPS_RESCUE_DISABLED',
            text: 'osdWarningTextGpsRescueDisabled',
            desc: 'osdWarningGpsRescueDisabled'
        },
        RSSI: {
            name: 'RSSI',
            text: 'osdWarningTextRSSI',
            desc: 'osdWarningRSSI'
        },
        LINK_QUALITY: {
            name: 'LINK_QUALITY',
            text: 'osdWarningTextLinkQuality',
            desc: 'osdWarningLinkQuality'
        },
        RSSI_DBM: {
            name: 'RSSI_DBM',
            text: 'osdWarningTextRssiDbm',
            desc: 'osdWarningRssiDbm'
        },
        OVER_CAP: {
            name: 'OVER_CAP',
            text: 'osdWarningTextOverCap',
            desc: 'osdWarningOverCap',
        },

    },
    FONT_TYPES: [
        { file: "default", name: "Default" },
        { file: "bold", name: "Bold" },
        { file: "large", name: "Large" },
        { file: "extra_large", name: "Extra Large" },
        { file: "betaflight", name: "Betaflight" },
        { file: "digital", name: "Digital" },
        { file: "clarity", name: "Clarity" },
        { file: "vision", name: "Vision" },
        { file: "impact", name: "Impact" },
        { file: "impact_mini", name: "Impact Mini" },
    ]
};

OSD.searchLimitsElement = function (arrayElements) {
    // Search minimum and maximum
    var limits = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    if (arrayElements.length == 0) {
        return limits;
    }

    if (arrayElements[0].constructor === String) {
        limits.maxY = arrayElements.length;
        limits.minY = 0;
        limits.minX = 0;
        arrayElements.forEach(function(valor, indice, array) {
            limits.maxX = Math.max(valor.length, limits.maxX);
        });
    } else {
        arrayElements.forEach(function (valor, indice, array) {
            limits.minX = Math.min(valor.x, limits.minX);
            limits.maxX = Math.max(valor.x, limits.maxX);
            limits.minY = Math.min(valor.y, limits.minY);
            limits.maxY = Math.max(valor.y, limits.maxY);
        });
    }

    return limits;
}

// Pick display fields by version, order matters, so these are going in an array... pry could iterate the example map instead
OSD.chooseFields = function () {
    var F = OSD.ALL_DISPLAY_FIELDS;
    // version 3.0.1
    if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
        OSD.constants.DISPLAY_FIELDS = [
            F.RSSI_VALUE,
            F.MAIN_BATT_VOLTAGE,
            F.CROSSHAIRS,
            F.ARTIFICIAL_HORIZON,
            F.HORIZON_SIDEBARS
        ];

        if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.ONTIME,
                F.FLYTIME
            ]);
        } else {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.TIMER_1,
                F.TIMER_2
            ]);
        }

        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
            F.FLYMODE,
            F.CRAFT_NAME,
            F.THROTTLE_POSITION,
            F.VTX_CHANNEL,
            F.CURRENT_DRAW,
            F.MAH_DRAWN,
            F.GPS_SPEED,
            F.GPS_SATS,
            F.ALTITUDE
        ]);
        if (semver.gte(FC.CONFIG.apiVersion, "1.31.0")) {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.PID_ROLL,
                F.PID_PITCH,
                F.PID_YAW,
                F.POWER
            ]);
            if (semver.gte(FC.CONFIG.apiVersion, "1.32.0")) {
                OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                    F.PID_RATE_PROFILE,
                    semver.gte(FC.CONFIG.apiVersion, "1.36.0") ? F.WARNINGS : F.BATTERY_WARNING,
                    F.AVG_CELL_VOLTAGE
                ]);
                if (semver.gte(FC.CONFIG.apiVersion, "1.34.0")) {
                    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                        F.GPS_LON,
                        F.GPS_LAT,
                        F.DEBUG
                    ]);
                    if (semver.gte(FC.CONFIG.apiVersion, "1.35.0")) {
                        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                            F.PITCH_ANGLE,
                            F.ROLL_ANGLE
                        ]);
                        if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                F.MAIN_BATT_USAGE,
                                F.DISARMED,
                                F.HOME_DIR,
                                F.HOME_DIST,
                                F.NUMERICAL_HEADING,
                                F.NUMERICAL_VARIO,
                                F.COMPASS_BAR,
                                F.ESC_TEMPERATURE,
                                F.ESC_RPM
                            ]);
                            if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                                OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                    F.REMAINING_TIME_ESTIMATE,
                                    F.RTC_DATE_TIME,
                                    F.ADJUSTMENT_RANGE,
                                    F.CORE_TEMPERATURE
                                ]);
                                if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                                    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                        F.ANTI_GRAVITY
                                    ]);
                                    if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                                        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                            F.G_FORCE,
                                        ]);
                                        if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                                            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                                F.MOTOR_DIAG,
                                                F.LOG_STATUS,
                                                F.FLIP_ARROW,
                                                F.LINK_QUALITY,
                                                F.FLIGHT_DIST,
                                                F.STICK_OVERLAY_LEFT,
                                                F.STICK_OVERLAY_RIGHT,
                                                F.DISPLAY_NAME,
                                                F.ESC_RPM_FREQ
                                            ]);
                                            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                                                OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                                    F.RATE_PROFILE_NAME,
                                                    F.PID_PROFILE_NAME,
                                                    F.OSD_PROFILE_NAME,
                                                    F.RSSI_DBM_VALUE,
                                                ]);
                                                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                                                    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                                        F.RC_CHANNELS,
                                                        F.CAMERA_FRAME,
                                                        F.OSD_EFFICIENCY,
                                                    ]);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    // version 3.0.0
    else {
        OSD.constants.DISPLAY_FIELDS = [
            F.MAIN_BATT_VOLTAGE,
            F.RSSI_VALUE,
            F.TIMER,
            F.THROTTLE_POSITION,
            F.CPU_LOAD,
            F.VTX_CHANNEL,
            F.VOLTAGE_WARNING,
            F.ARMED,
            F.DISARMED,
            F.ARTIFICIAL_HORIZON,
            F.HORIZON_SIDEBARS,
            F.CURRENT_DRAW,
            F.MAH_DRAWN,
            F.CRAFT_NAME,
            F.ALTITUDE
        ];
    }

    // Choose statistic fields
    // Nothing much to do here, I'm preempting there being new statistics
    F = OSD.constants.ALL_STATISTIC_FIELDS;

    // ** IMPORTANT **
    //
    // Starting with 1.39.0 (Betaflight 3.4) the OSD stats selection options
    // are ordered in the same sequence as displayed on-screen in the OSD.
    // If future versions of the firmware implement changes to the on-screen ordering,
    // that needs to be implemented here as well. Simply appending new stats does not
    // require a completely new section for the version - only reordering.

    if (semver.lt(FC.CONFIG.apiVersion, "1.39.0")) {
        OSD.constants.STATISTIC_FIELDS = [
            F.MAX_SPEED,
            F.MIN_BATTERY,
            F.MIN_RSSI,
            F.MAX_CURRENT,
            F.USED_MAH,
            F.MAX_ALTITUDE,
            F.BLACKBOX,
            F.END_BATTERY,
            F.TIMER_1,
            F.TIMER_2,
            F.MAX_DISTANCE,
            F.BLACKBOX_LOG_NUMBER
        ];
        if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.RTC_DATE_TIME
            ]);
        }
    } else {  // Starting with 1.39.0 OSD stats are reordered to match how they're presented on screen
        OSD.constants.STATISTIC_FIELDS = [
            F.RTC_DATE_TIME,
            F.TIMER_1,
            F.TIMER_2,
            F.MAX_SPEED,
            F.MAX_DISTANCE,
            F.MIN_BATTERY,
            F.END_BATTERY,
            F.STAT_BATTERY,
            F.MIN_RSSI,
            F.MAX_CURRENT,
            F.USED_MAH,
            F.MAX_ALTITUDE,
            F.BLACKBOX,
            F.BLACKBOX_LOG_NUMBER
        ];
        if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.MAX_G_FORCE,
                F.MAX_ESC_TEMP,
                F.MAX_ESC_RPM,
                F.MIN_LINK_QUALITY,
                F.FLIGHT_DISTANCE,
                F.MAX_FFT
            ]);
        }
        if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.TOTAL_FLIGHTS,
                F.TOTAL_FLIGHT_TIME,
                F.TOTAL_FLIGHT_DIST,
                F.MIN_RSSI_DBM
            ]);
        }
    }

    // Choose warnings
    // Nothing much to do here, I'm preempting there being new warnings
    F = OSD.constants.ALL_WARNINGS;
    OSD.constants.WARNINGS = [
        F.ARMING_DISABLED,
        F.BATTERY_NOT_FULL,
        F.BATTERY_WARNING,
        F.BATTERY_CRITICAL,
        F.VISUAL_BEEPER,
        F.CRASH_FLIP_MODE
    ];
    if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([
            F.ESC_FAIL,
            F.CORE_TEMPERATURE,
            F.RC_SMOOTHING_FAILURE
        ]);
    }
    if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([
            F.FAILSAFE,
            F.LAUNCH_CONTROL,
            F.GPS_RESCUE_UNAVAILABLE,
            F.GPS_RESCUE_DISABLED
        ]);
    }

    OSD.constants.TIMER_TYPES = [
        'ON_TIME',
        'TOTAL_ARMED_TIME',
        'LAST_ARMED_TIME'
    ];
    if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
        OSD.constants.TIMER_TYPES = OSD.constants.TIMER_TYPES.concat([
            'ON_ARM_TIME'
        ]);
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([
            F.RSSI,
            F.LINK_QUALITY,
            F.RSSI_DBM,
        ]);
    }
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([
            F.OVER_CAP,
        ]);
    }
};

OSD.updateDisplaySize = function () {
    var video_type = OSD.constants.VIDEO_TYPES[OSD.data.video_system];
    if (video_type == 'AUTO') {
        video_type = 'PAL';
    }
    // compute the size
    OSD.data.display_size = {
        x: FONT.constants.SIZES.LINE,
        y: OSD.constants.VIDEO_LINES[video_type],
        total: null
    };
};

OSD.drawByOrder = function (selectedPosition, field, charCode, x, y) {

    // Check if there is other field at the same position
    if (OSD.data.preview[selectedPosition] !== undefined) {
        var oldField = OSD.data.preview[selectedPosition][0];
        if (oldField != null) {
            if (oldField.draw_order !== undefined) {
                if ((field.draw_order === undefined) || (field.draw_order < oldField.draw_order)) {
                    // Not overwrite old field
                    return;
                }
            }
        }

        // Default action, overwrite old field
        OSD.data.preview[selectedPosition++] = [field, charCode, x, y];
    }
}

OSD.msp = {
    /**
    * Note, unsigned 16 bit int for position ispacked:
    * 0: unused
    * v: visible flag
    * b: blink flag
    * y: y coordinate
    * x: x coordinate
    * 0000 vbyy yyyx xxxx
    */
    helpers: {
        unpack: {
            position: function (bits, c) {
                var display_item = {};

                var positionable = typeof (c.positionable) === 'function' ? c.positionable() : c.positionable;
                var default_position = typeof (c.default_position) === 'function' ? c.default_position() : c.default_position;

                display_item.positionable = positionable;
                if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                    // size * y + x
                    display_item.position = positionable ? FONT.constants.SIZES.LINE * ((bits >> 5) & 0x001F) + (bits & 0x001F) : default_position;

                    display_item.isVisible = [];
                    for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                        display_item.isVisible[osd_profile] = (bits & (OSD.constants.VISIBLE << osd_profile)) != 0;
                    }
                } else {
                    display_item.position = (bits === -1) ? default_position : bits;
                    display_item.isVisible = [bits !== -1];
                }

                return display_item;
            },
            timer: function (bits, c) {
                var timer = {
                    src: bits & 0x0F,
                    precision: (bits >> 4) & 0x0F,
                    alarm: (bits >> 8) & 0xFF
                };
                return timer;
            }
        },
        pack: {
            position: function (display_item) {
                var isVisible = display_item.isVisible;
                var position = display_item.position;
                if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {

                    let packed_visible = 0;
                    for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                        packed_visible |= isVisible[osd_profile] ? OSD.constants.VISIBLE << osd_profile : 0;
                    }
                    return packed_visible | (((position / FONT.constants.SIZES.LINE) & 0x001F) << 5) | (position % FONT.constants.SIZES.LINE);
                } else {
                    return isVisible[0] ? (position == -1 ? 0 : position) : -1;
                }
            },
            timer: function (timer) {
                return (timer.src & 0x0F) | ((timer.precision & 0x0F) << 4) | ((timer.alarm & 0xFF) << 8);
            }
        }
    },
    encodeOther: function () {
        var result = [-1, OSD.data.video_system];
        if (OSD.data.state.haveOsdFeature && semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
            result.push8(OSD.data.unit_mode);
            // watch out, order matters! match the firmware
            result.push8(OSD.data.alarms.rssi.value);
            result.push16(OSD.data.alarms.cap.value);
            if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
                result.push16(OSD.data.alarms.time.value);
            } else {
                // This value is unused by the firmware with configurable timers
                result.push16(0);
            }
            result.push16(OSD.data.alarms.alt.value);
            if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                var warningFlags = 0;
                for (var i = 0; i < OSD.data.warnings.length; i++) {
                    if (OSD.data.warnings[i].enabled) {
                        warningFlags |= (1 << i);
                    }
                }
                console.log(warningFlags);
                result.push16(warningFlags);
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    result.push32(warningFlags);

                    result.push8(OSD.data.osd_profiles.selected + 1);

                    result.push8(OSD.data.parameters.overlayRadioMode);
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    result.push8(OSD.data.parameters.cameraFrameWidth);
                    result.push8(OSD.data.parameters.cameraFrameHeight);
                }
            }

        }
        return result;
    },
    encodeLayout: function (display_item) {
        var buffer = [];
        buffer.push8(display_item.index);
        buffer.push16(this.helpers.pack.position(display_item));
        return buffer;
    },
    encodeStatistics: function (stat_item) {
        var buffer = [];
        buffer.push8(stat_item.index);
        buffer.push16(stat_item.enabled);
        buffer.push8(0);
        return buffer;
    },
    encodeTimer: function (timer) {
        var buffer = [-2, timer.index];
        buffer.push16(this.helpers.pack.timer(timer));
        return buffer;
    },
    // Currently only parses MSP_MAX_OSD responses, add a switch on payload.code if more codes are handled
    decode: function (payload) {
        var view = payload.data;
        var d = OSD.data;

        var displayItemsCountActual = OSD.constants.DISPLAY_FIELDS.length;

        d.flags = view.readU8();

        if (d.flags > 0) {
            if (payload.length > 1) {
                d.video_system = view.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, "1.21.0") && bit_check(d.flags, 0)) {
                    d.unit_mode = view.readU8();
                    d.alarms = {};
                    d.alarms['rssi'] = { display_name: i18n.getMessage('osdTimerAlarmOptionRssi'), value: view.readU8() };
                    d.alarms['cap'] = { display_name: i18n.getMessage('osdTimerAlarmOptionCapacity'), value: view.readU16() };
                    if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
                        d.alarms['time'] = { display_name: 'Minutes', value: view.readU16() };
                    } else {
                        // This value was obsoleted by the introduction of configurable timers, and has been reused to encode the number of display elements sent in this command
                        view.readU8();
                        var tmp = view.readU8();
                        if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                            displayItemsCountActual = tmp;
                        }
                    }

                    d.alarms['alt'] = { display_name: i18n.getMessage('osdTimerAlarmOptionAltitude'), value: view.readU16() };
                }
            }
        }

        d.state = {};
        d.state.haveSomeOsd = (d.flags != 0)
        d.state.haveMax7456Configured = bit_check(d.flags, 4) || (d.flags == 1 && semver.lt(FC.CONFIG.apiVersion, "1.34.0"));
        d.state.haveFrSkyOSDConfigured = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43) && bit_check(d.flags, 3);
        d.state.haveMax7456FontDeviceConfigured = d.state.haveMax7456Configured || d.state.haveFrSkyOSDConfigured;
        d.state.isMax7456FontDeviceDetected = bit_check(d.flags, 5) || (d.state.haveMax7456FontDeviceConfigured && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_43));
        d.state.haveOsdFeature = bit_check(d.flags, 0) || (d.flags == 1 && semver.lt(FC.CONFIG.apiVersion, "1.34.0"));
        d.state.isOsdSlave = bit_check(d.flags, 1) && semver.gte(FC.CONFIG.apiVersion, "1.34.0");

        d.display_items = [];
        d.stat_items = [];
        d.warnings = [];
        d.timers = [];

        d.parameters = {};
        d.parameters.overlayRadioMode = 0;
        d.parameters.cameraFrameWidth = 24;
        d.parameters.cameraFrameHeight = 11;

        // Read display element positions, the parsing is done later because we need the number of profiles
        var items_positions_read = [];
        while (view.offset < view.byteLength && items_positions_read.length < displayItemsCountActual) {
            var v = null;
            if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                v = view.readU16();
            } else {
                v = view.read16();
            }
            items_positions_read.push(v);
        }

        if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
            // Parse statistics display enable
            var expectedStatsCount = view.readU8();
            if (expectedStatsCount != OSD.constants.STATISTIC_FIELDS.length) {
                console.error("Firmware is transmitting a different number of statistics (" + expectedStatsCount + ") to what the configurator is expecting (" + OSD.constants.STATISTIC_FIELDS.length + ")");
            }

            for (var i = 0; i < expectedStatsCount; i++) {

                let v = view.readU8();

                // Known statistics field
                if (i < OSD.constants.STATISTIC_FIELDS.length) {

                    let c = OSD.constants.STATISTIC_FIELDS[i];
                    d.stat_items.push({
                        name: c.name,
                        text: c.text,
                        desc: c.desc,
                        index: i,
                        enabled: v === 1,
                    });

                // Read all the data for any statistics we don't know about
                } else {
                    let statisticNumber = i - OSD.constants.STATISTIC_FIELDS.length + 1;
                    d.stat_items.push({
                        name: 'UNKNOWN',
                        text: ['osdTextStatUnknown', statisticNumber],
                        desc: 'osdDescStatUnknown',
                        index: i,
                        enabled: v === 1,
                    });
                }
            }

            // Parse configurable timers
            var expectedTimersCount = view.readU8();
            while (view.offset < view.byteLength && expectedTimersCount > 0) {
                var v = view.readU16();
                var j = d.timers.length;
                d.timers.push($.extend({
                    index: j,
                }, this.helpers.unpack.timer(v, c)));
                expectedTimersCount--;
            }
            // Read all the data for any timers we don't know about
            while (expectedTimersCount > 0) {
                view.readU16();
                expectedTimersCount--;
            }

            // Parse enabled warnings
            var warningCount = OSD.constants.WARNINGS.length;
            var warningFlags = view.readU16();
            if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                warningCount = view.readU8();
                // the flags were replaced with a 32bit version
                warningFlags = view.readU32();
            }
            for (var i = 0; i < warningCount; i++) {

                const enabled = (warningFlags & (1 << i)) !== 0;

                // Known warning field
                if (i < OSD.constants.WARNINGS.length) {
                    d.warnings.push($.extend(OSD.constants.WARNINGS[i], { enabled: enabled }));

                // Push Unknown Warning field
                } else {
                    var warningNumber = i - OSD.constants.WARNINGS.length + 1;
                    d.warnings.push({
                        name: 'UNKNOWN',
                        text: ['osdWarningTextUnknown', warningNumber],
                        desc: 'osdWarningUnknown',
                        enabled: enabled,
                    });

                }
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
            // OSD profiles
            d.osd_profiles.number = view.readU8();
            d.osd_profiles.selected = view.readU8() - 1;

            // Overlay radio mode
            d.parameters.overlayRadioMode = view.readU8();

        } else {
            d.osd_profiles.number = 1;
            d.osd_profiles.selected = 0;
        }

        // Camera frame size
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            d.parameters.cameraFrameWidth = view.readU8();
            d.parameters.cameraFrameHeight = view.readU8();
        }

        // Now we have the number of profiles, process the OSD elements
        for (let item of items_positions_read) {
            var j = d.display_items.length;
            var c;
            var suffix;
            var ignoreSize = false;
            if (d.display_items.length < OSD.constants.DISPLAY_FIELDS.length) {
                c = OSD.constants.DISPLAY_FIELDS[j];
            } else {
                c = OSD.constants.UNKNOWN_DISPLAY_FIELD;
                suffix = "" + (1 + d.display_items.length - OSD.constants.DISPLAY_FIELDS.length);
                ignoreSize = true;
            }
            d.display_items.push($.extend({
                name: c.name,
                text: suffix ? [c.text, suffix] : c.text,
                desc: c.desc,
                index: j,
                draw_order: c.draw_order,
                preview: suffix ? c.preview + suffix : c.preview,
                ignoreSize: ignoreSize
            }, this.helpers.unpack.position(item, c)));
        }

        // Generate OSD element previews and positionable that are defined by a function
        for (let item of d.display_items) {
            if (typeof (item.preview) === 'function') {
                item.preview = item.preview(d);
            }
        }

        OSD.updateDisplaySize();
    }
};

OSD.GUI = {};
OSD.GUI.preview = {
    onMouseEnter: function () {
        if (!$(this).data('field')) { return; }
        $('#element-fields .field-' + $(this).data('field').index).addClass('mouseover')
    },
    onMouseLeave: function () {
        if (!$(this).data('field')) { return; }
        $('#element-fields .field-' + $(this).data('field').index).removeClass('mouseover')
    },
    onDragStart: function (e) {
        var ev = e.originalEvent;
        var display_item = OSD.data.display_items[$(ev.target).data('field').index];
        var xPos = ev.currentTarget.dataset.x;
        var yPos = ev.currentTarget.dataset.y;
        var offsetX = 6;
        var offsetY = 9;

        if (display_item.preview.constructor === Array) {
            var arrayElements = display_item.preview;
            var limits = OSD.searchLimitsElement(arrayElements);
            xPos -= limits.minX;
            yPos -= limits.minY;
            offsetX += (xPos) * 12;
            offsetY += (yPos) * 18;
        }

        ev.dataTransfer.setData("text/plain", $(ev.target).data('field').index);
        ev.dataTransfer.setData("x", ev.currentTarget.dataset.x);
        ev.dataTransfer.setData("y", ev.currentTarget.dataset.y);
        ev.dataTransfer.setDragImage($(this).data('field').preview_img, offsetX, offsetY);
    },
    onDragOver: function (e) {
        var ev = e.originalEvent;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move"
        $(this).css({
            background: 'rgba(0,0,0,.5)'
        });
    },
    onDragLeave: function (e) {
        // brute force un-styling on drag leave
        $(this).removeAttr('style');
    },
    onDrop: function (e) {
        var ev = e.originalEvent;

        var field_id = parseInt(ev.dataTransfer.getData('text/plain'))
        var display_item = OSD.data.display_items[field_id];
        var position = $(this).removeAttr('style').data('position');
        var cursor = position;
        var cursorX = cursor % FONT.constants.SIZES.LINE;

        if (display_item.preview.constructor === Array) {
            console.log('Initial Drop Position: ' + position);
            var x = parseInt(ev.dataTransfer.getData('x'))
            var y = parseInt(ev.dataTransfer.getData('y'))
            console.log('XY Co-ords:' + x + '-' + y);
            position -= x;
            position -= (y * FONT.constants.SIZES.LINE)
            console.log('Calculated Position: ' + position);
        }

        if (!display_item.ignoreSize) {
            if (display_item.preview.constructor !== Array) {
                // Standard preview, string type
                var overflows_line = FONT.constants.SIZES.LINE - ((position % FONT.constants.SIZES.LINE) + display_item.preview.length);
                if (overflows_line < 0) {
                    position += overflows_line;
                }
            } else {
                // Advanced preview, array type
                var arrayElements = display_item.preview;
                var limits = OSD.searchLimitsElement(arrayElements);
                var selectedPositionX = position % FONT.constants.SIZES.LINE;
                var selectedPositionY = Math.trunc(position / FONT.constants.SIZES.LINE);
                if (arrayElements[0].constructor === String) {
                    if (position < 0 ) {
                        return;
                    }
                    if (selectedPositionX > cursorX) { // TRUE -> Detected wrap around
                        position += FONT.constants.SIZES.LINE - selectedPositionX;
                        selectedPositionY++;
                    } else if (selectedPositionX + limits.maxX > FONT.constants.SIZES.LINE) { // TRUE -> right border of the element went beyond left edge of screen.
                        position -= selectedPositionX + limits.maxX - FONT.constants.SIZES.LINE;
                    }
                    if (selectedPositionY < 0 ) {
                        position += Math.abs(selectedPositionY) * FONT.constants.SIZES.LINE;
                    } else if ((selectedPositionY + limits.maxY ) > OSD.data.display_size.y) {
                        position -= (selectedPositionY + limits.maxY  - OSD.data.display_size.y) * FONT.constants.SIZES.LINE;
                    }

                } else {
                    if ((limits.minX < 0) && ((selectedPositionX + limits.minX) < 0)) {
                        position += Math.abs(selectedPositionX + limits.minX);
                    } else if ((limits.maxX > 0) && ((selectedPositionX + limits.maxX) >= FONT.constants.SIZES.LINE)) {
                        position -= (selectedPositionX + limits.maxX + 1) - FONT.constants.SIZES.LINE;
                    }
                    if ((limits.minY < 0) && ((selectedPositionY + limits.minY) < 0)) {
                        position += Math.abs(selectedPositionY + limits.minY) * FONT.constants.SIZES.LINE;
                    } else if ((limits.maxY > 0) && ((selectedPositionY + limits.maxY) >= OSD.data.display_size.y)) {
                        position -= (selectedPositionY + limits.maxY - OSD.data.display_size.y + 1) * FONT.constants.SIZES.LINE;
                    }
                }
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
            // unsigned now
        } else {
            if (position > OSD.data.display_size.total / 2) {
                position = position - OSD.data.display_size.total;
            }
        }
        $('input.' + field_id + '.position').val(position).change();
    },
};


TABS.osd = {
    analyticsChanges: {},
};

TABS.osd.initialize = function (callback) {
    if (GUI.active_tab != 'osd') {
        GUI.active_tab = 'osd';
    }

    $('#content').load("./tabs/osd.html", function () {
        // Prepare symbols depending on the version
        SYM.loadSymbols();
        OSD.loadDisplayFields();

        // Generate font type select element
        var fontPresetsElement = $('.fontpresets');
        OSD.constants.FONT_TYPES.forEach(function (e, i) {
            var option = $('<option>', {
                "data-font-file": e.file,
                value: e.file,
                text: e.name
            });
            fontPresetsElement.append($(option));
        });

        var fontbuttons = $('.fontpresets_wrapper');
        fontbuttons.append($('<button>', { class: "load_font_file", i18n: "osdSetupOpenFont" }));

        // must invoke before i18n.localizePage() since it adds translation keys for expected logo size
        LogoManager.init(FONT, SYM.LOGO);

        // translate to user-selected language
        i18n.localizePage();

        if ($(window).width() < 390) {
            const previewZoom = ($(window).width() - 30) / 360;
            $('.display-layout .preview').css('zoom', previewZoom);
        }


        // Open modal window
        OSD.GUI.fontManager = new jBox('Modal', {
            width: 750,
            height: 455,
            closeButton: 'title',
            animation: false,
            attach: $('#fontmanager'),
            title: 'OSD Font Manager',
            content: $('#fontmanagercontent'),
        });

        $('.elements-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpElements'));
        $('.videomode-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpVideoMode'));
        $('.units-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpUnits'));
        $('.timers-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpTimers'));
        $('.alarms-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpAlarms'));
        $('.stats-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpStats'));
        $('.warnings-container div.cf_tip').attr('title', i18n.getMessage('osdSectionHelpWarnings'));

        function titleizeField(field) {
            let finalFieldName = null;
            if (field.text) {
                if (Array.isArray(field.text) && i18n.existsMessage(field.text[0])) {
                    finalFieldName = i18n.getMessage(field.text[0], field.text.slice(1));
                } else {
                    finalFieldName = i18n.getMessage(field.text);
                }
            }
            return finalFieldName;
        }

        function insertOrdered(fieldList, field) {
            if (field.name == 'UNKNOWN') {
                fieldList.append(field);
            } else {
                let added = false;
                let currentLocale = i18n.getCurrentLocale().replace('_', '-');
                fieldList.children().each(function() {
                    if ($(this).text().localeCompare(field.text(), currentLocale, { sensitivity: 'base' }) > 0) {
                        $(this).before(field);
                        added = true;
                        return false;
                    }
                });
                if(!added) {
                    fieldList.append(field);
                }
            }
        }

        // 2 way binding... sorta
        function updateOsdView() {
            // ask for the OSD config data
            MSP.promise(MSPCodes.MSP_OSD_CONFIG)
                .then(function (info) {

                    OSD.chooseFields();

                    OSD.msp.decode(info);

                    if (OSD.data.state.haveMax7456FontDeviceConfigured && !OSD.data.state.isMax7456FontDeviceDetected) {
                        $('.noOsdChipDetect').show();
                    }

                    if (OSD.data.state.haveSomeOsd == 0) {
                        $('.unsupported').fadeIn();
                        return;
                    }
                    $('.supported').fadeIn();

                    // video mode
                    var $videoTypes = $('.video-types').empty();
                    for (var i = 0; i < OSD.constants.VIDEO_TYPES.length; i++) {
                        var type = OSD.constants.VIDEO_TYPES[i];
                        var $checkbox = $('<label/>').append($('<input name="video_system" type="radio"/>' + i18n.getMessage('osdSetupVideoFormatOption' + inflection.camelize(type.toLowerCase())) + '</label>')
                            .prop('checked', i === OSD.data.video_system)
                            .data('type', type)
                            .data('type', i)
                        );
                        $videoTypes.append($checkbox);
                    }
                    $videoTypes.find(':radio').click(function (e) {
                        OSD.data.video_system = $(this).data('type');
                        MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                            .then(function () {
                                updateOsdView();
                            });
                    });

                    if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                        // units
                        $('.units-container').show();
                        var $unitMode = $('.units').empty();
                        for (var i = 0; i < OSD.constants.UNIT_TYPES.length; i++) {
                            var type = OSD.constants.UNIT_TYPES[i];
                            var $checkbox = $('<label/>').append($('<input name="unit_mode" type="radio"/>' + i18n.getMessage('osdSetupUnitsOption' + inflection.camelize(type.toLowerCase())) + '</label>')
                                .prop('checked', i === OSD.data.unit_mode)
                                .data('type', type)
                                .data('type', i)
                            );
                            $unitMode.append($checkbox);
                        }
                        $unitMode.find(':radio').click(function (e) {
                            OSD.data.unit_mode = $(this).data('type');
                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                                .then(function () {
                                    updateOsdView();
                                });
                        });
                        // alarms
                        $('.alarms-container').show();
                        var $alarms = $('.alarms').empty();
                        for (let k in OSD.data.alarms) {
                            var alarm = OSD.data.alarms[k];
                            var alarmInput = $('<input name="alarm" type="number" id="' + k + '"/>' + alarm.display_name + '</label>');
                            alarmInput.val(alarm.value);
                            alarmInput.focusout(function (e) {
                                OSD.data.alarms[$(this)[0].id].value = $(this)[0].value;
                                MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                                    .then(function () {
                                        updateOsdView();
                                    });
                            });
                            var $input = $('<label/>').append(alarmInput);
                            $alarms.append($input);
                        }

                        if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                            // Timers
                            $('.timers-container').show();
                            var $timers = $('#timer-fields').empty();
                            for (let tim of OSD.data.timers) {
                                var $timerConfig = $('<div class="switchable-field field-' + tim.index + '"></div>');
                                var timerTable = $('<table />');
                                $timerConfig.append(timerTable);
                                var timerTableRow = $('<tr />');
                                timerTable.append(timerTableRow);

                                // Timer number
                                timerTableRow.append('<td>' + (tim.index + 1) + '</td>');

                                // Source
                                var sourceTimerTableData = $('<td class="osd_tip"></td>');
                                sourceTimerTableData.attr('title', i18n.getMessage('osdTimerSourceTooltip'));
                                sourceTimerTableData.append('<label for="timerSource_' + tim.index + '" class="char-label">' + i18n.getMessage('osdTimerSource') + '</label>');
                                var src = $('<select class="timer-option" id="timerSource_' + tim.index + '"></select>');
                                OSD.constants.TIMER_TYPES.forEach(function (e, i) {
                                    src.append('<option value="' + i + '">' + i18n.getMessage('osdTimerSourceOption' + inflection.camelize(e.toLowerCase())) + '</option>');
                                });
                                src[0].selectedIndex = tim.src;
                                src.blur(function (e) {
                                    var idx = $(this)[0].id.split("_")[1];
                                    OSD.data.timers[idx].src = $(this)[0].selectedIndex;
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[idx]))
                                        .then(function () {
                                            updateOsdView();
                                        });
                                });
                                sourceTimerTableData.append(src);
                                timerTableRow.append(sourceTimerTableData);

                                // Precision
                                timerTableRow = $('<tr />');
                                timerTable.append(timerTableRow);
                                var precisionTimerTableData = $('<td class="osd_tip"></td>');
                                precisionTimerTableData.attr('title', i18n.getMessage('osdTimerPrecisionTooltip'));
                                precisionTimerTableData.append('<label for="timerPrec_' + tim.index + '" class="char-label">' + i18n.getMessage('osdTimerPrecision') + '</label>');
                                var precision = $('<select class="timer-option osd_tip" id="timerPrec_' + tim.index + '"></select>');
                                OSD.constants.TIMER_PRECISION.forEach(function (e, i) {
                                    precision.append('<option value="' + i + '">' + i18n.getMessage('osdTimerPrecisionOption' + inflection.camelize(e.toLowerCase())) + '</option>');
                                });
                                precision[0].selectedIndex = tim.precision;
                                precision.blur(function (e) {
                                    var idx = $(this)[0].id.split("_")[1];
                                    OSD.data.timers[idx].precision = $(this)[0].selectedIndex;
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[idx]))
                                        .then(function () {
                                            updateOsdView();
                                        });
                                });
                                precisionTimerTableData.append(precision);
                                timerTableRow.append('<td></td>');
                                timerTableRow.append(precisionTimerTableData);

                                // Alarm
                                timerTableRow = $('<tr />');
                                timerTable.append(timerTableRow);
                                var alarmTimerTableData = $('<td class="osd_tip"></td>');
                                alarmTimerTableData.attr('title', i18n.getMessage('osdTimerAlarmTooltip'));
                                alarmTimerTableData.append('<label for="timerAlarm_' + tim.index + '" class="char-label">' + i18n.getMessage('osdTimerAlarm') + '</label>');
                                var alarm = $('<input class="timer-option osd_tip" name="alarm" type="number" min=0 id="timerAlarm_' + tim.index + '"/>');
                                alarm[0].value = tim.alarm;
                                alarm.blur(function (e) {
                                    var idx = $(this)[0].id.split("_")[1];
                                    OSD.data.timers[idx].alarm = $(this)[0].value;
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[idx]))
                                        .then(function () {
                                            updateOsdView();
                                        });
                                });
                                alarmTimerTableData.append(alarm);
                                timerTableRow.append('<td></td>');
                                timerTableRow.append(alarmTimerTableData);

                                $timers.append($timerConfig);
                            }

                            // Post flight statistics
                            $('.stats-container').show();
                            var $statsFields = $('#post-flight-stat-fields').empty();

                            for (let field of OSD.data.stat_items) {
                                if (!field.name) { continue; }

                                var $field = $('<div class="switchable-field field-' + field.index + '"></div>');
                                var desc = null;
                                if (field.desc && field.desc.length) {
                                    desc = i18n.getMessage(field.desc);
                                }
                                if (desc && desc.length) {
                                    $field[0].classList.add('osd_tip');
                                    $field.attr('title', desc);
                                }
                                $field.append(
                                    $('<input type="checkbox" name="' + field.name + '" class="togglesmall"></input>')
                                        .data('field', field)
                                        .attr('checked', field.enabled)
                                        .change(function (e) {
                                            var field = $(this).data('field');

                                            field.enabled = !field.enabled;

                                            if (self.analyticsChanges[`OSDStatistic${field.name}`] === undefined) {
                                                self.analyticsChanges[`OSDStatistic${field.name}`] = 0;
                                            }
                                            self.analyticsChanges[`OSDStatistic${field.name}`] += field.enabled ? 1 : -1;

                                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeStatistics(field))
                                                .then(function () {
                                                    updateOsdView();
                                                });
                                        })
                                );
                                $field.append('<label for="' + field.name + '" class="char-label">' + titleizeField(field) + '</label>');

                                // Insert in alphabetical order, with unknown fields at the end
                                $field.name = field.name;
                                insertOrdered($statsFields, $field);
                            }

                            // Warnings
                            $('.warnings-container').show();
                            var $warningFields = $('#warnings-fields').empty();

                            for (let field of OSD.data.warnings) {
                                if (!field.name) { continue; }

                                var $field = $('<div class="switchable-field field-' + field.index + '"></div>');
                                var desc = null;
                                if (field.desc && field.desc.length) {
                                    desc = i18n.getMessage(field.desc);
                                }
                                if (desc && desc.length) {
                                    $field[0].classList.add('osd_tip');
                                    $field.attr('title', desc);
                                }
                                $field.append(
                                    $('<input type="checkbox" name="' + field.name + '" class="togglesmall"></input>')
                                        .data('field', field)
                                        .attr('checked', field.enabled)
                                        .change(function (e) {
                                            var field = $(this).data('field');
                                            field.enabled = !field.enabled;

                                            if (self.analyticsChanges[`OSDWarning${field.name}`] === undefined) {
                                                self.analyticsChanges[`OSDWarning${field.name}`] = 0;
                                            }
                                            self.analyticsChanges[`OSDWarning${field.name}`] += field.enabled ? 1 : -1;

                                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                                                .then(function () {
                                                    updateOsdView();
                                                });
                                        })
                                );

                                let finalFieldName = titleizeField(field);
                                $field.append('<label for="' + field.name + '" class="char-label">' + finalFieldName + '</label>');

                                // Insert in alphabetical order, with unknown fields at the end
                                $field.name = field.name;
                                insertOrdered($warningFields, $field);

                            }
                        }
                    }

                    if (!OSD.data.state.haveMax7456Configured) {
                        $('.requires-max7456').hide();
                    }

                    if (!OSD.data.state.isMax7456FontDeviceDetected || !OSD.data.state.haveMax7456FontDeviceConfigured) {
                        $('.requires-max7456-font-device-detected').addClass('disabled');
                    }

                    if (!OSD.data.state.haveOsdFeature) {
                        $('.requires-osd-feature').hide();
                    }

                    let numberOfProfiles = OSD.getNumberOfProfiles();

                    // Header for the switches
                    let headerSwitches_e = $('.elements').find('.osd-profiles-header');
                    if (headerSwitches_e.children().length == 0) {
                        for (let profileNumber = 0; profileNumber < numberOfProfiles; profileNumber++) {
                            headerSwitches_e.append('<span class="profileOsdHeader">' + (profileNumber + 1) + '</span>');
                        }
                    }

                    // Populate the profiles selector preview and current active
                    let osdProfileSelector_e = $('.osdprofile-selector');
                    let osdProfileActive_e = $('.osdprofile-active');
                    if (osdProfileSelector_e.children().length == 0) {
                        for (let profileNumber = 0; profileNumber < numberOfProfiles; profileNumber++) {
                            let optionText = i18n.getMessage('osdSetupPreviewSelectProfileElement', {profileNumber : (profileNumber + 1)});
                            osdProfileSelector_e.append(new Option(optionText, profileNumber));
                            osdProfileActive_e.append(new Option(optionText, profileNumber));
                        }
                    }

                    // Select the current OSD profile
                    osdProfileActive_e.val(OSD.data.osd_profiles.selected);

                    // Populate the fonts selector preview
                    let osdFontSelector_e = $('.osdfont-selector');
                    let osdFontPresetsSelector_e = $('.fontpresets');
                    if (osdFontSelector_e.children().length == 0) {

                        // Custom font selected by the user
                        var option = $('<option>', {
                            text: i18n.getMessage("osdSetupFontPresetsSelectorCustomOption"),
                            value: -1,
                            "disabled": "disabled",
                            "style":"display: none;",
                        });
                        osdFontSelector_e.append($(option));

                        // Standard fonts
                        OSD.constants.FONT_TYPES.forEach(function (e, i) {
                            let optionText = i18n.getMessage('osdSetupPreviewSelectFontElement', {fontName : e.name});
                            osdFontSelector_e.append(new Option(optionText, e.file));
                        });

                        osdFontSelector_e.change(function() {
                            // Change the font selected in the Font Manager, in this way it is easier to flash if the user likes it
                            osdFontPresetsSelector_e.val(this.value).change();
                        });
                    }

                    // Select the same element than the Font Manager window
                    osdFontSelector_e.val(osdFontPresetsSelector_e.val() != null ? osdFontPresetsSelector_e.val() : -1);
                    // Hide custom if not used
                    $('.osdfont-selector option[value=-1]').toggle(osdFontSelector_e.val() == -1);

                    // display fields on/off and position
                    var $displayFields = $('#element-fields').empty();
                    var enabledCount = 0;
                    for (let field of OSD.data.display_items) {
                        // versioning related, if the field doesn't exist at the current flight controller version, just skip it
                        if (!field.name) { continue; }

                        if (field.isVisible[OSD.getCurrentPreviewProfile()]) { enabledCount++; }

                        var $field = $('<div class="switchable-field field-' + field.index + '"></div>');
                        var desc = null;
                        if (field.desc && field.desc.length) {
                            desc = i18n.getMessage(field.desc);
                        }
                        if (desc && desc.length) {
                            $field[0].classList.add('osd_tip');
                            $field.attr('title', desc);
                        }
                        for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                            $field.append(
                                    $('<input type="checkbox" name="' + field.name + '"></input>')
                                        .data('field', field)
                                        .data('osd_profile', osd_profile)
                                        .attr('checked', field.isVisible[osd_profile])
                                        .change(function (e) {
                                            var field = $(this).data('field');
                                            var profile = $(this).data('osd_profile');
                                            var $position = $(this).parent().find('.position.' + field.name);
                                            field.isVisible[profile] = !field.isVisible[profile];

                                            if (self.analyticsChanges[`OSDElement${field.name}`] === undefined) {
                                                self.analyticsChanges[`OSDElement${field.name}`] = 0;
                                            }
                                            self.analyticsChanges[`OSDElement${field.name}`] += field.isVisible[profile] ? 1 : -1;

                                            if (field.isVisible[OSD.getCurrentPreviewProfile()]) {
                                                $position.show();
                                            } else {
                                                $position.hide();
                                            }
                                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(field))
                                                .then(function () {
                                                    updateOsdView();
                                                });
                                        })
                                );
                        }

                        let finalFieldName = titleizeField(field);
                        $field.append('<label for="' + field.name + '" class="char-label">' + finalFieldName + '</label>');
                        if (field.positionable && field.isVisible[OSD.getCurrentPreviewProfile()]) {
                            $field.append(
                                $('<input type="number" class="' + field.index + ' position"></input>')
                                    .data('field', field)
                                    .val(field.position)
                                    .change($.debounce(250, function (e) {
                                        var field = $(this).data('field');
                                        var position = parseInt($(this).val());
                                        field.position = position;
                                        MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(field))
                                            .then(function () {
                                                updateOsdView();
                                            });
                                    }))
                            );
                        }

                        // Insert in alphabetical order, with unknown fields at the end
                        $field.name = field.name;
                        insertOrdered($displayFields, $field);

                    }

                    GUI.switchery();
                    // buffer the preview
                    OSD.data.preview = [];
                    OSD.data.display_size.total = OSD.data.display_size.x * OSD.data.display_size.y;
                    for (let field of OSD.data.display_items) {
                        // reset fields that somehow end up off the screen
                        if (field.position > OSD.data.display_size.total) {
                            field.position = 0;
                        }
                    }
                    // clear the buffer
                    for (var i = 0; i < OSD.data.display_size.total; i++) {
                        OSD.data.preview.push([null, ' '.charCodeAt(0), null, null]);
                    }

                    // draw all the displayed items and the drag and drop preview images
                    for (let field of OSD.data.display_items) {

                        if (!field.preview || !field.isVisible[OSD.getCurrentPreviewProfile()]) {
                            continue;
                        }

                        var selectedPosition = (field.position >= 0) ? field.position : field.position + OSD.data.display_size.total;

                        // create the preview image
                        field.preview_img = new Image();
                        var canvas = document.createElement('canvas');
                        var ctx = canvas.getContext("2d");

                        // Standard preview, type String
                        if (field.preview.constructor !== Array) {

                            // fill the screen buffer
                            for (var i = 0; i < field.preview.length; i++) {

                                // Add the character to the preview
                                var charCode = field.preview.charCodeAt(i);
                                OSD.drawByOrder(selectedPosition++, field, charCode, i, 1);

                                // Image used when "dragging" the element
                                if (field.positionable) {
                                    var img = new Image();
                                    img.src = FONT.draw(charCode);
                                    ctx.drawImage(img, i * 12, 0);
                                }
                            }
                        } else {
                            var arrayElements = field.preview;
                            for (var i = 0; i < arrayElements.length; i++) {
                                var element = arrayElements[i];
                                //Add string to the preview.
                                if (element.constructor === String) {
                                    for(var j = 0; j < element.length; j++) {
                                        var charCode = element.charCodeAt(j);
                                        OSD.drawByOrder(selectedPosition++, field, charCode, j, i);
                                        // Image used when "dragging" the element
                                        if (field.positionable) {
                                            var img = new Image();
                                            img.src = FONT.draw(charCode);
                                            ctx.drawImage(img, j * 12, i * 18);
                                        }
                                    }
                                    selectedPosition = selectedPosition - element.length + FONT.constants.SIZES.LINE;
                                } else {
                                    var limits = OSD.searchLimitsElement(arrayElements);
                                    var offsetX = 0;
                                    var offsetY = 0;
                                        if (limits.minX < 0) {
                                            offsetX = -limits.minX;
                                        }
                                        if (limits.minY < 0) {
                                            offsetY = -limits.minY;
                                        }
                                        // Add the character to the preview
                                        var charCode = element.sym;
                                        OSD.drawByOrder(selectedPosition + element.x + element.y * FONT.constants.SIZES.LINE, field, charCode, element.x, element.y);
                                        // Image used when "dragging" the element
                                        if (field.positionable) {
                                            var img = new Image();
                                            img.src = FONT.draw(charCode);
                                            ctx.drawImage(img, (element.x + offsetX) * 12, (element.y + offsetY) * 18);
                                        }
                                }
                            }

                        }
                        field.preview_img.src = canvas.toDataURL('image/png');
                        // Required for NW.js - Otherwise the <img /> will
                        //consume drag/drop events.
                        field.preview_img.style.pointerEvents = 'none';
                    }

                    // render
                    var $preview = $('.display-layout .preview').empty();
                    var $row = $('<div class="row"></div>');
                    for (var i = 0; i < OSD.data.display_size.total;) {
                        var charCode = OSD.data.preview[i];
                        if (typeof charCode === 'object') {
                            var field = OSD.data.preview[i][0];
                            var charCode = OSD.data.preview[i][1];
                            var x = OSD.data.preview[i][2];
                            var y = OSD.data.preview[i][3];
                        }
                        var $img = $('<div class="char" draggable><img src=' + FONT.draw(charCode) + '></img></div>')
                            .on('mouseenter', OSD.GUI.preview.onMouseEnter)
                            .on('mouseleave', OSD.GUI.preview.onMouseLeave)
                            .on('dragover', OSD.GUI.preview.onDragOver)
                            .on('dragleave', OSD.GUI.preview.onDragLeave)
                            .on('drop', OSD.GUI.preview.onDrop)
                            .data('field', field)
                            .data('position', i);
                        // Required for NW.js - Otherwise the <img /> will
                        // consume drag/drop events.
                        $img.find('img').css('pointer-events', 'none');
                        $img.attr('data-x', x).attr('data-y', y);
                        if (field && field.positionable) {
                            $img
                                .addClass('field-' + field.index)
                                .data('field', field)
                                .prop('draggable', true)
                                .on('dragstart', OSD.GUI.preview.onDragStart);
                        }
                        else {
                        }
                        $row.append($img);
                        if (++i % OSD.data.display_size.x == 0) {
                            $preview.append($row);
                            $row = $('<div class="row"></div>');
                        }
                    }

                    // Remove last tooltips
                    for (var tt of OSD.data.tooltips) {
                        tt.destroy();
                    }
                    OSD.data.tooltips = [];

                    // Generate tooltips for OSD elements
                    $('.osd_tip').each(function () {
                        OSD.data.tooltips.push($(this).jBox('Tooltip', {
                            delayOpen: 100,
                            delayClose: 100,
                            position: {
                                x: 'right',
                                y: 'center'
                            },
                            outside: 'x'
                        }));
                    });
                });
        };

        $('.osdprofile-selector').change(updateOsdView);
        $('.osdprofile-active').change(function() {
            OSD.data.osd_profiles.selected = parseInt($(this).val());
            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                .then(function () {
                    updateOsdView();
                });
        });

        $('a.save').click(function () {
            MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
            GUI.log(i18n.getMessage('osdSettingsSaved'));
            const oldText = $(this).html();
            $(this).html(i18n.getMessage('osdButtonSaved'));
            setTimeout(() => {
                $(this).html(oldText);
            }, 1500);

            Object.keys(self.analyticsChanges).forEach(function (change) {
                const value = self.analyticsChanges[change];
                if (value > 0) {
                    self.analyticsChanges[change] = 'On';
                } else if (value < 0) {
                    self.analyticsChanges[change] = 'Off';
                } else {
                    self.analyticsChanges[change] = undefined;
                }
            });

            analytics.sendChangeEvents(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, self.analyticsChanges);
            self.analyticsChanges = {};
        });

        // font preview window
        var fontPreviewElement = $('.font-preview');

        // init structs once, also clears current font
        FONT.initData();

        fontPresetsElement.change(function (e) {
            var $font = $('.fontpresets option:selected');
            var fontver = 1;
            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                fontver = 2;
            }
            $('.font-manager-version-info').text(i18n.getMessage('osdDescribeFontVersion' + fontver));
            $.get('./resources/osd/' + fontver + '/' + $font.data('font-file') + '.mcm', function (data) {
                FONT.parseMCMFontFile(data);
                FONT.preview(fontPreviewElement);
                LogoManager.drawPreview();
                updateOsdView();
                $('.fontpresets option[value=-1]').hide();
            });
        });
        // load the first font when we change tabs
        fontPresetsElement.change();


        $('button.load_font_file').click(function () {
            FONT.openFontFile().then(function () {
                FONT.preview(fontPreviewElement);
                LogoManager.drawPreview();
                updateOsdView();
                $('.font-manager-version-info').text(i18n.getMessage('osdDescribeFontVersionCUSTOM'));
                $('.fontpresets option[value=-1]').show();
                $('.fontpresets').val(-1);
            }).catch(error => console.error(error));
        });

        // font upload
        $('a.flash_font').click(function () {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                $('a.flash_font').addClass('disabled');
                $('.progressLabel').text(i18n.getMessage('osdSetupUploadingFont'));
                FONT.upload($('.progress').val(0)).then(function () {
                    $('.progressLabel').text(i18n.getMessage('osdSetupUploadingFontEnd', {length: FONT.data.characters.length}));
                });
            }
        });

        // replace logo
        $('a.replace_logo').click(() => {
            if (GUI.connect_lock) { // button disabled while flashing is in progress
                return;
            }
            LogoManager.openImage()
                .then(ctx => {
                    LogoManager.replaceLogoInFont(ctx);
                    LogoManager.drawPreview();
                    LogoManager.showUploadHint();
                })
                .catch(error => console.error(error));
        });

        $(document).on('click', 'span.progressLabel a.save_font', function () {
            chrome.fileSystem.chooseEntry({ type: 'saveFile', suggestedName: 'baseflight', accepts: [{ description: 'MCM files', extensions: ['mcm'] }] }, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to: ' + path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            var blob = new Blob([intel_hex], { type: 'text/plain' });

                            fileEntry.createWriter(function (writer) {
                                var truncated = false;

                                writer.onerror = function (e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function () {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            GUI.log(i18n.getMessage('osdWritePermissions'));
                        }
                    });
                });
            });
        });

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_font').click();
            }
        });

        self.analyticsChanges = {};

        MSP.promise(MSPCodes.MSP_RX_CONFIG)
            .finally(() => {
                GUI.content_ready(callback);
            });
    });
};

TABS.osd.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    if (OSD.GUI.fontManager) {
        OSD.GUI.fontManager.destroy();
    }

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};
