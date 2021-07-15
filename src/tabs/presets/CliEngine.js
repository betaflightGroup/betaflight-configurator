'use strict';

class CliEngine
{
    constructor(currentTab)
    {
        this._currentTab = currentTab;
        this._lineDelayMs = 15;
        this._profileSwitchDelayMs = 100;
        this._cliBuffer = "";
        this._window = null;
        this._windowWrapper = null;
    }

    static s_backspaceCode = 8;
    static s_lineFeedCode = 10;
    static s_carriageReturnCode = 13;
    static s_tabCode = 9;
    static s_enterKeyCode = 13;


    setUi(window, windowWrapper, textarea)
    {
        this._window = window;
        this._windowWrapper = windowWrapper;
        this._setTextareaListen(textarea);
    }

    enterCliMode()
    {
        GUI.timeout_add('enter_cli_mode', () => {
            // Enter CLI mode
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23; // #

            serial.send(bufferOut);
        }, 250);
    }

    _setTextareaListen(textarea)
    {
        // Tab key detection must be on keydown,
        // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
        textarea.keydown((event) => {
            const tabKeyCode = 9;
            if (event.which === CliEngine.s_tabCode) {
                // prevent default tabbing behaviour
                event.preventDefault();
            }
        });

        textarea.keypress((event) => {
            if (event.which === CliEngine.s_enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line

                const outString = textarea.val();
                this.executeCommands(outString);
                textarea.val('');
            }
        });

        // give input element user focus
        textarea.focus();
    }

    close(callback)
    {
        this.send(this.getCliCommand('exit\r', ""), function () { //this.cliBuffer
            if (callback) {
                callback();
            }
        });
    }

    executeCommands(outString) {
        const outputArray = outString.split("\n");
        Promise.reduce(outputArray, (delay, line, index) => {
            return new Promise((resolve) => {
                GUI.timeout_add('CLI_send_slowly', () => {
                    let processingDelay = this.lineDelayMs;
                    line = line.trim();

                    if (line.toLowerCase().startsWith('profile')) {
                        processingDelay = this.profileSwitchDelayMs;
                    }

                    const isLastCommand = outputArray.length === index + 1;

                    if (isLastCommand && this.cliBuffer) {
                        line = this.getCliCommand(line, this.cliBuffer);
                    }

                    this.sendLine(line, function () {
                        resolve(processingDelay);
                    });
                }, delay);
            });
        }, 0);
    }

    removePromptHash(promptText)
    {
        return promptText.replace(/^# /, '');
        //return promptText;
    }

    cliBufferCharsToDelete(command, buffer) {
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

    commandWithBackSpaces(command, buffer, noOfCharsToDelete) {
        const backspace = String.fromCharCode(127);
        return backspace.repeat(noOfCharsToDelete) + command.substring(buffer.length - noOfCharsToDelete, command.length);
    }

    getCliCommand(command, cliBuffer) {
        const buffer = this.removePromptHash(cliBuffer);
        const bufferRegex = new RegExp('^' + buffer, 'g');

        if (command.match(bufferRegex)) {
            const result = command.replace(bufferRegex, '');
            return result;
        }

        const noOfCharsToDelete = this.cliBufferCharsToDelete(command, buffer);
        const result = this.commandWithBackSpaces(command, buffer, noOfCharsToDelete);
        return result;
    }


    writeToOutput(text)
    {
        this._windowWrapper.append(text);
        this._window.scrollTop(this._windowWrapper.height());
    }

    writeLineToOutput(text) {
        if (text.startsWith("###ERROR")) {
            this.writeToOutput(`<span class="error_message">${text}</span><br>`);
        } else {
            this.writeToOutput(text + "<br>");
        }
    }

    readSerial(readInfo)
    {
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

            if (!CONFIGURATOR.cliEngineValid) {
                // try to catch part of valid CLI enter message
                validateText += currentChar;
                this.writeToOutput(currentChar);
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

            switch (data[i]) {
                case CliEngine.s_lineFeedCode:
                    if (GUI.operating_system === "Windows") {
                        this.writeLineToOutput(this.cliBuffer);
                        this.cliBuffer = "";
                    }
                    break;
                case CliEngine.s_carriageReturnCode:
                    if (GUI.operating_system !== "Windows") {
                        this.writeLineToOutput(this.cliBuffer);
                        this.cliBuffer = "";
                    }
                    break;
                case 60:
                    this.cliBuffer += '&lt';
                    break;
                case 62:
                    this.cliBuffer += '&gt';
                    break;
                case CliEngine.s_backspaceCode:
                    this.cliBuffer = this.cliBuffer.slice(0, -1);
                    continue;

                default:
                    this.cliBuffer += currentChar;
            }

            if (this.cliBuffer === 'Rebooting') {
                CONFIGURATOR.cliEngineActive = false;
                CONFIGURATOR.cliEngineValid = false;
                GUI.log(i18n.getMessage('cliReboot'));
                reinitialiseConnection(this._currentTab);
            }
        }

        if (!CONFIGURATOR.cliEngineValid && validateText.indexOf('CLI') !== -1) {
            GUI.log(i18n.getMessage('cliEnter'));
            CONFIGURATOR.cliEngineValid = true;
            // begin output history with the prompt (last line of welcome message)
            // this is to match the content of the history with what the user sees on this tab
            const lastLine = validateText.split("\n").pop();
        }
    };


    sendLine(line, callback)
    {
        this.send(line + '\n', callback);
    };

    send(line, callback)
    {
        const bufferOut = new ArrayBuffer(line.length);
        const bufView = new Uint8Array(bufferOut);

        for (let cKey = 0; cKey < line.length; cKey++) {
            bufView[cKey] = line.charCodeAt(cKey);
        }

        serial.send(bufferOut, callback);
    };

}