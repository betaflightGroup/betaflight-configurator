'use strict';

TABS.cli = {
    lineDelayMs: 15,
    profileSwitchDelayMs: 100,
    outputHistory: "",
    cliBuffer: "",
    startProcessing: false,
    GUI: {
        snippetPreviewWindow: null,
        copyButton: null,
        windowWrapper: null,
    },
};

function removePromptHash(promptText) {
    return promptText.replace(/^# /, '');
}

function cliBufferCharsToDelete(command, buffer) {
    let commonChars = 0;
    for (let i = 0; i < buffer.length; i++) {
        if (command[i] === buffer[i]) {
            commonChars++;
        } else {
            break;
        }
    }

    return buffer.length - commonChars;
}

function commandWithBackSpaces(command, buffer, noOfCharsToDelete) {
    const backspace = String.fromCharCode(127);
    return backspace.repeat(noOfCharsToDelete) + command.substring(buffer.length - noOfCharsToDelete, command.length);
}

function getCliCommand(command, cliBuffer) {
    const buffer = removePromptHash(cliBuffer);
    const bufferRegex = new RegExp('^' + buffer, 'g');
    if (command.match(bufferRegex)) {
        return command.replace(bufferRegex, '');
    }

    const noOfCharsToDelete = cliBufferCharsToDelete(command, buffer);

    return commandWithBackSpaces(command, buffer, noOfCharsToDelete);
}

function copyToClipboard(text) {
    function onCopySuccessful() {

        analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CliCopyToClipboard', text.length);
        const button = TABS.cli.GUI.copyButton;
        const origText = button.text();
        const origWidth = button.css("width");
        button.text(i18n.getMessage("cliCopySuccessful"));
        button.css({
            width: origWidth,
            textAlign: "center",
        });
        setTimeout(() => {
            button.text(origText);
            button.css({
                width: "",
                textAlign: "",
            });
        }, 1500);
    }

    function onCopyFailed(ex) {
        console.warn(ex);
    }

    Clipboard.writeText(text, onCopySuccessful, onCopyFailed);
}

TABS.cli.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab !== 'cli') {
        GUI.active_tab = 'cli';
    }

    self.outputHistory = "";
    self.cliBuffer = "";
    self.startProcessing = false;

    const enterKeyCode = 13;

    function executeCommands(outString) {
        self.history.add(outString.trim());

        const outputArray = outString.split("\n");
        Promise.reduce(outputArray, function(delay, line, index) {
            return new Promise(function (resolve) {
                GUI.timeout_add('CLI_send_slowly', function () {
                    let processingDelay = self.lineDelayMs;
                    line = line.trim();
                    if (line.toLowerCase().startsWith('profile')) {
                        processingDelay = self.profileSwitchDelayMs;
                    }
                    const isLastCommand = outputArray.length === index + 1;
                    if (isLastCommand && self.cliBuffer) {
                        line = getCliCommand(line, self.cliBuffer);
                    }
                    self.sendLine(line, function () {
                        resolve(processingDelay);
                    });
                }, delay);
            });
        }, 0);
    }

    $('#content').load("./tabs/cli.html", function () {
        // translate to user-selected language
        i18n.localizePage();

        TABS.cli.adaptPhones();

        CONFIGURATOR.cliActive = true;

        self.GUI.copyButton = $('.tab-cli .copy');
        self.GUI.windowWrapper = $('.tab-cli .window .wrapper');

        const textarea = $('.tab-cli textarea[name="commands"]');

        CliAutoComplete.initialize(textarea, self.sendLine.bind(self), writeToOutput);
        $(CliAutoComplete).on('build:start', function() {
            textarea
                .val('')
                .attr('placeholder', i18n.getMessage('cliInputPlaceholderBuilding'))
                .prop('disabled', true);
        });
        $(CliAutoComplete).on('build:stop', function() {
            textarea
                .attr('placeholder', i18n.getMessage('cliInputPlaceholder'))
                .prop('disabled', false)
                .focus();
        });

        $('.tab-cli .save').click(function() {
            const prefix = 'cli';
            const suffix = 'txt';

            const filename = generateFilename(prefix, suffix);

            const accepts = [{
                description: suffix.toUpperCase() + ' files', extensions: [suffix],
            }];

            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: filename, accepts: accepts}, function(entry) {
                if (checkChromeRuntimeError()) {
                    return;
                }

                if (!entry) {
                    console.log('No file selected');
                    return;
                }

                entry.createWriter(function (writer) {
                    writer.onerror = function (){
                        console.error('Failed to write file');
                    };

                    writer.onwriteend = function () {
                        if (self.outputHistory.length > 0 && writer.length === 0) {
                            writer.write(new Blob([self.outputHistory], {type: 'text/plain'}));
                        } else {
                            analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CliSave', self.outputHistory.length);

                            console.log('write complete');
                        }
                    };

                    writer.truncate(0);
                }, function (){
                    console.error('Failed to get file writer');
                });
            });
        });

        $('.tab-cli .clear').click(function() {
            self.outputHistory = "";
            self.GUI.windowWrapper.empty();
        });

        if (Clipboard.available) {
            self.GUI.copyButton.click(function() {
                copyToClipboard(self.outputHistory);
            });
        } else {
            self.GUI.copyButton.hide();
        }

        $('.tab-cli .load').click(function() {
            const accepts = [
                {
                    description: 'Config files', extensions: ["txt", "config"],
                },
                {
                    description: 'All files',
                },
            ];

            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: accepts}, function(entry) {
                if (checkChromeRuntimeError()) {
                    return;
                }

                const previewArea = $("#snippetpreviewcontent textarea#preview");

                function executeSnippet(fileName) {
                    const commands = previewArea.val();

                    analytics.sendEvent(analytics.EVENT_CATEGORIES.FLIGHT_CONTROLLER, 'CliExecuteFromFile', fileName);

                    executeCommands(commands);
                    self.GUI.snippetPreviewWindow.close();
                }

                function previewCommands(result, fileName) {
                    if (!self.GUI.snippetPreviewWindow) {
                        self.GUI.snippetPreviewWindow = new jBox("Modal", {
                            id: "snippetPreviewWindow",
                            width: 'auto',
                            height: 'auto',
                            closeButton: 'title',
                            animation: false,
                            isolateScroll: false,
                            title: i18n.getMessage("cliConfirmSnippetDialogTitle", { fileName: fileName }),
                            content: $('#snippetpreviewcontent'),
                            onCreated: () =>
                                $("#snippetpreviewcontent a.confirm").click(() => executeSnippet(fileName))
                            ,
                        });
                    }
                    previewArea.val(result);
                    self.GUI.snippetPreviewWindow.open();
                }

                entry.file((file) => {
                    const reader = new FileReader();
                    reader.onload =
                        () => previewCommands(reader.result, file.name);
                    reader.onerror = () => console.error(reader.error);
                    reader.readAsText(file);
                });
            });
        });

        // Tab key detection must be on keydown,
        // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
        textarea.keydown(function (event) {
            const tabKeyCode = 9;
            if (event.which === tabKeyCode) {
                // prevent default tabbing behaviour
                event.preventDefault();

                if (!CliAutoComplete.isEnabled()) {
                    // Native FC autoComplete
                    const outString = textarea.val();
                    const lastCommand = outString.split("\n").pop();
                    const command = getCliCommand(lastCommand, self.cliBuffer);
                    if (command) {
                        self.sendNativeAutoComplete(command);
                        textarea.val('');
                    }
                }
                else if (!CliAutoComplete.isOpen() && !CliAutoComplete.isBuilding()) {
                    // force show autocomplete on Tab
                    CliAutoComplete.openLater(true);
                }
            }
        });

        textarea.keypress(function (event) {
            if (event.which === enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line

                if (CliAutoComplete.isBuilding()) {
                    return; // silently ignore commands if autocomplete is still building
                }

                const outString = textarea.val();
                executeCommands(outString);
                textarea.val('');
            }
        });

        textarea.keyup(function (event) {
            const keyUp = {38: true};
            const keyDown = {40: true};

            if (CliAutoComplete.isOpen()) {
                return; // disable history keys if autocomplete is open
            }

            if (event.keyCode in keyUp) {
                textarea.val(self.history.prev());
            }

            if (event.keyCode in keyDown) {
                textarea.val(self.history.next());
            }
        });

        // give input element user focus
        textarea.focus();

        GUI.timeout_add('enter_cli', function enter_cli() {
            // Enter CLI mode
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23; // #

            serial.send(bufferOut);
        }, 250);

        GUI.content_ready(callback);
    });
};

