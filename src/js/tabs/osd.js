'use strict';

const FONT = {};
const SYM = {};
const OSD = {};

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
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
        SYM.AH_CENTER_LINE = 0x26;
        SYM.AH_CENTER = 0x7E;
        SYM.AH_CENTER_LINE_RIGHT = 0x27;
        SYM.SPEED = null;
        SYM.LINK_QUALITY = null;
    }
};

FONT.initData = function() {
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
        character_image_urls: [],
    };
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
        LINE: 30,
    },
    COLORS: {
        // black
        0: 'rgba(0, 0, 0, 1)',
        // also the value 3, could yield transparent according to
        // https://www.sparkfun.com/datasheets/BreakoutBoards/MAX7456.pdf
        1: 'rgba(255, 255, 255, 0)',
        // white
        2: 'rgba(255,255,255, 1)',
    },
};

FONT.pushChar = function(fontCharacterBytes, fontCharacterBits) {
    // Only push full characters onto the stack.
    if (fontCharacterBytes.length !== FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE) {
        return;
    }
    FONT.data.characters_bytes.push(fontCharacterBytes.slice(0));
    FONT.data.characters.push(fontCharacterBits.slice(0));
    FONT.draw(FONT.data.characters.length - 1);
};

/**
* Each line is composed of 8 asci 1 or 0, representing 1 bit each for a total of 1 byte per line
*/
FONT.parseMCMFontFile = function(dataFontFile) {
    const data = dataFontFile.trim().split("\n");
    // clear local data
    FONT.data.characters.length = 0;
    FONT.data.characters_bytes.length = 0;
    FONT.data.character_image_urls.length = 0;
    // reset logo image info when font data is changed
    LogoManager.resetImageInfo();
    // make sure the font file is valid
    if (data.shift().trim() !== 'MAX7456') {
        const msg = 'that font file doesnt have the MAX7456 header, giving up';
        console.debug(msg);
        Promise.reject(msg);
    }
    const characterBits = [];
    const characterBytes = [];
    // hexstring is for debugging
    FONT.data.hexstring = [];
    for (let i = 0; i < data.length; i++) {
        const line = data[i];
        // hexstring is for debugging
        FONT.data.hexstring.push(`0x${parseInt(line, 2).toString(16)}`);
        // every 64 bytes (line) is a char, we're counting chars though, which are 2 bits
        if (characterBits.length === FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE * (8 / 2)) {
            FONT.pushChar(characterBytes, characterBits);
            characterBits.length = 0;
            characterBytes.length = 0;
        }
        for (let y = 0; y < 8; y = y + 2) {
            const v = parseInt(line.slice(y, y + 2), 2);
            characterBits.push(v);
        }
        characterBytes.push(parseInt(line, 2));
    }
    // push the last char
    FONT.pushChar(characterBytes, characterBits);

    return FONT.data.characters;
};

