const fs = nw.require('fs');
const path = nw.require('path');

const zeroPad = (value, width) => {
    let valuePadded = String(value);

    while (valuePadded.length < width) {
        valuePadded = `0${value}`;
    }

    return valuePadded;
};

const getDefaultPath = () => {
    let location;
    ConfigStorage.get([GUI.active_tab], res => location = (res) ? res[GUI.active_tab] : '');
    return location;
};

const setDefaultPath = location => ConfigStorage.set({[GUI.active_tab]: location});

/*
* Retaining last used folder on each individual tab for file operations using NWjs extended attributes:
*
* nwdirectory => returns path of a directory (files picking disabled - not much of use without implementing our own file browser).
* nwsaveas => opens 'save as' dialog with suggested filename
* accepts => when loading files limits the used extensions and data type - example ".txt, .config, plain/text".
* nwworkingdir => sets location (no need to set this as it restores the last used value for the tab).
*
* returns a File System Access API 'File' object in the callback - this object is not compatible with the (File or Directory) Entry object.
*/

const NWjsFileDialog = (options, callback) => {

    // discard previous input element
    const id = document.querySelector('#fileDialog');
    if (id) {
        id.parentNode.removeChild(id);
    }
    // craft new input element
    const parent = document.querySelector('.fileInput');
    const newInput = document.createElement('input');
    parent.append(newInput);
    const newId = document.querySelector('.fileInput input');
    // set default attributes
    const defaultAttributes = {
        'style': 'display:none;',
        'id': 'fileDialog',
        'type': 'file',
        'nwworkingdir': getDefaultPath(),
    };
    Object.keys(defaultAttributes).forEach(key => newId.setAttribute(key, defaultAttributes[key]));
    // set custom attributes
    Object.keys(options).forEach(key => newId.setAttribute(key, options[key]));

    const chooseFile = name => {
        const chooser = document.querySelector(name);
        chooser.addEventListener('change', e => {
            if (e.target.value) {
                setDefaultPath(path.dirname(e.target.value));
                console.dir(e.target.files[0]);
                callback(e.target.files[0]);
                e.target.value = '';
            }
        }, false);

        chooser.click();
    };

    chooseFile('#fileDialog');
};

// exports
const generateFilename= (prefix, suffix) => {
    const date = new Date();
    let filename = prefix;

    if (FC.CONFIG) {
        if (FC.CONFIG.flightControllerIdentifier) {
            filename = `${FC.CONFIG.flightControllerIdentifier}_${filename}`;
        }
        if (FC.CONFIG.name && FC.CONFIG.name.trim() !== '') {
            filename = `${filename}_${FC.CONFIG.name.trim().replace(' ', '_')}`;
        }
    }

    const yyyymmdd = `${date.getFullYear()}${zeroPad(date.getMonth() + 1, 2)}${zeroPad(date.getDate(), 2)}`;
    const hhmmss = `${zeroPad(date.getHours(), 2)}${zeroPad(date.getMinutes(), 2)}${zeroPad(date.getSeconds(), 2)}`;
    filename = `${filename}_${yyyymmdd}_${hhmmss}`;

    return `${filename}.${suffix}`;
};

const fileOpen = (accept, callback) => NWjsFileDialog({accept: accept}, callback);
const fileSave = (filename, callback) => NWjsFileDialog({nwsaveas: filename}, callback);
const fileRead = (filename, callback) => fs.readFile(filename, 'utf8', (error, data) => callback(error, data));
const fileWrite = (filename, content, callback) => fs.writeFile(filename, content, (error) => callback(error));

const fileSaveWithoutDialog = (filename, content) => {
    const location = getDefaultPath();
    const fullFileName = getFullFileName(location, filename);
    writeToFile(fullFileName, content);
};

const fileOpenWithoutDialog = filename => {
    const location = getDefaultPath();
    return getFullFileName(location, filename);
};

// Generic functions
window.generateFilename = generateFilename;
window.getDefaultPath = getDefaultPath;
window.setDefaultPath = setDefaultPath;
// NWjs extensions
window.fileOpen = fileOpen;
window.fileSave = fileSave;
window.fileRead = fileRead;
window.fileWrite = fileWrite;