TABS.cli.adaptPhones = function() {
    if ($(window).width() < 575) {
        const backdropHeight = $('.note').height() + 22 + 38;
        $('.backdrop').css('height', `calc(100% - ${backdropHeight}px)`);
    }

    if (GUI.isCordova()) {
        UI_PHONES.initToolbar();
    }
};

TABS.cli.history = {
    history: [],
    index:  0,
};

TABS.cli.history.add = function (str) {
    this.history.push(str);
    this.index = this.history.length;
};

TABS.cli.history.prev = function () {
    if (this.index > 0) {
        this.index -= 1;
    }
    return this.history[this.index];
};

TABS.cli.history.next = function () {
    if (this.index < this.history.length) {
        this.index += 1;
    }
    return this.history[this.index - 1];
};

const backspaceCode = 8;
const lineFeedCode = 10;
const carriageReturnCode = 13;

function writeToOutput(text) {
    const windowWrapper = TABS.cli.GUI.windowWrapper;
    windowWrapper.append(text);
    $('.tab-cli .window').scrollTop(windowWrapper.height());
}

function writeLineToOutput(text) {
    if (CliAutoComplete.isBuilding()) {
        CliAutoComplete.builderParseLine(text);
        return; // suppress output if in building state
    }

    if (text.startsWith("###ERROR")) {
        writeToOutput(`<span class="error_message">${text}</span><br>`);
    } else {
        writeToOutput(text + "<br>");
    }
}

