'use strict';

const API_VERSION_1_31 = '1.31.0';
const API_VERSION_1_32 = '1.32.0';
const API_VERSION_1_33 = '1.33.0';
const API_VERSION_1_34 = '1.34.0';
const API_VERSION_1_35 = '1.35.0';
const API_VERSION_1_36 = '1.36.0';
const API_VERSION_1_37 = '1.37.0';
const API_VERSION_1_38 = '1.38.0';
const API_VERSION_1_39 = '1.39.0';
const API_VERSION_1_40 = '1.40.0';
const API_VERSION_1_41 = '1.41.0';
const API_VERSION_1_42 = '1.42.0';
const API_VERSION_1_43 = '1.43.0';
const API_VERSION_1_44 = '1.44.0';

const CONFIGURATOR = {
    // all versions are specified and compared using semantic versioning http://semver.org/
    API_VERSION_ACCEPTED: '1.2.1',
    API_VERSION_MIN_SUPPORTED_BACKUP_RESTORE: '1.5.0',
    API_VERSION_MIN_SUPPORTED_PID_CONTROLLER_CHANGE: '1.5.0',
    BACKUP_FILE_VERSION_MIN_SUPPORTED: '0.55.0', // chrome.runtime.getManifest().version is stored as string, so does this one
    API_VERSION_MAX_SUPPORTED: API_VERSION_1_44,

    connectionValid: false,
    connectionValidCliOnly: false,
    virtualMode: false,
    virtualApiVersion: '0.0.1',
    cliActive: false,
    cliValid: false,
    cliEngineActive: false,
    cliEngineValid: false,
    gitChangesetId: 'unknown',
    version: '0.0.1',
    latestVersion: '0.0.1',
    latestVersionReleaseUrl: 'https://github.com/betaflight/betaflight-configurator/releases',
};