FONT.openFontFile = function() {
    return new Promise(function(resolve) {
        chrome.fileSystem.chooseEntry({ type: 'openFile', accepts: [{ description: 'MCM files', extensions: ['mcm'] }] }, function(fileEntry) {
            if (checkChromeRuntimeError()) {
                return;
            }

            FONT.data.loaded_font_file = fileEntry.name;
            fileEntry.file(function(file) {
                const reader = new FileReader();
                reader.onloadend = function(e) {
                    if (e.total !== 0 && e.total === e.loaded) {
                        FONT.parseMCMFontFile(e.target.result);
                        resolve();
                    } else {
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
const drawCanvas = function(charAddress) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext("2d");

    const pixelSize = 1;
    const width = pixelSize * FONT.constants.SIZES.CHAR_WIDTH;
    const height = pixelSize * FONT.constants.SIZES.CHAR_HEIGHT;

    canvas.width = width;
    canvas.height = height;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!(charAddress in FONT.data.characters)) {
                console.log('charAddress', charAddress, ' is not in ', FONT.data.characters.length);
            }
            const v = FONT.data.characters[charAddress][(y * width) + x];
            ctx.fillStyle = FONT.constants.COLORS[v];
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    return canvas;
};

FONT.draw = function(charAddress) {
    let cached = FONT.data.character_image_urls[charAddress];
    if (!cached) {
        cached = FONT.data.character_image_urls[charAddress] = drawCanvas(charAddress).toDataURL('image/png');
    }
    return cached;
};

FONT.msp = {
    encode(charAddress) {
        return [charAddress].concat(FONT.data.characters_bytes[charAddress].slice(0, FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE));
    },
};

FONT.upload = function($progress) {
    return Promise.mapSeries(FONT.data.characters, function(data, i) {
        $progress.val((i / FONT.data.characters.length) * 100);
        return MSP.promise(MSPCodes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
    })
        .then(function() {

            console.log(`Uploaded all ${FONT.data.characters.length} characters`);
            GUI.log(i18n.getMessage('osdSetupUploadingFontEnd', {length: FONT.data.characters.length}));

            OSD.GUI.fontManager.close();

            return MSP.promise(MSPCodes.MSP_SET_REBOOT);
        });
};

FONT.preview = function($el) {
    $el.empty();
    for (let i = 0; i < SYM.LOGO; i++) {
        const url = FONT.data.character_image_urls[i];
        $el.append(`<img src="${url}" title="0x${i.toString(16)}"></img>`);
    }
};

FONT.symbol = function(hexVal) {
    return (hexVal === '' || hexVal === null)? '' : String.fromCharCode(hexVal);
};

OSD.getNumberOfProfiles = function() {
    return OSD.data.osd_profiles.number;
};

OSD.getCurrentPreviewProfile = function() {
    const osdprofileElement = $('.osdprofile-selector');
    if (osdprofileElement.length > 0) {
        return osdprofileElement.val();
    } else {
        return 0;
    }
};

// parsed fc output and output to fc, used by to OSD.msp.encode
OSD.initData = function() {
    OSD.data = {
        video_system: null,
        unit_mode: null,
        alarms: [],
        statItems: [],
        warnings: [],
        displayItems: [],
        timers: [],
        last_positions: {},
        preview: [],
        tooltips: [],
        osd_profiles: {},
    };
};
OSD.initData();

OSD.getVariantForPreview = function(osdData, elementName) {
    return osdData.displayItems.find(element => element.name === elementName).variant;
};

OSD.generateAltitudePreview = function(osdData) {
    const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FEET : SYM.METRE);
    const variantSelected = OSD.getVariantForPreview(osdData, 'ALTITUDE');
    return `${FONT.symbol(SYM.ALTITUDE)}399${variantSelected === 0? '.7' : ''}${unit}`;
};

OSD.generateBatteryUsagePreview = function(osdData) {
    const variantSelected = OSD.getVariantForPreview(osdData, 'MAIN_BATT_USAGE');

    let value;
    switch (variantSelected) {
        case 0:
            value = FONT.symbol(SYM.PB_START) + FONT.symbol(SYM.PB_FULL).repeat(9) + FONT.symbol(SYM.PB_END) + FONT.symbol(SYM.PB_EMPTY) + FONT.symbol(SYM.PB_CLOSE);
            break;

        case 1:
            value = FONT.symbol(SYM.PB_START) + FONT.symbol(SYM.PB_FULL).repeat(5) + FONT.symbol(SYM.PB_END) + FONT.symbol(SYM.PB_EMPTY).repeat(5) + FONT.symbol(SYM.PB_CLOSE);
            break;

        case 2:
            value = `${FONT.symbol(SYM.MAH)}67%`;
            break;

        case 3:
            value = `${FONT.symbol(SYM.MAH)}33%`;
            break;

    }
    return value;
};

OSD.generateGpsLatLongPreview = function(osdData, elementName) {

    const variantSelected = OSD.getVariantForPreview(osdData, elementName);

    let value;
    switch (variantSelected) {
        case 0:
            value = elementName === 'GPS_LON' ? `${FONT.symbol(SYM.GPS_LON)}-000.0000000` : `${FONT.symbol(SYM.GPS_LAT)}-00.0000000 `;
            break;

        case 1:
            value = elementName === 'GPS_LON' ? `${FONT.symbol(SYM.GPS_LON)}-000.0000` : `${FONT.symbol(SYM.GPS_LAT)}-00.0000 `;
            break;

        case 2:
            const degreesSymbol = FONT.symbol(SYM.STICK_OVERLAY_SPRITE_HIGH);
            value = elementName === 'GPS_LON' ? `${FONT.symbol(SYM.GPS_LON)}00${degreesSymbol}000'00.0"N` : `${FONT.symbol(SYM.GPS_LAT)}00${degreesSymbol}00'00.0"E `;
            break;

        case 3:
            value = `${FONT.symbol(SYM.GPS_SAT_L)}${FONT.symbol(SYM.GPS_SAT_R)}000000AA+BBB`;
            break;

    }
    return value;
};

OSD.generateTimerPreview = function(osdData, timerIndex) {
    let preview = '';
    switch (osdData.timers[timerIndex].src) {
        case 0:
        case 3:
            preview += FONT.symbol(SYM.ON_M);
            break;
        case 1:
        case 2:
            preview += FONT.symbol(SYM.FLY_M);
            break;
    }
    switch (osdData.timers[timerIndex].precision) {
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

OSD.generateTemperaturePreview = function(osdData, temperature) {
    let preview = FONT.symbol(SYM.TEMPERATURE);
    switch (osdData.unit_mode) {
        case 0:
            let temperatureConversion = temperature * (9.0 / 5.0);
            temperatureConversion += 32.0;
            preview += Math.floor(temperatureConversion) + FONT.symbol(SYM.TEMP_F);
            break;
        case 1:
        case 2:
            preview += temperature + FONT.symbol(SYM.TEMP_C);
            break;
    }
    return preview;
};

OSD.generateLQPreview = function() {
    const crsfIndex = FC.getSerialRxTypes().findIndex(name => name === 'CRSF');
    const isXF = crsfIndex === FC.RX_CONFIG.serialrx_provider;
    return FONT.symbol(SYM.LINK_QUALITY) + (isXF ? '2:100' : '8');
};

OSD.generateCraftName = function() {
    let preview = 'CRAFT_NAME';
    if (FC.CONFIG.name !== '') {
        preview = FC.CONFIG.name.toUpperCase();
    }
    return preview;
};

OSD.generateDisplayName = function() {
  let preview = 'DISPLAY_NAME';
  if (FC.CONFIG.displayName !== '') {
      preview = FC.CONFIG.displayName.toUpperCase();
  }
  return preview;
};

OSD.drawStickOverlayPreview = function() {
    function randomInt(count) {
        return Math.floor(Math.random() * Math.floor(count));
    }

    const STICK_OVERLAY_SPRITE = [
        SYM.STICK_OVERLAY_SPRITE_HIGH,
        SYM.STICK_OVERLAY_SPRITE_MID,
        SYM.STICK_OVERLAY_SPRITE_LOW,
    ];

    const OVERLAY_WIDTH = 7;
    const OVERLAY_HEIGHT = 5;

    const stickX = randomInt(OVERLAY_WIDTH);
    const stickY = randomInt(OVERLAY_HEIGHT);
    const stickSymbol = randomInt(3);

    // From 'osdDrawStickOverlayAxis' in 'src/main/io/osd.c'
    const stickOverlay = [];
    for (let x = 0; x < OVERLAY_WIDTH; x++) {
        for (let y = 0; y < OVERLAY_HEIGHT; y++) {

            let symbol = null;

            if (x === stickX && y === stickY) {
                symbol = STICK_OVERLAY_SPRITE[stickSymbol];
            } else if (x === (OVERLAY_WIDTH - 1) / 2 && y === (OVERLAY_HEIGHT - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_CENTER;
            } else if (x === (OVERLAY_WIDTH - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_VERTICAL;
            } else if (y === (OVERLAY_HEIGHT - 1) / 2) {
                symbol = SYM.STICK_OVERLAY_HORIZONTAL;
            }

            if (symbol !== null) {
                const element = {
                    x,
                    y,
                    sym: symbol,
                };
                stickOverlay.push(element);
            }
        }
    }
    return stickOverlay;
};

OSD.drawCameraFramePreview = function() {

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

OSD.formatPidsPreview = function(axis) {
    const pidDefaults = FC.getPidDefaults();
    const p = pidDefaults[axis * 5].toString().padStart(3);
    const i = pidDefaults[axis * 5 + 1].toString().padStart(3);
    const d = pidDefaults[axis * 5 + 2].toString().padStart(3);
    const f = pidDefaults[axis * 5 + 4].toString().padStart(3);
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        return `${p} ${i} ${d}`;
    } else {
        return `${p} ${i} ${d} ${f}`;
    }
};

OSD.loadDisplayFields = function() {

 // All display fields, from every version, do not remove elements, only add!
    OSD.ALL_DISPLAY_FIELDS = {
        MAIN_BATT_VOLTAGE: {
            name: 'MAIN_BATT_VOLTAGE',
            text: 'osdTextElementMainBattVoltage',
            desc: 'osdDescElementMainBattVoltage',
            defaultPosition: -29,
            draw_order: 20,
            positionable: true,
            preview: `${FONT.symbol(SYM.BATTERY)}16.8${FONT.symbol(SYM.VOLT)}`,
        },
        RSSI_VALUE: {
            name: 'RSSI_VALUE',
            text: 'osdTextElementRssiValue',
            desc: 'osdDescElementRssiValue',
            defaultPosition: -59,
            draw_order: 30,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}99`,
        },
        TIMER: {
            name: 'TIMER',
            text: 'osdTextElementTimer',
            desc: 'osdDescElementTimer',
            defaultPosition: -39,
            positionable: true,
            preview: `${FONT.symbol(SYM.ON_M)} 11:11`,
        },
        THROTTLE_POSITION: {
            name: 'THROTTLE_POSITION',
            text: 'osdTextElementThrottlePosition',
            desc: 'osdDescElementThrottlePosition',
            defaultPosition: -9,
            draw_order: 110,
            positionable: true,
            preview: `${FONT.symbol(SYM.THR)} 69`,
        },
        CPU_LOAD: {
            name: 'CPU_LOAD',
            text: 'osdTextElementCpuLoad',
            desc: 'osdDescElementCpuLoad',
            defaultPosition: 26,
            positionable: true,
            preview: '15',
        },
        VTX_CHANNEL: {
            name: 'VTX_CHANNEL',
            text: 'osdTextElementVtxChannel',
            desc: 'osdDescElementVtxChannel',
            defaultPosition: 1,
            draw_order: 120,
            positionable: true,
            preview: 'R:2:200:P',
        },
        VOLTAGE_WARNING: {
            name: 'VOLTAGE_WARNING',
            text: 'osdTextElementVoltageWarning',
            desc: 'osdDescElementVoltageWarning',
            defaultPosition: -80,
            positionable: true,
            preview: 'LOW VOLTAGE',
        },
        ARMED: {
            name: 'ARMED',
            text: 'osdTextElementArmed',
            desc: 'osdDescElementArmed',
            defaultPosition: -107,
            positionable: true,
            preview: 'ARMED',
        },
        DISARMED: {
            name: 'DISARMED',
            text: 'osdTextElementDisarmed',
            desc: 'osdDescElementDisarmed',
            defaultPosition: -109,
            draw_order: 280,
            positionable: true,
            preview: 'DISARMED',
        },
        CROSSHAIRS: {
            name: 'CROSSHAIRS',
            text: 'osdTextElementCrosshairs',
            desc: 'osdDescElementCrosshairs',
            defaultPosition() {
                let position = 193;
                if (OSD.constants.VIDEO_TYPES[OSD.data.video_system] !== 'NTSC') {
                    position += FONT.constants.SIZES.LINE;
                }
                return position;
            },
            draw_order: 40,
            positionable() {
                return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39) ? true : false;
            },
            preview() {
                return FONT.symbol(SYM.AH_CENTER_LINE) + FONT.symbol(SYM.AH_CENTER) + FONT.symbol(SYM.AH_CENTER_LINE_RIGHT);
            },
        },
        ARTIFICIAL_HORIZON: {
            name: 'ARTIFICIAL_HORIZON',
            text: 'osdTextElementArtificialHorizon',
            desc: 'osdDescElementArtificialHorizon',
            defaultPosition() {
                let position = 74;
                if (OSD.constants.VIDEO_TYPES[OSD.data.video_system] !== 'NTSC') {
                    position += FONT.constants.SIZES.LINE;
                }
                return position;
            },
            draw_order: 10,
            positionable() {
                return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39) ? true : false;
            },
            preview() {
                const artificialHorizon = [];

                for (let j = 1; j < 8; j++) {
                    for (let i = -4; i <= 4; i++) {

                        let element;

                        // Blank char to mark the size of the element
                        if (j !== 4) {
                            element = { x: i, y: j, sym: SYM.BLANK };

                            // Sample of horizon
                        } else {
                            element = { x: i, y: j, sym: SYM.AH_BAR9_0 + 4 };
                        }
                        artificialHorizon.push(element);
                    }
                }
                return artificialHorizon;
            },
        },
        HORIZON_SIDEBARS: {
            name: 'HORIZON_SIDEBARS',
            text: 'osdTextElementHorizonSidebars',
            desc: 'osdDescElementHorizonSidebars',
            defaultPosition() {
                let position = 194;
                if (OSD.constants.VIDEO_TYPES[OSD.data.video_system] !== 'NTSC') {
                    position += FONT.constants.SIZES.LINE;
                }
                return position;
            },
            draw_order: 50,
            positionable() {
                return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39) ? true : false;
            },
            preview() {

                const horizonSidebar = [];

                const hudwidth = OSD.constants.AHISIDEBARWIDTHPOSITION;
                const hudheight = OSD.constants.AHISIDEBARHEIGHTPOSITION;
                let element;
                for (let i = -hudheight; i <= hudheight; i++) {
                    element = { x: -hudwidth,
                                y: i,
                                sym: SYM.AH_DECORATION,
                              };
                    horizonSidebar.push(element);

                    element = { x: hudwidth, y: i, sym: SYM.AH_DECORATION };
                    horizonSidebar.push(element);
                }

                // AH level indicators
                element = {
                    x: -hudwidth + 1,
                    y: 0,
                    sym: SYM.AH_LEFT,
                };
                horizonSidebar.push(element);

                element = {
                    x: hudwidth - 1,
                    y: 0,
                    sym: SYM.AH_RIGHT,
                };
                horizonSidebar.push(element);

                return horizonSidebar;
            },
        },
        CURRENT_DRAW: {
            name: 'CURRENT_DRAW',
            text: 'osdTextElementCurrentDraw',
            desc: 'osdDescElementCurrentDraw',
            defaultPosition: -23,
            draw_order: 130,
            positionable: true,
            preview() {
                return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36) ? ` 42.00${FONT.symbol(SYM.AMP)}` : `${FONT.symbol(SYM.AMP)}42.0`;
            },
        },
        MAH_DRAWN: {
            name: 'MAH_DRAWN',
            text: 'osdTextElementMahDrawn',
            desc: 'osdDescElementMahDrawn',
            defaultPosition: -18,
            draw_order: 140,
            positionable: true,
            preview() {
                return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36) ? ` 690${FONT.symbol(SYM.MAH)}` : `${FONT.symbol(SYM.MAH)}690`;
            },
        },
        CRAFT_NAME: {
            name: 'CRAFT_NAME',
            text: 'osdTextElementCraftName',
            desc: 'osdDescElementCraftName',
            defaultPosition: -77,
            draw_order: 150,
            positionable: true,
            preview: OSD.generateCraftName,
        },
        ALTITUDE: {
            name: 'ALTITUDE',
            text: 'osdTextElementAltitude',
            desc: 'osdDescElementAltitude',
            defaultPosition: 62,
            draw_order: 160,
            positionable: true,
            variants: [
                'osdTextElementAltitudeVariant1Decimal',
                'osdTextElementAltitudeVariantNoDecimal',
            ],
            preview(osdData) {
                return OSD.generateAltitudePreview(osdData);
            },
        },
        ONTIME: {
            name: 'ONTIME',
            text: 'osdTextElementOnTime',
            desc: 'osdDescElementOnTime',
            defaultPosition: -1,
            positionable: true,
            preview: `${FONT.symbol(SYM.ON_M)}05:42`,
        },
        FLYTIME: {
            name: 'FLYTIME',
            text: 'osdTextElementFlyTime',
            desc: 'osdDescElementFlyTime',
            defaultPosition: -1,
            positionable: true,
            preview: `${FONT.symbol(SYM.FLY_M)}04:11`,
        },
        FLYMODE: {
            name: 'FLYMODE',
            text: 'osdTextElementFlyMode',
            desc: 'osdDescElementFlyMode',
            defaultPosition: -1,
            draw_order: 90,
            positionable: true,
            preview: 'ANGL',
        },
        GPS_SPEED: {
            name: 'GPS_SPEED',
            text: 'osdTextElementGPSSpeed',
            desc: 'osdDescElementGPSSpeed',
            defaultPosition: -1,
            draw_order: 810,
            positionable: true,
            preview(osdData) {
                const UNIT_METRIC = OSD.constants.UNIT_TYPES.indexOf("METRIC");
                const unit = FONT.symbol(osdData.unit_mode === UNIT_METRIC ? SYM.KPH : SYM.MPH);
                return `${FONT.symbol(SYM.SPEED)}40${unit}`;
            },
        },
        GPS_SATS: {
            name: 'GPS_SATS',
            text: 'osdTextElementGPSSats',
            desc: 'osdDescElementGPSSats',
            defaultPosition: -1,
            draw_order: 800,
            positionable: true,
            preview: `${FONT.symbol(SYM.GPS_SAT_L)}${FONT.symbol(SYM.GPS_SAT_R)}14`,
        },
        GPS_LON: {
            name: 'GPS_LON',
            text: 'osdTextElementGPSLon',
            desc: 'osdDescElementGPSLon',
            defaultPosition: -1,
            draw_order: 830,
            positionable: true,
            variants: [
                'osdTextElementGPSVariant7Decimals',
                'osdTextElementGPSVariant4Decimals',
                'osdTextElementGPSVariantDegMinSec',
                'osdTextElementGPSVariantOpenLocation',
            ],
            preview(osdData) {
                return OSD.generateGpsLatLongPreview(osdData, 'GPS_LON');
            },
        },
        GPS_LAT: {
            name: 'GPS_LAT',
            text: 'osdTextElementGPSLat',
            desc: 'osdDescElementGPSLat',
            defaultPosition: -1,
            draw_order: 820,
            positionable: true,
            variants: [
                'osdTextElementGPSVariant7Decimals',
                'osdTextElementGPSVariant4Decimals',
                'osdTextElementGPSVariantDegMinSec',
                'osdTextElementGPSVariantOpenLocation',
            ],
            preview(osdData) {
                return OSD.generateGpsLatLongPreview(osdData, 'GPS_LAT');
            },
        },
        DEBUG: {
            name: 'DEBUG',
            text: 'osdTextElementDebug',
            desc: 'osdDescElementDebug',
            defaultPosition: -1,
            draw_order: 240,
            positionable: true,
            preview: 'DBG     0     0     0     0',
        },
        PID_ROLL: {
            name: 'PID_ROLL',
            text: 'osdTextElementPIDRoll',
            desc: 'osdDescElementPIDRoll',
            defaultPosition: 0x800 | (10 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 170,
            positionable: true,
            preview: `ROL ${OSD.formatPidsPreview(0)}`,
        },
        PID_PITCH: {
            name: 'PID_PITCH',
            text: 'osdTextElementPIDPitch',
            desc: 'osdDescElementPIDPitch',
            defaultPosition: 0x800 | (11 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 180,
            positionable: true,
            preview: `PIT ${OSD.formatPidsPreview(1)}`,
        },
        PID_YAW: {
            name: 'PID_YAW',
            text: 'osdTextElementPIDYaw',
            desc: 'osdDescElementPIDYaw',
            defaultPosition: 0x800 | (12 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 190,
            positionable: true,
            preview: `YAW ${OSD.formatPidsPreview(2)}`,
        },
        POWER: {
            name: 'POWER',
            text: 'osdTextElementPower',
            desc: 'osdDescElementPower',
            defaultPosition: (15 << 5) | 2,
            draw_order: 200,
            positionable: true,
            preview() {
                return semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36) ? ' 142W' : '142W';
            },
        },
        PID_RATE_PROFILE: {
            name: 'PID_RATE_PROFILE',
            text: 'osdTextElementPIDRateProfile',
            desc: 'osdDescElementPIDRateProfile',
            defaultPosition: 0x800 | (13 << 5) | 2, // 0x0800 | (y << 5) | x
            draw_order: 210,
            positionable: true,
            preview: '1-2',
        },
        BATTERY_WARNING: {
            name: 'BATTERY_WARNING',
            text: 'osdTextElementBatteryWarning',
            desc: 'osdDescElementBatteryWarning',
            defaultPosition: -1,
            positionable: true,
            preview: 'LOW VOLTAGE',
        },
        AVG_CELL_VOLTAGE: {
            name: 'AVG_CELL_VOLTAGE',
            text: 'osdTextElementAvgCellVoltage',
            desc: 'osdDescElementAvgCellVoltage',
            defaultPosition: 12 << 5,
            draw_order: 230,
            positionable: true,
            preview: `${FONT.symbol(SYM.BATTERY)}3.98${FONT.symbol(SYM.VOLT)}`,
        },
        PITCH_ANGLE: {
            name: 'PITCH_ANGLE',
            text: 'osdTextElementPitchAngle',
            desc: 'osdDescElementPitchAngle',
            defaultPosition: -1,
            draw_order: 250,
            positionable: true,
            preview: `${FONT.symbol(SYM.PITCH)}-00.0`,
        },
        ROLL_ANGLE: {
            name: 'ROLL_ANGLE',
            text: 'osdTextElementRollAngle',
            desc: 'osdDescElementRollAngle',
            defaultPosition: -1,
            draw_order: 260,
            positionable: true,
            preview: `${FONT.symbol(SYM.ROLL)}-00.0`,
        },
        MAIN_BATT_USAGE: {
            name: 'MAIN_BATT_USAGE',
            text: 'osdTextElementMainBattUsage',
            desc: 'osdDescElementMainBattUsage',
            defaultPosition: -17,
            draw_order: 270,
            positionable: true,
            variants: [
                'osdTextElementMainBattUsageVariantGraphrRemain',
                'osdTextElementMainBattUsageVariantGraphUsage',
                'osdTextElementMainBattUsageVariantValueRemain',
                'osdTextElementMainBattUsageVariantValueUsage',
            ],
            preview(osdData) {
                return OSD.generateBatteryUsagePreview(osdData);
            },
        },
        ARMED_TIME: {
            name: 'ARMED_TIME',
            text: 'osdTextElementArmedTime',
            desc: 'osdDescElementArmedTime',
            defaultPosition: -1,
            positionable: true,
            preview: `${FONT.symbol(SYM.FLY_M)}02:07`,
        },
        HOME_DIR: {
            name: 'HOME_DIRECTION',
            text: 'osdTextElementHomeDirection',
            desc: 'osdDescElementHomeDirection',
            defaultPosition: -1,
            draw_order: 850,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_SOUTH + 2),
        },
        HOME_DIST: {
            name: 'HOME_DISTANCE',
            text: 'osdTextElementHomeDistance',
            desc: 'osdDescElementHomeDistance',
            defaultPosition: -1,
            draw_order: 840,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.HOMEFLAG)}432${unit}`;
            },
        },
        NUMERICAL_HEADING: {
            name: 'NUMERICAL_HEADING',
            text: 'osdTextElementNumericalHeading',
            desc: 'osdDescElementNumericalHeading',
            defaultPosition: -1,
            draw_order: 290,
            positionable: true,
            preview: `${FONT.symbol(SYM.ARROW_EAST)}90`,
        },
        NUMERICAL_VARIO: {
            name: 'NUMERICAL_VARIO',
            text: 'osdTextElementNumericalVario',
            desc: 'osdDescElementNumericalVario',
            defaultPosition: -1,
            draw_order: 300,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FTPS : SYM.MPS);
                return `${FONT.symbol(SYM.ARROW_SMALL_UP)}8.7${unit}`;
            },
        },
        COMPASS_BAR: {
            name: 'COMPASS_BAR',
            text: 'osdTextElementCompassBar',
            desc: 'osdDescElementCompassBar',
            defaultPosition: -1,
            draw_order: 310,
            positionable: true,
            preview() {
                return FONT.symbol(SYM.HEADING_W) + FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_DIVIDED_LINE) +
                    FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_N) + FONT.symbol(SYM.HEADING_LINE) +
                    FONT.symbol(SYM.HEADING_DIVIDED_LINE) + FONT.symbol(SYM.HEADING_LINE) + FONT.symbol(SYM.HEADING_E);
            },
        },
        WARNINGS: {
            name: 'WARNINGS',
            text: 'osdTextElementWarnings',
            desc: 'osdDescElementWarnings',
            defaultPosition: -1,
            draw_order: 220,
            positionable: true,
            preview: 'LOW VOLTAGE',
        },
        ESC_TEMPERATURE: {
            name: 'ESC_TEMPERATURE',
            text: 'osdTextElementEscTemperature',
            desc: 'osdDescElementEscTemperature',
            defaultPosition: -1,
            draw_order: 900,
            positionable: true,
            preview(osdData) {
                return `E${OSD.generateTemperaturePreview(osdData, 45)}`;
            },
        },
        ESC_RPM: {
            name: 'ESC_RPM',
            text: 'osdTextElementEscRpm',
            desc: 'osdDescElementEscRpm',
            defaultPosition: -1,
            draw_order: 1000,
            positionable: true,
            preview: [ "22600", "22600", "22600", "22600"],
        },
        REMAINING_TIME_ESTIMATE: {
            name: 'REMAINING_TIME_ESTIMATE',
            text: 'osdTextElementRemaningTimeEstimate',
            desc: 'osdDescElementRemaningTimeEstimate',
            defaultPosition: -1,
            draw_order: 80,
            positionable: true,
            preview: '01:13',
        },
        RTC_DATE_TIME: {
            name: 'RTC_DATE_TIME',
            text: 'osdTextElementRtcDateTime',
            desc: 'osdDescElementRtcDateTime',
            defaultPosition: -1,
            draw_order: 360,
            positionable: true,
            preview: '2017-11-11 16:20:00',
        },
        ADJUSTMENT_RANGE: {
            name: 'ADJUSTMENT_RANGE',
            text: 'osdTextElementAdjustmentRange',
            desc: 'osdDescElementAdjustmentRange',
            defaultPosition: -1,
            draw_order: 370,
            positionable: true,
            preview: 'PITCH/ROLL P: 42',
        },
        TIMER_1: {
            name: 'TIMER_1',
            text: 'osdTextElementTimer1',
            desc: 'osdDescElementTimer1',
            defaultPosition: -1,
            draw_order: 60,
            positionable: true,
            preview(osdData) {
                return OSD.generateTimerPreview(osdData, 0);
            },
        },
        TIMER_2: {
            name: 'TIMER_2',
            text: 'osdTextElementTimer2',
            desc: 'osdDescElementTimer2',
            defaultPosition: -1,
            draw_order: 70,
            positionable: true,
            preview(osdData) {
                return OSD.generateTimerPreview(osdData, 1);
            },
        },
        CORE_TEMPERATURE: {
            name: 'CORE_TEMPERATURE',
            text: 'osdTextElementCoreTemperature',
            desc: 'osdDescElementCoreTemperature',
            defaultPosition: -1,
            draw_order: 380,
            positionable: true,
            preview(osdData) {
                return `C${OSD.generateTemperaturePreview(osdData, 33)}`;
            },
        },
        ANTI_GRAVITY: {
            name: 'ANTI_GRAVITY',
            text: 'osdTextAntiGravity',
            desc: 'osdDescAntiGravity',
            defaultPosition: -1,
            draw_order: 320,
            positionable: true,
            preview: 'AG',
        },
        G_FORCE: {
            name: 'G_FORCE',
            text: 'osdTextGForce',
            desc: 'osdDescGForce',
            defaultPosition: -1,
            draw_order: 15,
            positionable: true,
            preview: '1.0G',
        },
        MOTOR_DIAG: {
            name: 'MOTOR_DIAGNOSTICS',
            text: 'osdTextElementMotorDiag',
            desc: 'osdDescElementMotorDiag',
            defaultPosition: -1,
            draw_order: 335,
            positionable: true,
            preview: FONT.symbol(0x84)
                + FONT.symbol(0x85)
                + FONT.symbol(0x84)
                + FONT.symbol(0x83),
        },
        LOG_STATUS: {
            name: 'LOG_STATUS',
            text: 'osdTextElementLogStatus',
            desc: 'osdDescElementLogStatus',
            defaultPosition: -1,
            draw_order: 330,
            positionable: true,
            preview: `${FONT.symbol(SYM.BBLOG)}16`,
        },
        FLIP_ARROW: {
            name: 'FLIP_ARROW',
            text: 'osdTextElementFlipArrow',
            desc: 'osdDescElementFlipArrow',
            defaultPosition: -1,
            draw_order: 340,
            positionable: true,
            preview: FONT.symbol(SYM.ARROW_EAST),
        },
        LINK_QUALITY: {
            name: 'LINK_QUALITY',
            text: 'osdTextElementLinkQuality',
            desc: 'osdDescElementLinkQuality',
            defaultPosition: -1,
            draw_order: 390,
            positionable: true,
            preview: OSD.generateLQPreview,
        },
        FLIGHT_DIST: {
            name: 'FLIGHT_DISTANCE',
            text: 'osdTextElementFlightDist',
            desc: 'osdDescElementFlightDist',
            defaultPosition: -1,
            draw_order: 860,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.FEET : SYM.METRE);
                return `${FONT.symbol(SYM.TOTAL_DIST)}653${unit}`;
            },
        },
        STICK_OVERLAY_LEFT: {
            name: 'STICK_OVERLAY_LEFT',
            text: 'osdTextElementStickOverlayLeft',
            desc: 'osdDescElementStickOverlayLeft',
            defaultPosition: -1,
            draw_order: 400,
            positionable: true,
            preview: OSD.drawStickOverlayPreview,
        },
        STICK_OVERLAY_RIGHT: {
            name: 'STICK_OVERLAY_RIGHT',
            text: 'osdTextElementStickOverlayRight',
            desc: 'osdDescElementStickOverlayRight',
            defaultPosition: -1,
            draw_order: 410,
            positionable: true,
            preview: OSD.drawStickOverlayPreview,
        },
        DISPLAY_NAME: {
            name: 'DISPLAY_NAME',
            text: 'osdTextElementDisplayName',
            desc: 'osdDescElementDisplayName',
            defaultPosition: -77,
            draw_order: 350,
            positionable: true,
            preview(osdData) {
                return OSD.generateDisplayName(osdData, 1);
            },
        },
        ESC_RPM_FREQ: {
            name: 'ESC_RPM_FREQ',
            text: 'osdTextElementEscRpmFreq',
            desc: 'osdDescElementEscRpmFreq',
            defaultPosition: -1,
            draw_order: 1010,
            positionable: true,
            preview: [ "22600", "22600", "22600", "22600"],
        },
        RATE_PROFILE_NAME: {
            name: 'RATE_PROFILE_NAME',
            text: 'osdTextElementRateProfileName',
            desc: 'osdDescElementRateProfileName',
            defaultPosition: -1,
            draw_order: 420,
            positionable: true,
            preview: 'RATE_1',
        },
        PID_PROFILE_NAME: {
            name: 'PID_PROFILE_NAME',
            text: 'osdTextElementPidProfileName',
            desc: 'osdDescElementPidProfileName',
            defaultPosition: -1,
            draw_order: 430,
            positionable: true,
            preview: 'PID_1',
        },
        OSD_PROFILE_NAME: {
            name: 'OSD_PROFILE_NAME',
            text: 'osdTextElementOsdProfileName',
            desc: 'osdDescElementOsdProfileName',
            defaultPosition: -1,
            draw_order: 440,
            positionable: true,
            preview: 'OSD_1',
        },
        RSSI_DBM_VALUE: {
            name: 'RSSI_DBM_VALUE',
            text: 'osdTextElementRssiDbmValue',
            desc: 'osdDescElementRssiDbmValue',
            defaultPosition: -1,
            draw_order: 395,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}-130`,
        },
        RC_CHANNELS: {
            name: 'OSD_RC_CHANNELS',
            text: 'osdTextElementRcChannels',
            desc: 'osdDescElementRcChannels',
            defaultPosition: -1,
            draw_order: 445,
            positionable: true,
            preview: [ "-1000", "  545", "  689", " 1000"],
        },
        CAMERA_FRAME: {
            name: 'OSD_CAMERA_FRAME',
            text: 'osdTextElementCameraFrame',
            desc: 'osdDescElementCameraFrame',
            defaultPosition: -1,
            draw_order: 450,
            positionable: true,
            preview: OSD.drawCameraFramePreview,
        },
        OSD_EFFICIENCY: {
            name: 'OSD_EFFICIENCY',
            text: 'osdTextElementEfficiency',
            desc: 'osdDescElementEfficiency',
            defaultPosition: -1,
            draw_order: 455,
            positionable: true,
            preview(osdData) {
                const unit = FONT.symbol(osdData.unit_mode === 0 ? SYM.MILES : SYM.KM);
                return `1234${FONT.symbol(SYM.MAH)}/${unit}`;
            },
        },
        TOTAL_FLIGHTS: {
            name: 'OSD_TOTAL_FLIGHTS',
            text: 'osdTextTotalFlights',
            desc: 'osdDescTotalFlights',
            defaultPosition: -1,
            draw_order: 460,
            positionable: true,
            preview: "#9876",
        },
        TOTAL_PACKS: {
            name: 'OSD_TOTAL_PACKS',
            text: 'osdTextTotalPacks',
            desc: 'osdDescTotalPacks',
            defaultPosition: -1,
            draw_order: 465,
            positionable: true,
            preview: "#123",
        },
        OSD_UP_DOWN_REFERENCE: {
            name: 'OSD_UP_DOWN_REFERENCE',
            text: 'osdTextElementUpDownReference',
            desc: 'osdDescUpDownReference',
            defaultPosition: 238,
            draw_order: 470,
            positionable: true,
            preview: 'U',
        },
        OSD_TX_UPLINK_POWER: {
            name: 'OSD_TX_UPLINK_POWER',
            text: 'osdTextElementTxUplinkPower',
            desc: 'osdDescTxUplinkPower',
            defaultPosition: -1,
            draw_order: 475,
            positionable: true,
            preview: `${FONT.symbol(SYM.RSSI)}250MW`,
        },
    };
};

OSD.constants = {
    VISIBLE: 0x0800,
    VARIANTS: 0xC000,
    VIDEO_TYPES: [
        'AUTO',
        'PAL',
        'NTSC',
    ],
    VIDEO_LINES: {
        PAL: 16,
        NTSC: 13,
    },
    VIDEO_BUFFER_CHARS: {
        PAL: 480,
        NTSC: 390,
    },
    UNIT_TYPES: [
        'IMPERIAL',
        'METRIC',
        'BRITISH',
    ],
    TIMER_PRECISION: [
        'SECOND',
        'HUNDREDTH',
        'TENTH',
    ],
    AHISIDEBARWIDTHPOSITION: 7,
    AHISIDEBARHEIGHTPOSITION: 3,

    UNKNOWN_DISPLAY_FIELD: {
        name: 'UNKNOWN',
        text: 'osdTextElementUnknown',
        desc: 'osdDescElementUnknown',
        defaultPosition: -1,
        positionable: true,
        preview: 'UNKNOWN ',
    },
    ALL_STATISTIC_FIELDS: {
        MAX_SPEED: {
            name: 'MAX_SPEED',
            text: 'osdTextStatMaxSpeed',
            desc: 'osdDescStatMaxSpeed',
        },
        MIN_BATTERY: {
            name: 'MIN_BATTERY',
            text: 'osdTextStatMinBattery',
            desc: 'osdDescStatMinBattery',
        },
        MIN_RSSI: {
            name: 'MIN_RSSI',
            text: 'osdTextStatMinRssi',
            desc: 'osdDescStatMinRssi',
        },
        MAX_CURRENT: {
            name: 'MAX_CURRENT',
            text: 'osdTextStatMaxCurrent',
            desc: 'osdDescStatMaxCurrent',
        },
        USED_MAH: {
            name: 'USED_MAH',
            text: 'osdTextStatUsedMah',
            desc: 'osdDescStatUsedMah',
        },
        MAX_ALTITUDE: {
            name: 'MAX_ALTITUDE',
            text: 'osdTextStatMaxAltitude',
            desc: 'osdDescStatMaxAltitude',
        },
        BLACKBOX: {
            name: 'BLACKBOX',
            text: 'osdTextStatBlackbox',
            desc: 'osdDescStatBlackbox',
        },
        END_BATTERY: {
            name: 'END_BATTERY',
            text: 'osdTextStatEndBattery',
            desc: 'osdDescStatEndBattery',
        },
        FLYTIME: {
            name: 'FLY_TIME',
            text: 'osdTextStatFlyTime',
            desc: 'osdDescStatFlyTime',
        },
        ARMEDTIME: {
            name: 'ARMED_TIME',
            text: 'osdTextStatArmedTime',
            desc: 'osdDescStatArmedTime',
        },
        MAX_DISTANCE: {
            name: 'MAX_DISTANCE',
            text: 'osdTextStatMaxDistance',
            desc: 'osdDescStatMaxDistance',
        },
        BLACKBOX_LOG_NUMBER: {
            name: 'BLACKBOX_LOG_NUMBER',
            text: 'osdTextStatBlackboxLogNumber',
            desc: 'osdDescStatBlackboxLogNumber',
        },
        TIMER_1: {
            name: 'TIMER_1',
            text: 'osdTextStatTimer1',
            desc: 'osdDescStatTimer1',
        },
        TIMER_2: {
            name: 'TIMER_2',
            text: 'osdTextStatTimer2',
            desc: 'osdDescStatTimer2',
        },
        RTC_DATE_TIME: {
            name: 'RTC_DATE_TIME',
            text: 'osdTextStatRtcDateTime',
            desc: 'osdDescStatRtcDateTime',
        },
        STAT_BATTERY: {
            name: 'BATTERY_VOLTAGE',
            text: 'osdTextStatBattery',
            desc: 'osdDescStatBattery',
        },
        MAX_G_FORCE: {
            name: 'MAX_G_FORCE',
            text: 'osdTextStatGForce',
            desc: 'osdDescStatGForce',
        },
        MAX_ESC_TEMP: {
            name: 'MAX_ESC_TEMP',
            text: 'osdTextStatEscTemperature',
            desc: 'osdDescStatEscTemperature',
        },
        MAX_ESC_RPM: {
            name: 'MAX_ESC_RPM',
            text: 'osdTextStatEscRpm',
            desc: 'osdDescStatEscRpm',
        },
        MIN_LINK_QUALITY: {
            name: 'MIN_LINK_QUALITY',
            text: 'osdTextStatMinLinkQuality',
            desc: 'osdDescStatMinLinkQuality',
        },
        FLIGHT_DISTANCE: {
            name: 'FLIGHT_DISTANCE',
            text: 'osdTextStatFlightDistance',
            desc: 'osdDescStatFlightDistance',
        },
        MAX_FFT: {
            name: 'MAX_FFT',
            text: 'osdTextStatMaxFFT',
            desc: 'osdDescStatMaxFFT',
        },
        STAT_TOTAL_FLIGHTS: {
            name: 'STAT_TOTAL_FLIGHTS',
            text: 'osdTextStatTotalFlights',
            desc: 'osdDescStatTotalFlights',
        },
        STAT_TOTAL_PACKS: {
            name: 'STAT_TOTAL_PACKS',
            text: 'osdTextStatTotalPacks',
            desc: 'osdDescStatTotalPacks',
        },
        STAT_TOTAL_FLIGHT_TIME: {
            name: 'STAT_TOTAL_FLIGHT_TIME',
            text: 'osdTextStatTotalFlightTime',
            desc: 'osdDescStatTotalFlightTime',
        },
        STAT_TOTAL_FLIGHT_DIST: {
            name: 'STAT_TOTAL_FLIGHT_DIST',
            text: 'osdTextStatTotalFlightDistance',
            desc: 'osdDescStatTotalFlightDistance',
        },
        MIN_RSSI_DBM: {
            name: 'MIN_RSSI_DBM',
            text: 'osdTextStatMinRssiDbm',
            desc: 'osdDescStatMinRssiDbm',
        },
    },
    ALL_WARNINGS: {
        ARMING_DISABLED: {
            name: 'ARMING_DISABLED',
            text: 'osdWarningTextArmingDisabled',
            desc: 'osdWarningArmingDisabled',
        },
        BATTERY_NOT_FULL: {
            name: 'BATTERY_NOT_FULL',
            text: 'osdWarningTextBatteryNotFull',
            desc: 'osdWarningBatteryNotFull',
        },
        BATTERY_WARNING: {
            name: 'BATTERY_WARNING',
            text: 'osdWarningTextBatteryWarning',
            desc: 'osdWarningBatteryWarning',
        },
        BATTERY_CRITICAL: {
            name: 'BATTERY_CRITICAL',
            text: 'osdWarningTextBatteryCritical',
            desc: 'osdWarningBatteryCritical',
        },
        VISUAL_BEEPER: {
            name: 'VISUAL_BEEPER',
            text: 'osdWarningTextVisualBeeper',
            desc: 'osdWarningVisualBeeper',
        },
        CRASH_FLIP_MODE: {
            name: 'CRASH_FLIP_MODE',
            text: 'osdWarningTextCrashFlipMode',
            desc: 'osdWarningCrashFlipMode',
        },
        ESC_FAIL: {
            name: 'ESC_FAIL',
            text: 'osdWarningTextEscFail',
            desc: 'osdWarningEscFail',
        },
        CORE_TEMPERATURE: {
            name: 'CORE_TEMPERATURE',
            text: 'osdWarningTextCoreTemperature',
            desc: 'osdWarningCoreTemperature',
        },
        RC_SMOOTHING_FAILURE: {
            name: 'RC_SMOOTHING_FAILURE',
            text: 'osdWarningTextRcSmoothingFailure',
            desc: 'osdWarningRcSmoothingFailure',
        },
        FAILSAFE: {
            name: 'FAILSAFE',
            text: 'osdWarningTextFailsafe',
            desc: 'osdWarningFailsafe',
        },
        LAUNCH_CONTROL: {
            name: 'LAUNCH_CONTROL',
            text: 'osdWarningTextLaunchControl',
            desc: 'osdWarningLaunchControl',
        },
        GPS_RESCUE_UNAVAILABLE: {
            name: 'GPS_RESCUE_UNAVAILABLE',
            text: 'osdWarningTextGpsRescueUnavailable',
            desc: 'osdWarningGpsRescueUnavailable',
        },
        GPS_RESCUE_DISABLED: {
            name: 'GPS_RESCUE_DISABLED',
            text: 'osdWarningTextGpsRescueDisabled',
            desc: 'osdWarningGpsRescueDisabled',
        },
        RSSI: {
            name: 'RSSI',
            text: 'osdWarningTextRSSI',
            desc: 'osdWarningRSSI',
        },
        LINK_QUALITY: {
            name: 'LINK_QUALITY',
            text: 'osdWarningTextLinkQuality',
            desc: 'osdWarningLinkQuality',
        },
        RSSI_DBM: {
            name: 'RSSI_DBM',
            text: 'osdWarningTextRssiDbm',
            desc: 'osdWarningRssiDbm',
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
    ],
};

OSD.searchLimitsElement = function(arrayElements) {
    // Search minimum and maximum
    const limits = {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
    };

    if (arrayElements.length === 0) {
        return limits;
    }

    if (arrayElements[0].constructor === String) {
        limits.maxY = arrayElements.length;
        limits.minY = 0;
        limits.minX = 0;
        arrayElements.forEach(function(valor) {
            limits.maxX = Math.max(valor.length, limits.maxX);
        });
    } else {
        arrayElements.forEach(function(valor) {
            limits.minX = Math.min(valor.x, limits.minX);
            limits.maxX = Math.max(valor.x, limits.maxX);
            limits.minY = Math.min(valor.y, limits.minY);
            limits.maxY = Math.max(valor.y, limits.maxY);
        });
    }

    return limits;
};

// Pick display fields by version, order matters, so these are going in an array... pry could iterate the example map instead
OSD.chooseFields = function() {
    let F = OSD.ALL_DISPLAY_FIELDS;
    // version 3.0.1
    if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
        OSD.constants.DISPLAY_FIELDS = [
            F.RSSI_VALUE,
            F.MAIN_BATT_VOLTAGE,
            F.CROSSHAIRS,
            F.ARTIFICIAL_HORIZON,
            F.HORIZON_SIDEBARS,
        ];

        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.ONTIME,
                F.FLYTIME,
            ]);
        } else {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.TIMER_1,
                F.TIMER_2,
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
            F.ALTITUDE,
        ]);
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_31)) {
            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                F.PID_ROLL,
                F.PID_PITCH,
                F.PID_YAW,
                F.POWER,
            ]);
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_32)) {
                OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                    F.PID_RATE_PROFILE,
                    semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36) ? F.WARNINGS : F.BATTERY_WARNING,
                    F.AVG_CELL_VOLTAGE,
                ]);
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_34)) {
                    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                        F.GPS_LON,
                        F.GPS_LAT,
                        F.DEBUG,
                    ]);
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_35)) {
                        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                            F.PITCH_ANGLE,
                            F.ROLL_ANGLE,
                        ]);
                        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                F.MAIN_BATT_USAGE,
                                F.DISARMED,
                                F.HOME_DIR,
                                F.HOME_DIST,
                                F.NUMERICAL_HEADING,
                                F.NUMERICAL_VARIO,
                                F.COMPASS_BAR,
                                F.ESC_TEMPERATURE,
                                F.ESC_RPM,
                            ]);
                            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
                                OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                    F.REMAINING_TIME_ESTIMATE,
                                    F.RTC_DATE_TIME,
                                    F.ADJUSTMENT_RANGE,
                                    F.CORE_TEMPERATURE,
                                ]);
                                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
                                    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                        F.ANTI_GRAVITY,
                                    ]);
                                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
                                        OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                            F.G_FORCE,
                                        ]);
                                        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                                            OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                                F.MOTOR_DIAG,
                                                F.LOG_STATUS,
                                                F.FLIP_ARROW,
                                                F.LINK_QUALITY,
                                                F.FLIGHT_DIST,
                                                F.STICK_OVERLAY_LEFT,
                                                F.STICK_OVERLAY_RIGHT,
                                                F.DISPLAY_NAME,
                                                F.ESC_RPM_FREQ,
                                            ]);
                                            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
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
                                                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                                                    OSD.constants.DISPLAY_FIELDS = OSD.constants.DISPLAY_FIELDS.concat([
                                                        F.TOTAL_FLIGHTS,
                                                        F.OSD_UP_DOWN_REFERENCE,
                                                        F.OSD_TX_UPLINK_POWER,
                                                        F.TOTAL_PACKS,
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
    } else {
        // version 3.0.0
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
            F.ALTITUDE,
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

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
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
            F.BLACKBOX_LOG_NUMBER,
        ];
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.RTC_DATE_TIME,
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
            F.BLACKBOX_LOG_NUMBER,
        ];
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.MAX_G_FORCE,
                F.MAX_ESC_TEMP,
                F.MAX_ESC_RPM,
                F.MIN_LINK_QUALITY,
                F.FLIGHT_DISTANCE,
                F.MAX_FFT,
            ]);
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.STAT_TOTAL_FLIGHTS,
                F.STAT_TOTAL_FLIGHT_TIME,
                F.STAT_TOTAL_FLIGHT_DIST,
                F.MIN_RSSI_DBM,
            ]);
        }
        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
            OSD.constants.STATISTIC_FIELDS = OSD.constants.STATISTIC_FIELDS.concat([
                F.STAT_TOTAL_PACKS,
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
        F.CRASH_FLIP_MODE,
    ];
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([
            F.ESC_FAIL,
            F.CORE_TEMPERATURE,
            F.RC_SMOOTHING_FAILURE,
        ]);
    }
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
        OSD.constants.WARNINGS = OSD.constants.WARNINGS.concat([
            F.FAILSAFE,
            F.LAUNCH_CONTROL,
            F.GPS_RESCUE_UNAVAILABLE,
            F.GPS_RESCUE_DISABLED,
        ]);
    }

    OSD.constants.TIMER_TYPES = [
        'ON_TIME',
        'TOTAL_ARMED_TIME',
        'LAST_ARMED_TIME',
    ];
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
        OSD.constants.TIMER_TYPES = OSD.constants.TIMER_TYPES.concat([
            'ON_ARM_TIME',
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

OSD.updateDisplaySize = function() {
    let videoType = OSD.constants.VIDEO_TYPES[OSD.data.video_system];
    if (videoType === 'AUTO') {
        videoType = 'PAL';
    }
    // compute the size
    OSD.data.displaySize = {
        x: FONT.constants.SIZES.LINE,
        y: OSD.constants.VIDEO_LINES[videoType],
        total: null,
    };
};

OSD.drawByOrder = function(selectedPosition, field, charCode, x, y) {

    // Check if there is other field at the same position
    if (OSD.data.preview[selectedPosition] !== undefined) {
        const oldField = OSD.data.preview[selectedPosition][0];
        if (oldField != null && oldField.draw_order !== undefined &&
            (field.draw_order === undefined || field.draw_order < oldField.draw_order)) {

            // Not overwrite old field
            return;
        }

        // Default action, overwrite old field
        OSD.data.preview[selectedPosition] = [field, charCode, x, y];
    }
};

OSD.msp = {
    /**
    * Note, unsigned 16 bit int for position ispacked:
    * 0: unused
    * v: visible flag
    * b: blink flag
    * y: y coordinate
    * x: x coordinate
    * p: profile
    * t: variant type
    * ttpp vbyy yyyx xxxx
    */
    helpers: {
        unpack: {
            position(bits, c) {
                const displayItem = {};

                const positionable = typeof (c.positionable) === 'function' ? c.positionable() : c.positionable;
                const defaultPosition = typeof (c.defaultPosition) === 'function' ? c.defaultPosition() : c.defaultPosition;

                displayItem.positionable = positionable;
                if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                    // size * y + x
                    displayItem.position = positionable ? FONT.constants.SIZES.LINE * ((bits >> 5) & 0x001F) + (bits & 0x001F) : defaultPosition;

                    displayItem.isVisible = [];
                    for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                        displayItem.isVisible[osd_profile] = (bits & (OSD.constants.VISIBLE << osd_profile)) !== 0;
                    }

                    displayItem.variant = (bits & OSD.constants.VARIANTS) >> 14;

                } else {
                    displayItem.position = (bits === -1) ? defaultPosition : bits;
                    displayItem.isVisible = [bits !== -1];
                }

                return displayItem;
            },
            timer(bits) {
                return {
                    src: bits & 0x0F,
                    precision: (bits >> 4) & 0x0F,
                    alarm: (bits >> 8) & 0xFF,
                };
            },
        },
        pack: {
            position(displayItem) {
                const isVisible = displayItem.isVisible;
                const position = displayItem.position;
                const variant = displayItem.variant;

                if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {

                    let packed_visible = 0;
                    for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                        packed_visible |= isVisible[osd_profile] ? OSD.constants.VISIBLE << osd_profile : 0;
                    }
                    const variantSelected = (variant << 14);

                    return packed_visible | variantSelected | (((position / FONT.constants.SIZES.LINE) & 0x001F) << 5) | (position % FONT.constants.SIZES.LINE);
                } else {
                    const realPosition = position === -1 ? 0 : position;
                    return isVisible[0] ? realPosition : -1;
                }
            },
            timer(timer) {
                return (timer.src & 0x0F) | ((timer.precision & 0x0F) << 4) | ((timer.alarm & 0xFF) << 8);
            },
        },
    },
    encodeOther() {
        const result = [-1, OSD.data.video_system];
        if (OSD.data.state.haveOsdFeature && semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
            result.push8(OSD.data.unit_mode);
            // watch out, order matters! match the firmware
            result.push8(OSD.data.alarms.rssi.value);
            result.push16(OSD.data.alarms.cap.value);
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                result.push16(OSD.data.alarms.time.value);
            } else {
                // This value is unused by the firmware with configurable timers
                result.push16(0);
            }
            result.push16(OSD.data.alarms.alt.value);
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
                let warningFlags = 0;
                for (let i = 0; i < OSD.data.warnings.length; i++) {
                    if (OSD.data.warnings[i].enabled) {
                        warningFlags |= (1 << i);
                    }
                }

                if (CONFIGURATOR.virtualMode) {
                    OSD.virtualMode.warningFlags = warningFlags;
                }

                console.log(warningFlags);
                result.push16(warningFlags);
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
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
    encodeLayout(displayItem) {
        if (CONFIGURATOR.virtualMode) {
            OSD.virtualMode.itemPositions[displayItem.index] = this.helpers.pack.position(displayItem);
        }

        const buffer = [];
        buffer.push8(displayItem.index);
        buffer.push16(this.helpers.pack.position(displayItem));
        return buffer;
    },
    encodeStatistics(statItem) {
        if (CONFIGURATOR.virtualMode) {
            OSD.virtualMode.statisticsState[statItem.index] = statItem.enabled;
        }

        const buffer = [];
        buffer.push8(statItem.index);
        buffer.push16(statItem.enabled);
        buffer.push8(0);
        return buffer;
    },
    encodeTimer(timer) {
        if (CONFIGURATOR.virtualMode) {
            OSD.virtualMode.timerData[timer.index] = {};
            OSD.virtualMode.timerData[timer.index].src = timer.src;
            OSD.virtualMode.timerData[timer.index].precision = timer.precision;
            OSD.virtualMode.timerData[timer.index].alarm = timer.alarm;
        }

        const buffer = [-2, timer.index];
        buffer.push16(this.helpers.pack.timer(timer));
        return buffer;
    },
    processOsdElements(data, itemPositions){
        // Now we have the number of profiles, process the OSD elements
        for (const item of itemPositions) {
            const j = data.displayItems.length;
            let c;
            let suffix;
            let ignoreSize = false;
            if (data.displayItems.length < OSD.constants.DISPLAY_FIELDS.length) {
                c = OSD.constants.DISPLAY_FIELDS[j];
            } else {
                c = OSD.constants.UNKNOWN_DISPLAY_FIELD;
                suffix = (1 + data.displayItems.length - OSD.constants.DISPLAY_FIELDS.length).toString();
                ignoreSize = true;
            }
            data.displayItems.push($.extend({
                name: c.name,
                text: suffix ? [c.text, suffix] : c.text,
                desc: c.desc,
                index: j,
                draw_order: c.draw_order,
                preview: suffix ? c.preview + suffix : c.preview,
                variants: c.variants,
                ignoreSize,
            }, this.helpers.unpack.position(item, c)));
        }

        // Generate OSD element previews and positionable that are defined by a function
        for (const item of data.displayItems) {
            if (typeof (item.preview) === 'function') {
                item.preview = item.preview(data);
            }
        }
    },
    // Currently only parses MSP_MAX_OSD responses, add a switch on payload.code if more codes are handled
    decode(payload) {
        const view = payload.data;
        const d = OSD.data;

        let displayItemsCountActual = OSD.constants.DISPLAY_FIELDS.length;

        d.flags = view.readU8();

        if (d.flags > 0 && payload.length > 1) {
            d.video_system = view.readU8();
            if (semver.gte(FC.CONFIG.apiVersion, "1.21.0") && bit_check(d.flags, 0)) {
                d.unit_mode = view.readU8();
                d.alarms = {};
                d.alarms['rssi'] = { display_name: i18n.getMessage('osdTimerAlarmOptionRssi'), value: view.readU8() };
                d.alarms['cap'] = { display_name: i18n.getMessage('osdTimerAlarmOptionCapacity'), value: view.readU16() };
                if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                    d.alarms['time'] = { display_name: 'Minutes', value: view.readU16() };
                } else {
                    // This value was obsoleted by the introduction of configurable timers, and has been reused to encode the number of display elements sent in this command
                    view.readU8();
                    const tmp = view.readU8();
                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_37)) {
                        displayItemsCountActual = tmp;
                    }
                }

                d.alarms['alt'] = { display_name: i18n.getMessage('osdTimerAlarmOptionAltitude'), value: view.readU16() };
            }
        }

        d.state = {};
        d.state.haveSomeOsd = (d.flags !== 0);
        d.state.haveMax7456Configured = bit_check(d.flags, 4) || (d.flags === 1 && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_34));
        d.state.haveFrSkyOSDConfigured = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43) && bit_check(d.flags, 3);
        d.state.haveMax7456FontDeviceConfigured = d.state.haveMax7456Configured || d.state.haveFrSkyOSDConfigured;
        d.state.isMax7456FontDeviceDetected = bit_check(d.flags, 5) || (d.state.haveMax7456FontDeviceConfigured && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_43));
        d.state.haveOsdFeature = bit_check(d.flags, 0) || (d.flags === 1 && semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_34));
        d.state.isOsdSlave = bit_check(d.flags, 1) && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_34);

        d.displayItems = [];
        d.statItems = [];
        d.warnings = [];
        d.timers = [];

        d.parameters = {};
        d.parameters.overlayRadioMode = 0;
        d.parameters.cameraFrameWidth = 24;
        d.parameters.cameraFrameHeight = 11;

        // Read display element positions, the parsing is done later because we need the number of profiles
        const itemsPositionsRead = [];
        while (view.offset < view.byteLength && itemsPositionsRead.length < displayItemsCountActual) {
            let v = null;
            if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                v = view.readU16();
            } else {
                v = view.read16();
            }
            itemsPositionsRead.push(v);
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            // Parse statistics display enable
            const expectedStatsCount = view.readU8();
            if (expectedStatsCount !== OSD.constants.STATISTIC_FIELDS.length) {
                console.error(`Firmware is transmitting a different number of statistics (${expectedStatsCount}) to what the configurator ` +
                    `is expecting (${OSD.constants.STATISTIC_FIELDS.length})`);
            }

            for (let i = 0; i < expectedStatsCount; i++) {

                const v = view.readU8();

                // Known statistics field
                if (i < OSD.constants.STATISTIC_FIELDS.length) {

                    const c = OSD.constants.STATISTIC_FIELDS[i];
                    d.statItems.push({
                        name: c.name,
                        text: c.text,
                        desc: c.desc,
                        index: i,
                        enabled: v === 1,
                    });

                // Read all the data for any statistics we don't know about
                } else {
                    const statisticNumber = i - OSD.constants.STATISTIC_FIELDS.length + 1;
                    d.statItems.push({
                        name: 'UNKNOWN',
                        text: ['osdTextStatUnknown', statisticNumber],
                        desc: 'osdDescStatUnknown',
                        index: i,
                        enabled: v === 1,
                    });
                }
            }

            // Parse configurable timers
            let expectedTimersCount = view.readU8();
            while (view.offset < view.byteLength && expectedTimersCount > 0) {
                const v = view.readU16();
                const j = d.timers.length;
                d.timers.push($.extend({
                    index: j,
                }, this.helpers.unpack.timer(v)));
                expectedTimersCount--;
            }
            // Read all the data for any timers we don't know about
            while (expectedTimersCount > 0) {
                view.readU16();
                expectedTimersCount--;
            }

            // Parse enabled warnings
            let warningCount = OSD.constants.WARNINGS.length;
            let warningFlags = view.readU16();
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
                warningCount = view.readU8();
                // the flags were replaced with a 32bit version
                warningFlags = view.readU32();
            }
            for (let i = 0; i < warningCount; i++) {

                const enabled = (warningFlags & (1 << i)) !== 0;

                // Known warning field
                if (i < OSD.constants.WARNINGS.length) {
                    d.warnings.push($.extend(OSD.constants.WARNINGS[i], { enabled }));

                // Push Unknown Warning field
                } else {
                    const  warningNumber = i - OSD.constants.WARNINGS.length + 1;
                    d.warnings.push({
                        name: 'UNKNOWN',
                        text: ['osdWarningTextUnknown', warningNumber],
                        desc: 'osdWarningUnknown',
                        enabled,
                    });

                }
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41)) {
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

        this.processOsdElements(d, itemsPositionsRead);

        OSD.updateDisplaySize();
    },
    decodeVirtual() {
        const d = OSD.data;

        d.displayItems = [];
        d.statItems = [];
        d.warnings = [];
        d.timers = [];

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
            // Parse statistics display enable
            const expectedStatsCount = OSD.constants.STATISTIC_FIELDS.length;

            for (let i = 0; i < expectedStatsCount; i++) {
                const v = OSD.virtualMode.statisticsState[i] ? 1 : 0;

                // Known statistics field
                if (i < expectedStatsCount) {
                    const c = OSD.constants.STATISTIC_FIELDS[i];
                    d.statItems.push({
                        name: c.name,
                        text: c.text,
                        desc: c.desc,
                        index: i,
                        enabled: v === 1,
                    });

                // Read all the data for any statistics we don't know about
                } else {
                    const statisticNumber = i - expectedStatsCount + 1;
                    d.statItems.push({
                        name: 'UNKNOWN',
                        text: ['osdTextStatUnknown', statisticNumber],
                        desc: 'osdDescStatUnknown',
                        index: i,
                        enabled: v === 1,
                    });
                }
            }

            // Parse configurable timers
            const expectedTimersCount = 3;
            for (let i = 0; i < expectedTimersCount; i++) {
                d.timers.push($.extend({
                    index: i,
                }, OSD.virtualMode.timerData[i]));
            }

            // Parse enabled warnings
            const warningCount = OSD.constants.WARNINGS.length;
            const warningFlags = OSD.virtualMode.warningFlags;

            for (let i = 0; i < warningCount; i++) {
                const enabled = (warningFlags & (1 << i)) !== 0;

                // Known warning field
                if (i < warningCount) {
                    d.warnings.push($.extend(OSD.constants.WARNINGS[i], { enabled }));

                // Push Unknown Warning field
                } else {
                    const  warningNumber = i - warningCount + 1;
                    d.warnings.push({
                        name: 'UNKNOWN',
                        text: ['osdWarningTextUnknown', warningNumber],
                        desc: 'osdWarningUnknown',
                        enabled,
                    });
                }
            }
        }

        this.processOsdElements(OSD.data, OSD.virtualMode.itemPositions);

        OSD.updateDisplaySize();
    },
};

OSD.GUI = {};
OSD.GUI.preview = {
    onMouseEnter() {
        if (!$(this).data('field')) {
            return;
        }
        $(`#element-fields .field-${$(this).data('field').index}`).addClass('mouseover');
    },
    onMouseLeave() {
        if (!$(this).data('field')) {
            return;
        }
        $(`#element-fields .field-${$(this).data('field').index}`).removeClass('mouseover');
    },
    onDragStart(e) {
        const ev = e.originalEvent;
        const displayItem = OSD.data.displayItems[$(ev.target).data('field').index];
        let xPos = ev.currentTarget.dataset.x;
        let yPos = ev.currentTarget.dataset.y;
        let offsetX = 6;
        let offsetY = 9;

        if (displayItem.preview.constructor === Array) {
            const arrayElements = displayItem.preview;
            const limits = OSD.searchLimitsElement(arrayElements);
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
    onDragOver(e) {
        const ev = e.originalEvent;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        $(this).css({
            background: 'rgba(0,0,0,.5)',
        });
    },
    onDragLeave() {
        // brute force un-styling on drag leave
        $(this).removeAttr('style');
    },
    onDrop(e) {
        const ev = e.originalEvent;

        const fieldId = parseInt(ev.dataTransfer.getData('text/plain'));
        const displayItem = OSD.data.displayItems[fieldId];
        let position = $(this).removeAttr('style').data('position');
        const cursor = position;
        const cursorX = cursor % FONT.constants.SIZES.LINE;

        if (displayItem.preview.constructor === Array) {
            console.log(`Initial Drop Position: ${position}`);
            const x = parseInt(ev.dataTransfer.getData('x'));
            const y = parseInt(ev.dataTransfer.getData('y'));
            console.log(`XY Co-ords: ${x}-${y}`);
            position -= x;
            position -= (y * FONT.constants.SIZES.LINE);
            console.log(`Calculated Position: ${position}`);
        }

        if (!displayItem.ignoreSize) {
            if (displayItem.preview.constructor !== Array) {
                // Standard preview, string type
                const overflowsLine = FONT.constants.SIZES.LINE - ((position % FONT.constants.SIZES.LINE) + displayItem.preview.length);
                if (overflowsLine < 0) {
                    position += overflowsLine;
                }
            } else {
                // Advanced preview, array type
                const arrayElements = displayItem.preview;
                const limits = OSD.searchLimitsElement(arrayElements);
                const selectedPositionX = position % FONT.constants.SIZES.LINE;
                let selectedPositionY = Math.trunc(position / FONT.constants.SIZES.LINE);
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
                    } else if ((selectedPositionY + limits.maxY ) > OSD.data.displaySize.y) {
                        position -= (selectedPositionY + limits.maxY  - OSD.data.displaySize.y) * FONT.constants.SIZES.LINE;
                    }

                } else {
                    if ((limits.minX < 0) && ((selectedPositionX + limits.minX) < 0)) {
                        position += Math.abs(selectedPositionX + limits.minX);
                    } else if ((limits.maxX > 0) && ((selectedPositionX + limits.maxX) >= FONT.constants.SIZES.LINE)) {
                        position -= (selectedPositionX + limits.maxX + 1) - FONT.constants.SIZES.LINE;
                    }
                    if ((limits.minY < 0) && ((selectedPositionY + limits.minY) < 0)) {
                        position += Math.abs(selectedPositionY + limits.minY) * FONT.constants.SIZES.LINE;
                    } else if ((limits.maxY > 0) && ((selectedPositionY + limits.maxY) >= OSD.data.displaySize.y)) {
                        position -= (selectedPositionY + limits.maxY - OSD.data.displaySize.y + 1) * FONT.constants.SIZES.LINE;
                    }
                }
            }
        }

        if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
            // unsigned now
        } else {
            if (position > OSD.data.displaySize.total / 2) {
                position = position - OSD.data.displaySize.total;
            }
        }
        $(`input.${fieldId}.position`).val(position).change();
    },
};


TABS.osd = {
    analyticsChanges: {},
};

TABS.osd.initialize = function(callback) {
    if (GUI.active_tab !== 'osd') {
        GUI.active_tab = 'osd';
    }

    if (CONFIGURATOR.virtualMode) {
        VirtualFC.setupVirtualOSD();
    }

    $('#content').load("./tabs/osd.html", function() {
        // Prepare symbols depending on the version
        SYM.loadSymbols();
        OSD.loadDisplayFields();

        // Generate font type select element
        const fontPresetsElement = $('.fontpresets');
        OSD.constants.FONT_TYPES.forEach(function(e) {
            const option = $('<option>', {
                "data-font-file": e.file,
                value: e.file,
                text: e.name,
            });
            fontPresetsElement.append($(option));
        });

        const fontbuttons = $('.fontpresets_wrapper');
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
            if (field.name === 'UNKNOWN') {
                fieldList.append(field);
            } else {
                let added = false;
                const currentLocale = i18n.getCurrentLocale().replace('_', '-');
                fieldList.children().each(function() {
                    if ($(this).text().localeCompare(field.text(), currentLocale, { sensitivity: 'base' }) > 0) {
                        $(this).before(field);
                        added = true;
                        return false; // This breaks the for each
                    }
                    return true;
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
                .then(function(info) {

                    OSD.chooseFields();

                    if (CONFIGURATOR.virtualMode) {
                        OSD.msp.decodeVirtual();
                    } else {
                        OSD.msp.decode(info);
                    }

                    if (OSD.data.state.haveMax7456FontDeviceConfigured && !OSD.data.state.isMax7456FontDeviceDetected) {
                        $('.noOsdChipDetect').show();
                    }

                    if (OSD.data.state.haveSomeOsd === 0) {
                        $('.unsupported').fadeIn();
                        return;
                    }
                    $('.supported').fadeIn();

                    // video mode
                    const $videoTypes = $('.video-types').empty();
                    for (let i = 0; i < OSD.constants.VIDEO_TYPES.length; i++) {
                        const type = OSD.constants.VIDEO_TYPES[i];
                        const videoFormatOptionText = i18n.getMessage(`osdSetupVideoFormatOption${inflection.camelize(type.toLowerCase())}`);
                        const $checkbox = $('<label/>')
                            .append($(`<input name="video_system" type="radio"/>${videoFormatOptionText}</label>`)
                            .prop('checked', i === OSD.data.video_system)
                            .data('type', type)
                            .data('type', i)
                        );
                        $videoTypes.append($checkbox);
                    }
                    $videoTypes.find(':radio').click(function() {
                        OSD.data.video_system = $(this).data('type');
                        MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                            .then(function() {
                                updateOsdView();
                            });
                    });

                    if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                        // units
                        $('.units-container').show();
                        const $unitMode = $('.units').empty();
                        for (let i = 0; i < OSD.constants.UNIT_TYPES.length; i++) {
                            const type = OSD.constants.UNIT_TYPES[i];
                            const setupUnitOptionText = i18n.getMessage(`osdSetupUnitsOption${inflection.camelize(type.toLowerCase())}`);
                            const $checkbox = $('<label/>')
                                .append($(`<input name="unit_mode" type="radio"/>${setupUnitOptionText}</label>`)
                                .prop('checked', i === OSD.data.unit_mode)
                                .data('type', type)
                                .data('type', i)
                            );
                            $unitMode.append($checkbox);
                        }
                        $unitMode.find(':radio').click(function() {
                            OSD.data.unit_mode = $(this).data('type');
                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                                .then(function() {
                                    updateOsdView();
                                });
                        });
                        // alarms
                        $('.alarms-container').show();
                        const $alarms = $('.alarms').empty();
                        for (const k in OSD.data.alarms) {
                            const alarm = OSD.data.alarms[k];
                            const alarmInput = $(`<input name="alarm" type="number" id="${k}"/>${alarm.display_name}</label>`);
                            alarmInput.val(alarm.value);
                            alarmInput.focusout(function() {
                                OSD.data.alarms[$(this)[0].id].value = $(this)[0].value;
                                MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                                    .then(function() {
                                        updateOsdView();
                                    });
                            });
                            const $input = $('<label/>').append(alarmInput);
                            $alarms.append($input);
                        }

                        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_36)) {
                            // Timers
                            $('.timers-container').show();
                            const $timers = $('#timer-fields').empty();
                            for (const tim of OSD.data.timers) {
                                const $timerConfig = $(`<div class="switchable-field field-${tim.index}"></div>`);
                                const timerTable = $('<table />');
                                $timerConfig.append(timerTable);
                                let timerTableRow = $('<tr />');
                                timerTable.append(timerTableRow);

                                // Timer number
                                timerTableRow.append(`<td>${tim.index + 1}</td>`);

                                // Source
                                const sourceTimerTableData = $('<td class="osd_tip"></td>');
                                sourceTimerTableData.attr('title', i18n.getMessage('osdTimerSourceTooltip'));
                                sourceTimerTableData.append(`<label for="timerSource_${tim.index}" class="char-label">${i18n.getMessage('osdTimerSource')}</label>`);
                                const src = $(`<select class="timer-option" id="timerSource_${tim.index}"></select>`);
                                OSD.constants.TIMER_TYPES.forEach(function(e, i) {
                                    const timerSourceOptionText = i18n.getMessage(`osdTimerSourceOption${inflection.camelize(e.toLowerCase())}`);
                                    src.append(`<option value="${i}">${timerSourceOptionText}</option>`);
                                });
                                src[0].selectedIndex = tim.src;
                                src.blur(function() {
                                    const idx = $(this)[0].id.split("_")[1];
                                    OSD.data.timers[idx].src = $(this)[0].selectedIndex;
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[idx]))
                                        .then(function() {
                                            updateOsdView();
                                        });
                                });
                                sourceTimerTableData.append(src);
                                timerTableRow.append(sourceTimerTableData);

                                // Precision
                                timerTableRow = $('<tr />');
                                timerTable.append(timerTableRow);
                                const precisionTimerTableData = $('<td class="osd_tip"></td>');
                                precisionTimerTableData.attr('title', i18n.getMessage('osdTimerPrecisionTooltip'));
                                precisionTimerTableData.append(`<label for="timerPrec_${tim.index}" class="char-label">${i18n.getMessage('osdTimerPrecision')}</label>`);
                                const precision = $(`<select class="timer-option osd_tip" id="timerPrec_${tim.index}"></select>`);
                                OSD.constants.TIMER_PRECISION.forEach(function(e, i) {
                                    const timerPrecisionOptionText = i18n.getMessage(`osdTimerPrecisionOption${inflection.camelize(e.toLowerCase())}`);
                                    precision.append(`<option value="${i}">${timerPrecisionOptionText}</option>`);
                                });
                                precision[0].selectedIndex = tim.precision;
                                precision.blur(function() {
                                    const idx = $(this)[0].id.split("_")[1];
                                    OSD.data.timers[idx].precision = $(this)[0].selectedIndex;
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[idx]))
                                        .then(function() {
                                            updateOsdView();
                                        });
                                });
                                precisionTimerTableData.append(precision);
                                timerTableRow.append('<td></td>');
                                timerTableRow.append(precisionTimerTableData);

                                // Alarm
                                timerTableRow = $('<tr />');
                                timerTable.append(timerTableRow);
                                const alarmTimerTableData = $('<td class="osd_tip"></td>');
                                alarmTimerTableData.attr('title', i18n.getMessage('osdTimerAlarmTooltip'));
                                alarmTimerTableData.append(`<label for="timerAlarm_${tim.index}" class="char-label">${i18n.getMessage('osdTimerAlarm')}</label>`);
                                const alarm = $(`<input class="timer-option osd_tip" name="alarm" type="number" min=0 id="timerAlarm_${tim.index}"/>`);
                                alarm[0].value = tim.alarm;
                                alarm.blur(function() {
                                    const idx = $(this)[0].id.split("_")[1];
                                    OSD.data.timers[idx].alarm = $(this)[0].value;
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeTimer(OSD.data.timers[idx]))
                                        .then(function() {
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
                            const $statsFields = $('#post-flight-stat-fields').empty();

                            for (const field of OSD.data.statItems) {
                                if (!field.name) {
                                    continue;
                                }

                                const $field = $(`<div class="switchable-field field-${field.index}"></div>`);
                                let desc = null;
                                if (field.desc && field.desc.length) {
                                    desc = i18n.getMessage(field.desc);
                                }
                                if (desc && desc.length) {
                                    $field[0].classList.add('osd_tip');
                                    $field.attr('title', desc);
                                }
                                $field.append(
                                    $(`<input type="checkbox" name="${field.name}" class="togglesmall"></input>`)
                                        .data('field', field)
                                        .attr('checked', field.enabled)
                                        .change(function() {
                                            const fieldChanged = $(this).data('field');

                                            fieldChanged.enabled = !fieldChanged.enabled;

                                            if (self.analyticsChanges[`OSDStatistic${fieldChanged.name}`] === undefined) {
                                                self.analyticsChanges[`OSDStatistic${fieldChanged.name}`] = 0;
                                            }
                                            self.analyticsChanges[`OSDStatistic${fieldChanged.name}`] += fieldChanged.enabled ? 1 : -1;

                                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeStatistics(fieldChanged))
                                                .then(function() {
                                                    updateOsdView();
                                                });
                                        })
                                );
                                $field.append(`<label for="${field.name}" class="char-label">${titleizeField(field)}</label>`);

                                // Insert in alphabetical order, with unknown fields at the end
                                $field.name = field.name;
                                insertOrdered($statsFields, $field);
                            }

                            // Warnings
                            $('.warnings-container').show();
                            const $warningFields = $('#warnings-fields').empty();

                            for (const field of OSD.data.warnings) {
                                if (!field.name) {
                                    continue;
                                }

                                const $field = $(`<div class="switchable-field field-${field.index}"></div>`);
                                let desc = null;
                                if (field.desc && field.desc.length) {
                                    desc = i18n.getMessage(field.desc);
                                }
                                if (desc && desc.length) {
                                    $field[0].classList.add('osd_tip');
                                    $field.attr('title', desc);
                                }
                                $field.append(
                                    $(`<input type="checkbox" name="${field.name}" class="togglesmall"></input>`)
                                        .data('field', field)
                                        .attr('checked', field.enabled)
                                        .change(function() {
                                            const fieldChanged = $(this).data('field');
                                            fieldChanged.enabled = !fieldChanged.enabled;

                                            if (self.analyticsChanges[`OSDWarning${fieldChanged.name}`] === undefined) {
                                                self.analyticsChanges[`OSDWarning${fieldChanged.name}`] = 0;
                                            }
                                            self.analyticsChanges[`OSDWarning${fieldChanged.name}`] += fieldChanged.enabled ? 1 : -1;

                                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                                                .then(function() {
                                                    updateOsdView();
                                                });
                                        })
                                );

                                const finalFieldName = titleizeField(field);
                                $field.append(`<label for="${field.name}" class="char-label">${finalFieldName}</label>`);

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

                    const numberOfProfiles = OSD.getNumberOfProfiles();

                    // Header for the switches
                    const headerSwitchesElement = $('.elements').find('.osd-profiles-header');
                    if (headerSwitchesElement.children().length === 0) {
                        for (let profileNumber = 0; profileNumber < numberOfProfiles; profileNumber++) {
                            headerSwitchesElement.append(`<span class="profileOsdHeader">${profileNumber + 1}</span>`);
                        }
                    }

                    // Populate the profiles selector preview and current active
                    const osdProfileSelectorElement = $('.osdprofile-selector');
                    const osdProfileActiveElement = $('.osdprofile-active');
                    if (osdProfileSelectorElement.children().length === 0) {
                        for (let profileNumber = 0; profileNumber < numberOfProfiles; profileNumber++) {
                            const optionText = i18n.getMessage('osdSetupPreviewSelectProfileElement', {profileNumber : (profileNumber + 1)});
                            osdProfileSelectorElement.append(new Option(optionText, profileNumber));
                            osdProfileActiveElement.append(new Option(optionText, profileNumber));
                        }
                    }

                    // Select the current OSD profile
                    osdProfileActiveElement.val(OSD.data.osd_profiles.selected);

                    // Populate the fonts selector preview
                    const osdFontSelectorElement = $('.osdfont-selector');
                    const osdFontPresetsSelectorElement = $('.fontpresets');
                    if (osdFontSelectorElement.children().length === 0) {

                        // Custom font selected by the user
                        const option = $('<option>', {
                            text: i18n.getMessage("osdSetupFontPresetsSelectorCustomOption"),
                            value: -1,
                            "disabled": "disabled",
                            "style":"display: none;",
                        });
                        osdFontSelectorElement.append($(option));

                        // Standard fonts
                        OSD.constants.FONT_TYPES.forEach(function(e) {
                            const optionText = i18n.getMessage('osdSetupPreviewSelectFontElement', {fontName : e.name});
                            osdFontSelectorElement.append(new Option(optionText, e.file));
                        });

                        osdFontSelectorElement.change(function() {
                            // Change the font selected in the Font Manager, in this way it is easier to flash if the user likes it
                            osdFontPresetsSelectorElement.val(this.value).change();
                        });
                    }

                    // Select the same element than the Font Manager window
                    osdFontSelectorElement.val(osdFontPresetsSelectorElement.val() != null ? osdFontPresetsSelectorElement.val() : -1);
                    // Hide custom if not used
                    $('.osdfont-selector option[value=-1]').toggle(osdFontSelectorElement.val() === -1);

                    // display fields on/off and position
                    const $displayFields = $('#element-fields').empty();
                    let enabledCount = 0;
                    for (const field of OSD.data.displayItems) {
                        // versioning related, if the field doesn't exist at the current flight controller version, just skip it
                        if (!field.name) {
                            continue;
                        }

                        if (field.isVisible[OSD.getCurrentPreviewProfile()]) {
                            enabledCount++;
                        }

                        const $field = $(`<div class="switchable-field field-${field.index}"></div>`);
                        let desc = null;
                        if (field.desc && field.desc.length) {
                            desc = i18n.getMessage(field.desc);
                        }
                        if (desc && desc.length) {
                            $field[0].classList.add('osd_tip');
                            $field.attr('title', desc);
                        }
                        for (let osd_profile = 0; osd_profile < OSD.getNumberOfProfiles(); osd_profile++) {
                            $field.append(
                                    $(`<input type="checkbox" name="${field.name}"></input>`)
                                        .data('field', field)
                                        .data('osd_profile', osd_profile)
                                        .attr('checked', field.isVisible[osd_profile])
                                        .change(function() {
                                            const fieldChanged = $(this).data('field');
                                            const profile = $(this).data('osd_profile');
                                            const $position = $(this).parent().find(`.position.${fieldChanged.name}`);
                                            fieldChanged.isVisible[profile] = !fieldChanged.isVisible[profile];

                                            if (self.analyticsChanges[`OSDElement${fieldChanged.name}`] === undefined) {
                                                self.analyticsChanges[`OSDElement${fieldChanged.name}`] = 0;
                                            }
                                            self.analyticsChanges[`OSDElement${fieldChanged.name}`] += fieldChanged.isVisible[profile] ? 1 : -1;

                                            if (fieldChanged.isVisible[OSD.getCurrentPreviewProfile()]) {
                                                $position.show();
                                            } else {
                                                $position.hide();
                                            }
                                            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(fieldChanged))
                                                .then(function() {
                                                    updateOsdView();
                                                });
                                        })
                                );
                        }

                        const finalFieldName = titleizeField(field);
                        $field.append(`<label for="${field.name}" class="char-label">${finalFieldName}</label>`);


                        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44) && field.variants && field.variants.length > 0) {

                            const selectVariant = $('<select class="osd-variant" />')
                                .data('field', field)
                                .on("change", function() {
                                    const fieldChanged = $(this).data('field');
                                    fieldChanged.variant = parseInt($(this).val());
                                    MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(fieldChanged))
                                        .then(function() {
                                            updateOsdView();
                                        });
                                    });

                            for (const [variantIndex, variantText] of field.variants.entries()) {
                                selectVariant.append($('<option/>')
                                             .val(variantIndex)
                                             .html(i18n.getMessage(variantText)));
                            }

                            selectVariant.val(field.variant);

                            $field.append(selectVariant);
                        }

                        if (field.positionable && field.isVisible[OSD.getCurrentPreviewProfile()]) {
                            $field.append(
                                $(`<input type="number" class="${field.index} position"></input>`)
                                    .data('field', field)
                                    .val(field.position)
                                    .change($.debounce(250, function() {
                                        const fieldChanged = $(this).data('field');
                                        const position = parseInt($(this).val());
                                        fieldChanged.position = position;
                                        MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeLayout(fieldChanged))
                                            .then(function() {
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
                    OSD.data.displaySize.total = OSD.data.displaySize.x * OSD.data.displaySize.y;
                    for (const field of OSD.data.displayItems) {
                        // reset fields that somehow end up off the screen
                        if (field.position > OSD.data.displaySize.total) {
                            field.position = 0;
                        }
                    }
                    // clear the buffer
                    for (let i = 0; i < OSD.data.displaySize.total; i++) {
                        OSD.data.preview.push([null, ' '.charCodeAt(0), null, null]);
                    }

                    // draw all the displayed items and the drag and drop preview images
                    for (const field of OSD.data.displayItems) {

                        if (!field.preview || !field.isVisible[OSD.getCurrentPreviewProfile()]) {
                            continue;
                        }

                        let selectedPosition = (field.position >= 0) ? field.position : field.position + OSD.data.displaySize.total;

                        // create the preview image
                        field.preview_img = new Image();
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext("2d");

                        // Standard preview, type String
                        if (field.preview.constructor !== Array) {

                            // fill the screen buffer
                            for (let i = 0; i < field.preview.length; i++) {

                                // Add the character to the preview
                                const charCode = field.preview.charCodeAt(i);
                                OSD.drawByOrder(selectedPosition, field, charCode, i, 1);
                                selectedPosition++;

                                // Image used when "dragging" the element
                                if (field.positionable) {
                                    const img = new Image();
                                    img.src = FONT.draw(charCode);
                                    ctx.drawImage(img, i * 12, 0);
                                }
                            }
                        } else {
                            const arrayElements = field.preview;
                            for (let i = 0; i < arrayElements.length; i++) {
                                const element = arrayElements[i];
                                //Add string to the preview.
                                if (element.constructor === String) {
                                    for(let j = 0; j < element.length; j++) {
                                        const charCode = element.charCodeAt(j);
                                        OSD.drawByOrder(selectedPosition, field, charCode, j, i);
                                        selectedPosition++;
                                        // Image used when "dragging" the element
                                        if (field.positionable) {
                                            const img = new Image();
                                            img.src = FONT.draw(charCode);
                                            ctx.drawImage(img, j * 12, i * 18);
                                        }
                                    }
                                    selectedPosition = selectedPosition - element.length + FONT.constants.SIZES.LINE;
                                } else {
                                    const limits = OSD.searchLimitsElement(arrayElements);
                                    let offsetX = 0;
                                    let offsetY = 0;
                                        if (limits.minX < 0) {
                                            offsetX = -limits.minX;
                                        }
                                        if (limits.minY < 0) {
                                            offsetY = -limits.minY;
                                        }
                                        // Add the character to the preview
                                        const charCode = element.sym;
                                        OSD.drawByOrder(selectedPosition + element.x + element.y * FONT.constants.SIZES.LINE, field, charCode, element.x, element.y);
                                        // Image used when "dragging" the element
                                        if (field.positionable) {
                                            const img = new Image();
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
                    const $preview = $('.display-layout .preview').empty();
                    let $row = $('<div class="row"></div>');
                    for (let i = 0; i < OSD.data.displaySize.total;) {
                        let charCode = OSD.data.preview[i];
                        let field;
                        let x;
                        let y;
                        if (typeof charCode === 'object') {
                            field = OSD.data.preview[i][0];
                            charCode = OSD.data.preview[i][1];
                            x = OSD.data.preview[i][2];
                            y = OSD.data.preview[i][3];
                        }
                        const $img = $(`<div class="char" draggable><img src=${FONT.draw(charCode)}></img></div>`)
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
                                .addClass(`field-${field.index}`)
                                .data('field', field)
                                .prop('draggable', true)
                                .on('dragstart', OSD.GUI.preview.onDragStart);
                        }
                        $row.append($img);
                        i++;
                        if (i % OSD.data.displaySize.x === 0) {
                            $preview.append($row);
                            $row = $('<div class="row"></div>');
                        }
                    }

                    // Remove last tooltips
                    for (const tt of OSD.data.tooltips) {
                        tt.destroy();
                    }
                    OSD.data.tooltips = [];

                    // Generate tooltips for OSD elements
                    $('.osd_tip').each(function() {
                        OSD.data.tooltips.push($(this).jBox('Tooltip', {
                            delayOpen: 100,
                            delayClose: 100,
                            position: {
                                x: 'right',
                                y: 'center',
                            },
                            outside: 'x',
                        }));
                    });
                });
        }

        $('.osdprofile-selector').change(updateOsdView);
        $('.osdprofile-active').change(function() {
            OSD.data.osd_profiles.selected = parseInt($(this).val());
            MSP.promise(MSPCodes.MSP_SET_OSD_CONFIG, OSD.msp.encodeOther())
                .then(function() {
                    updateOsdView();
                });
        });

        $('a.save').click(function() {
            MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
            GUI.log(i18n.getMessage('osdSettingsSaved'));
            const oldText = $(this).html();
            $(this).html(i18n.getMessage('osdButtonSaved'));
            setTimeout(() => {
                $(this).html(oldText);
            }, 1500);

            Object.keys(self.analyticsChanges).forEach(function(change) {
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
        const fontPreviewElement = $('.font-preview');

        // init structs once, also clears current font
        FONT.initData();

        fontPresetsElement.change(function() {
            const $font = $('.fontpresets option:selected');
            let fontver = 1;
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_42)) {
                fontver = 2;
            }
            $('.font-manager-version-info').text(i18n.getMessage(`osdDescribeFontVersion${fontver}`));
            $.get(`./resources/osd/${fontver}/${$font.data('font-file')}.mcm`, function(data) {
                FONT.parseMCMFontFile(data);
                FONT.preview(fontPreviewElement);
                LogoManager.drawPreview();
                updateOsdView();
                $('.fontpresets option[value=-1]').hide();
            });
        });
        // load the first font when we change tabs
        fontPresetsElement.change();


        $('button.load_font_file').click(function() {
            FONT.openFontFile().then(function() {
                FONT.preview(fontPreviewElement);
                LogoManager.drawPreview();
                updateOsdView();
                $('.font-manager-version-info').text(i18n.getMessage('osdDescribeFontVersionCUSTOM'));
                $('.fontpresets option[value=-1]').show();
                $('.fontpresets').val(-1);
            }).catch(error => console.error(error));
        });

        // font upload
        $('a.flash_font').click(function() {
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                $('a.flash_font').addClass('disabled');
                $('.progressLabel').text(i18n.getMessage('osdSetupUploadingFont'));
                FONT.upload($('.progress').val(0)).then(function() {
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

        $(document).on('click', 'span.progressLabel a.save_font', function() {
            chrome.fileSystem.chooseEntry({ type: 'saveFile', suggestedName: 'baseflight', accepts: [{ description: 'MCM files', extensions: ['mcm'] }] }, function(fileEntry) {
                if (checkChromeRuntimeError()) {
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function(path) {
                    console.log(`Saving firmware to: ${path}`);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function(isWritable) {
                        if (isWritable) {
                            const blob = new Blob([intel_hex], { type: 'text/plain' });

                            fileEntry.createWriter(function(writer) {
                                let truncated = false;

                                writer.onerror = function(e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function() {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }
                                };

                                writer.write(blob);
                            }, function(e) {
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

        $(document).keypress(function(e) {
            if (e.which === 13) { // enter
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

TABS.osd.cleanup = function(callback) {
    PortHandler.flush_callbacks();

    if (OSD.GUI.fontManager) {
        OSD.GUI.fontManager.destroy();
    }

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) {
        callback();
    }
};