function setPrompt(text) {
    $('.tab-cli textarea').val(text);
}

TABS.cli.read = function (readInfo) {
    /*  Some info about handling line feeds and carriage return

        line feed = LF = \n = 0x0A = 10
        carriage return = CR = \r = 0x0D = 13

        MAC only understands CR
        Linux and Unix only understand LF
        Windows understands (both) CRLF
        Chrome OS currently unknown
    */
    const data = new Uint8Array(readInfo.data);
    let validateText = "";
    let sequenceCharsToSkip = 0;

    for (let i = 0; i < data.length; i++) {
        const currentChar = String.fromCharCode(data[i]);
        const isCRLF = currentChar.charCodeAt() === lineFeedCode || currentChar.charCodeAt() === carriageReturnCode;

        if (!CONFIGURATOR.cliValid && (isCRLF || this.startProcessing)) {
            // try to catch part of valid CLI enter message (firmware message starts with CRLF)
            this.startProcessing = true;
            validateText += currentChar;
            writeToOutput(currentChar);
            continue;
        }

        const escapeSequenceCode = 27;
        const escapeSequenceCharLength = 3;
        if (data[i] === escapeSequenceCode && !sequenceCharsToSkip) { // ESC + other
            sequenceCharsToSkip = escapeSequenceCharLength;
        }

        if (sequenceCharsToSkip) {
            sequenceCharsToSkip--;
            continue;
        }

        if (CONFIGURATOR.cliValid) {
            switch (data[i]) {
                case lineFeedCode:
                    if (GUI.operating_system === "Windows") {
                        writeLineToOutput(this.cliBuffer);
                        this.cliBuffer = "";
                    }
                    break;
                case carriageReturnCode:
                    if (GUI.operating_system !== "Windows") {
                        writeLineToOutput(this.cliBuffer);
                        this.cliBuffer = "";
                    }
                    break;
                case 60:
                    this.cliBuffer += '&lt';
                    break;
                case 62:
                    this.cliBuffer += '&gt';
                    break;
                case backspaceCode:
                    this.cliBuffer = this.cliBuffer.slice(0, -1);
                    this.outputHistory = this.outputHistory.slice(0, -1);
                    continue;

                default:
                    this.cliBuffer += currentChar;
            }
        }

        if (!CliAutoComplete.isBuilding()) {
            // do not include the building dialog into the history
            this.outputHistory += currentChar;
        }

        if (this.cliBuffer === 'Rebooting') {
            CONFIGURATOR.cliActive = false;
            CONFIGURATOR.cliValid = false;
            GUI.log(i18n.getMessage('cliReboot'));
            reinitialiseConnection(self);
        }

    }

    if (!CONFIGURATOR.cliValid && validateText.indexOf('CLI') !== -1) {
        GUI.log(i18n.getMessage('cliEnter'));
        CONFIGURATOR.cliValid = true;
        // begin output history with the prompt (last line of welcome message)
        // this is to match the content of the history with what the user sees on this tab
        const lastLine = validateText.split("\n").pop();
        this.outputHistory = lastLine;

        if (CliAutoComplete.isEnabled() && !CliAutoComplete.isBuilding()) {
            // start building autoComplete
            CliAutoComplete.builderStart();
        }
    }

    // fallback to native autocomplete
    if (!CliAutoComplete.isEnabled()) {
        setPrompt(removePromptHash(this.cliBuffer));
    }
};

TABS.cli.sendLine = function (line, callback) {
    this.send(line + '\n', callback);
};

TABS.cli.sendNativeAutoComplete = function (line, callback) {
    this.send(line + '\t', callback);
};

TABS.cli.send = function (line, callback) {
    const bufferOut = new ArrayBuffer(line.length);
    const bufView = new Uint8Array(bufferOut);

    for (let cKey = 0; cKey < line.length; cKey++) {
        bufView[cKey] = line.charCodeAt(cKey);
    }

    serial.send(bufferOut, callback);
};

TABS.cli.cleanup = function (callback) {
    console.log("TABS.cli.cleanup TABS.cli.cleanup TABS.cli.cleanup");
    if (TABS.cli.GUI.snippetPreviewWindow) {
        TABS.cli.GUI.snippetPreviewWindow.destroy();
        TABS.cli.GUI.snippetPreviewWindow = null;
    }
    if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.cliValid && CONFIGURATOR.cliActive)) {
        if (callback) {
            callback();
        }

        return;
    }
    this.send(getCliCommand('exit\r', this.cliBuffer), function () {
        // we could handle this "nicely", but this will do for now
        // (another approach is however much more complicated):
        // we can setup an interval asking for data lets say every 200ms, when data arrives, callback will be triggered and tab switched
        // we could probably implement this someday
        if (callback) {
            callback();
        }

        CONFIGURATOR.cliActive = false;
        CONFIGURATOR.cliValid = false;
    });

    CliAutoComplete.cleanup();
    $(CliAutoComplete).off();
};
