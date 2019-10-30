'use strict';

var pkg = require('./package.json');
// remove gulp-appdmg from the package.json we're going to write
delete pkg.optionalDependencies['gulp-appdmg'];

const child_process = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const https = require('follow-redirects').https;
const path = require('path');

const zip = require('gulp-zip');
const del = require('del');
const NwBuilder = require('nw-builder');
const makensis = require('makensis');
const deb = require('gulp-debian');
const buildRpm = require('rpm-builder');
const commandExistsSync = require('command-exists').sync;
const targz = require('targz');

const gulp = require('gulp');
const concat = require('gulp-concat');
const yarn = require("gulp-yarn");
const rename = require('gulp-rename');
const os = require('os');
const git = require('gulp-git');
const source = require('vinyl-source-stream');
const stream = require('stream');
const webpack = require('webpack');

const DIST_DIR = './dist/';
const APPS_DIR = './apps/';
const DEBUG_DIR = './debug/';
const RELEASE_DIR = './release/';

const LINUX_INSTALL_DIR = '/opt/betaflight';

// Global variable to hold the change hash from when we get it, to when we use it.
var gitChangeSetId;

var nwBuilderOptions = {
    version: '0.41.3',
    files: './dist/**/*',
    macIcns: './src/images/bf_icon.icns',
    macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
    winIco: './src/images/bf_icon.ico',
    zip: false
};

var nwArmVersion = '0.27.6';

//-----------------
//Pre tasks operations
//-----------------
const SELECTED_PLATFORMS = getInputPlatforms();

//-----------------
//Tasks
//-----------------

gulp.task('clean', gulp.parallel(clean_dist, clean_apps, clean_debug, clean_release));

gulp.task('clean-dist', clean_dist);

gulp.task('clean-apps', clean_apps);

gulp.task('clean-debug', clean_debug);

gulp.task('clean-release', clean_release);

gulp.task('clean-cache', clean_cache);

// Function definitions are processed before function calls.
const getChangesetId = gulp.series(getHash, writeChangesetId);
gulp.task('get-changeset-id', getChangesetId);

// dist_yarn MUST be done after dist_src
var distBuild = gulp.series(dist_src, dist_changelog, dist_yarn, dist_locale, dist_libraries, dist_resources, dist_webpack, getChangesetId);
var distRebuild = gulp.series(clean_dist, distBuild);
gulp.task('dist', distRebuild);

var appsBuild = gulp.series(gulp.parallel(clean_apps, distRebuild), apps, gulp.parallel(listPostBuildTasks(APPS_DIR)));
gulp.task('apps', appsBuild);

var debugBuild = gulp.series(distBuild, debug, gulp.parallel(listPostBuildTasks(DEBUG_DIR)), start_debug);
gulp.task('debug', debugBuild);

var releaseBuild = gulp.series(gulp.parallel(clean_release, appsBuild), gulp.parallel(listReleaseTasks()));
gulp.task('release', releaseBuild);

gulp.task('default', debugBuild);

// -----------------
// Helper functions
// -----------------

// Get platform from commandline args
// #
// # gulp <task> [<platform>]+        Run only for platform(s) (with <platform> one of --linux64, --linux32, --armv7, --osx64, --win32, --win64, or --chromeos)
// #
function getInputPlatforms() {
    var supportedPlatforms = ['linux64', 'linux32', 'armv7', 'osx64', 'win32','win64', 'chromeos'];
    var platforms = [];
    var regEx = /--(\w+)/;
    console.log(process.argv);
    for (var i = 3; i < process.argv.length; i++) {
        var arg = process.argv[i].match(regEx)[1];
        if (supportedPlatforms.indexOf(arg) > -1) {
            platforms.push(arg);
        } else if (arg == 'nowinicon') {
            console.log('ignoring winIco')
            delete nwBuilderOptions['winIco'];
        } else {
            console.log('Unknown platform: ' + arg);
            process.exit();
        }
    }

    if (platforms.length === 0) {
        var defaultPlatform = getDefaultPlatform();
        if (supportedPlatforms.indexOf(defaultPlatform) > -1) {
            platforms.push(defaultPlatform);
        } else {
            console.error(`Your current platform (${os.platform()}) is not a supported build platform. Please specify platform to build for on the command line.`);
            process.exit();
        }
    }

    if (platforms.length > 0) {
        console.log('Building for platform(s): ' + platforms + '.');
    } else {
        console.error('No suitables platforms found.');
        process.exit();
    }

    return platforms;
}

// Gets the default platform to be used
function getDefaultPlatform() {
    var defaultPlatform;
    switch (os.platform()) {
    case 'darwin':
        defaultPlatform = 'osx64';

        break;
    case 'linux':
        defaultPlatform = 'linux64';

        break;
    case 'win32':
        defaultPlatform = 'win32';

        break;

    default:
        defaultPlatform = '';

        break;
    }
    return defaultPlatform;
}


function getPlatforms() {
    return SELECTED_PLATFORMS.slice();
}

function removeItem(platforms, item) {
    var index = platforms.indexOf(item);
    if (index >= 0) {
        platforms.splice(index, 1);
    }
}

function getRunDebugAppCommand(arch) {
    switch (arch) {
    case 'osx64':
        return 'open ' + path.join(DEBUG_DIR, pkg.name, arch, pkg.name + '.app');

        break;

    case 'linux64':
    case 'linux32':
    case 'armv7':
        return path.join(DEBUG_DIR, pkg.name, arch, pkg.name);

        break;

    case 'win32':
    case 'win64':
        return path.join(DEBUG_DIR, pkg.name, arch, pkg.name + '.exe');

        break;

    default:
        return '';

        break;
    }
}

function getReleaseFilename(platform, ext) {
    return `${pkg.name}_${pkg.version}_${platform}.${ext}`;
}

function clean_dist() {
    return del([DIST_DIR + '**'], { force: true });
}

function clean_apps() {
    return del([APPS_DIR + '**'], { force: true });
}

function clean_debug() {
    return del([DEBUG_DIR + '**'], { force: true });
}

function clean_release() {
    return del([RELEASE_DIR + '**'], { force: true });
}

function clean_cache() {
    return del(['./cache/**'], { force: true });
}

// Real work for dist task. Done in another task to call it via
// run-sequence.
function dist_src() {
    var distSources = [
        './src/**/*',
        '!./src/css/dropdown-lists/LICENSE',
        '!./src/css/font-awesome/css/font-awesome.css',
        '!./src/css/opensans_webfontkit/*.{txt,html}',
        '!./src/support/**'
    ];
    var packageJson = new stream.Readable;
    packageJson.push(JSON.stringify(pkg,undefined,2));
    packageJson.push(null);

    return packageJson
        .pipe(source('package.json'))
        .pipe(gulp.src(distSources, { base: 'src' }))
        .pipe(gulp.src('./react/**/*', { passthrougth: true }))
        .pipe(gulp.src('manifest.json', { passthrougth: true }))
        .pipe(gulp.src('yarn.lock', { passthrougth: true }))
        .pipe(gulp.dest(DIST_DIR));
}

function dist_changelog() {
    return gulp.src('changelog.html')
        .pipe(gulp.dest(DIST_DIR+"tabs/"));
}

// This function relies on files from the dist_src function
function dist_yarn() {
    return gulp.src(['./dist/package.json', './dist/yarn.lock'])
        .pipe(gulp.dest('./dist'))
        .pipe(yarn({
            production: true
        }));
}

function dist_locale() {
    return gulp.src('./locales/**/*', { base: 'locales'})
        .pipe(gulp.dest(DIST_DIR + '_locales'));
}

function dist_libraries() {
    return gulp.src('./libraries/**/*', { base: '.'})
        .pipe(gulp.dest(DIST_DIR + 'js'));
}

function dist_resources() {
    return gulp.src(['./resources/**/*', '!./resources/osd/**/*.png'], { base: '.'})
        .pipe(gulp.dest(DIST_DIR));
}

function dist_webpack() {
    return new Promise((resolve, reject) => {
        const webpackConfig = require('./webpack.config');
        webpack(webpackConfig, (err, stats) => {
            if (err) {
                console.error(err.stack || err);
                if (err.details) {
                    console.error(err.details);
                }
                return reject(err);
            }

            const info = stats.toJson();

            if (stats.hasErrors()) {
                console.error(info.errors);
                return reject(info.errors);
            }

            if (stats.hasWarnings()) {
                console.warn(info.warnings);
            }

            resolve()
        })
    })
}

// Create runable app directories in ./apps
function apps(done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');

    buildNWAppsWrapper(platforms, 'normal', APPS_DIR, done);
}

function listPostBuildTasks(folder, done) {

    var platforms = getPlatforms();

    var postBuildTasks = [];

    if (platforms.indexOf('linux32') != -1) {
        postBuildTasks.push(function post_build_linux32(done) {
            return post_build('linux32', folder, done);
        });
    }

    if (platforms.indexOf('linux64') != -1) {
        postBuildTasks.push(function post_build_linux64(done) {
            return post_build('linux64', folder, done);
        });
    }

    if (platforms.indexOf('armv7') != -1) {
        postBuildTasks.push(function post_build_armv7(done) {
            return post_build('armv7', folder, done);
        });
    }

    // We need to return at least one task, if not gulp will throw an error
    if (postBuildTasks.length == 0) {
        postBuildTasks.push(function post_build_none(done) {
            done();
        });
    }
    return postBuildTasks;
}

function post_build(arch, folder, done) {

    if ((arch === 'linux32') || (arch === 'linux64')) {
        // Copy Ubuntu launcher scripts to destination dir
        var launcherDir = path.join(folder, pkg.name, arch);
        console.log('Copy Ubuntu launcher scripts to ' + launcherDir);
        return gulp.src('assets/linux/**')
                   .pipe(gulp.dest(launcherDir));
    }

    if (arch === 'armv7') {
        console.log('Moving ARMv7 build from "linux32" to "armv7" directory...');
        fse.moveSync(path.join(folder, pkg.name, 'linux32'), path.join(folder, pkg.name, 'armv7'));
    }

    return done();
}

// Create debug app directories in ./debug
function debug(done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');

    buildNWAppsWrapper(platforms, 'sdk', DEBUG_DIR, done);
}

function injectARMCache(flavor, callback) {
    var flavorPostfix = `-${flavor}`;
    var flavorDownloadPostfix = flavor !== 'normal' ? `-${flavor}` : '';
    clean_cache().then(function() {
        if (!fs.existsSync('./cache')) {
            fs.mkdirSync('./cache');
        }
        fs.closeSync(fs.openSync('./cache/_ARMv7_IS_CACHED', 'w'));
        var versionFolder = `./cache/${nwBuilderOptions.version}${flavorPostfix}`;
        if (!fs.existsSync(versionFolder)) {
            fs.mkdirSync(versionFolder);
        }
        if (!fs.existsSync(versionFolder + '/linux32')) {
            fs.mkdirSync(`${versionFolder}/linux32`);
        }
        var downloadedArchivePath = `${versionFolder}/nwjs${flavorPostfix}-v${nwArmVersion}-linux-arm.tar.gz`;
        var downloadUrl = `https://github.com/LeonardLaszlo/nw.js-armv7-binaries/releases/download/v${nwArmVersion}/nwjs${flavorDownloadPostfix}-v${nwArmVersion}-linux-arm.tar.gz`;
        if (fs.existsSync(downloadedArchivePath)) {
            console.log('Prebuilt ARMv7 binaries found in /tmp');
            downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder);
        } else {
            console.log(`Downloading prebuilt ARMv7 binaries from "${downloadUrl}"...`);
            process.stdout.write('> Starting download...\r');
            var armBuildBinary = fs.createWriteStream(downloadedArchivePath);
            var request = https.get(downloadUrl, function(res) {
                var totalBytes = res.headers['content-length'];
                var downloadedBytes = 0;
                res.pipe(armBuildBinary);
                res.on('data', function (chunk) {
                    downloadedBytes += chunk.length;
                    process.stdout.write(`> ${parseInt((downloadedBytes * 100) / totalBytes)}% done             \r`);
                });
                armBuildBinary.on('finish', function() {
                    process.stdout.write('> 100% done             \n');
                    armBuildBinary.close(function() {
                        downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder);
                    });
                });
            });
        }
    });

    function downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder) {
        console.log('Injecting prebuilt ARMv7 binaries into Linux32 cache...');
        targz.decompress({
            src: downloadedArchivePath,
            dest: versionFolder,
        }, function(err) {
            if (err) {
                console.log(err);
                clean_debug();
                process.exit(1);
            } else {
                fs.rename(
                    `${versionFolder}/nwjs${flavorDownloadPostfix}-v${nwArmVersion}-linux-arm`,
                    `${versionFolder}/linux32`,
                    (err) => {
                        if (err) {
                            console.log(err);
                            clean_debug();
                            process.exit(1);
                        }
                        callback();
                    }
                );
            }
        });
    }
}

function buildNWAppsWrapper(platforms, flavor, dir, done) {
    function buildNWAppsCallback() {
        buildNWApps(platforms, flavor, dir, done);
    }

    if (platforms.indexOf('armv7') !== -1) {
        if (platforms.indexOf('linux32') !== -1) {
            console.log('Cannot build ARMv7 and Linux32 versions at the same time!');
            clean_debug();
            process.exit(1);
        }
        removeItem(platforms, 'armv7');
        platforms.push('linux32');

        if (!fs.existsSync('./cache/_ARMv7_IS_CACHED', 'w')) {
            console.log('Purging cache because it needs to be overwritten...');
            clean_cache().then(() => {
                injectARMCache(flavor, buildNWAppsCallback);
            })
        } else {
            buildNWAppsCallback();
        }
    } else {
        if (platforms.indexOf('linux32') !== -1 && fs.existsSync('./cache/_ARMv7_IS_CACHED')) {
            console.log('Purging cache because it was previously overwritten...');
            clean_cache().then(buildNWAppsCallback);
        } else {
            buildNWAppsCallback();
        }
    }
}

function buildNWApps(platforms, flavor, dir, done) {
    if (platforms.length > 0) {
        var builder = new NwBuilder(Object.assign({
            buildDir: dir,
            platforms: platforms,
            flavor: flavor
        }, nwBuilderOptions));
        builder.on('log', console.log);
        builder.build(function (err) {
            if (err) {
                console.log('Error building NW apps: ' + err);
                clean_debug();
                process.exit(1);
            }
            done();
        });
    } else {
        console.log('No platform suitable for NW Build')
        done();
    }
}

function getHash(cb) {
    git.revParse({args: '--short HEAD'}, function (err, hash) {
        if (err) {
            gitChangeSetId = 'unsupported';
        } else {
            gitChangeSetId = hash;
        }
        cb();
    });
}

function writeChangesetId() {
    var versionJson = new stream.Readable;
    versionJson.push(JSON.stringify({
        gitChangesetId: gitChangeSetId,
        version: pkg.version
        }, undefined, 2));
    versionJson.push(null);
    return versionJson
        .pipe(source('version.json'))
        .pipe(gulp.dest(DIST_DIR))
}

function start_debug(done) {

    var platforms = getPlatforms();

    var exec = require('child_process').exec;
    if (platforms.length === 1) {
        var run = getRunDebugAppCommand(platforms[0]);
        console.log('Starting debug app (' + run + ')...');
        exec(run);
    } else {
        console.log('More than one platform specified, not starting debug app');
    }
    done();
}

// Create installer package for windows platforms
function release_win(arch, done) {

    // Check if makensis exists
    if (!commandExistsSync('makensis')) {
        console.warn('makensis command not found, not generating win package for ' + arch);
        return done();
    }

    // The makensis does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    // Parameters passed to the installer script
    const options = {
            verbose: 2,
            define: {
                'VERSION': pkg.version,
                'PLATFORM': arch,
                'DEST_FOLDER': RELEASE_DIR
            }
        }

    var output = makensis.compileSync('./assets/windows/installer.nsi', options);

    if (output.status !== 0) {
        console.error('Installer for platform ' + arch + ' finished with error ' + output.status + ': ' + output.stderr);
    }

    done();
}

// Create distribution package (zip) for windows and linux platforms
function release_zip(arch) {
    var src = path.join(APPS_DIR, pkg.name, arch, '**');
    var output = getReleaseFilename(arch, 'zip');
    var base = path.join(APPS_DIR, pkg.name, arch);

    return compressFiles(src, base, output, 'Betaflight Configurator');
}

// Create distribution package for chromeos platform
function release_chromeos() {
    var src = path.join(DIST_DIR, '**');
    var output = getReleaseFilename('chromeos', 'zip');
    var base = DIST_DIR;

    return compressFiles(src, base, output, '.');
}

// Compress files from srcPath, using basePath, to outputFile in the RELEASE_DIR
function compressFiles(srcPath, basePath, outputFile, zipFolder) {
    return gulp.src(srcPath, { base: basePath })
               .pipe(rename(function(actualPath) {
                   actualPath.dirname = path.join(zipFolder, actualPath.dirname);
               }))
               .pipe(zip(outputFile))
               .pipe(gulp.dest(RELEASE_DIR));
}

function release_deb(arch, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('dpkg-deb')) {
        console.warn('dpkg-deb command not found, not generating deb package for ' + arch);
        return done();
    }

    return gulp.src([path.join(APPS_DIR, pkg.name, arch, '*')])
        .pipe(deb({
             package: pkg.name,
             version: pkg.version,
             section: 'base',
             priority: 'optional',
             architecture: getLinuxPackageArch('deb', arch),
             maintainer: pkg.author,
             description: pkg.description,
             preinst: [`rm -rf ${LINUX_INSTALL_DIR}/${pkg.name}`],
             postinst: [`chown root:root ${LINUX_INSTALL_DIR}`, `chown -R root:root ${LINUX_INSTALL_DIR}/${pkg.name}`, `xdg-desktop-menu install ${LINUX_INSTALL_DIR}/${pkg.name}/${pkg.name}.desktop`],
             prerm: [`xdg-desktop-menu uninstall ${pkg.name}.desktop`],
             depends: 'libgconf-2-4',
             changelog: [],
             _target: `${LINUX_INSTALL_DIR}/${pkg.name}`,
             _out: RELEASE_DIR,
             _copyright: 'assets/linux/copyright',
             _clean: true
    }));
}

function release_rpm(arch, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('rpmbuild')) {
        console.warn('rpmbuild command not found, not generating rpm package for ' + arch);
        return done();
    }

    // The buildRpm does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    var regex = /-/g;

    var options = {
             name: pkg.name,
             version: pkg.version.replace(regex, '_'), // RPM does not like release candidate versions
             buildArch: getLinuxPackageArch('rpm', arch),
             vendor: pkg.author,
             summary: pkg.description,
             license: 'GNU General Public License v3.0',
             requires: 'libgconf-2-4',
             prefix: '/opt',
             files:
                 [ { cwd: path.join(APPS_DIR, pkg.name, arch),
                     src: '*',
                     dest: `${LINUX_INSTALL_DIR}/${pkg.name}` } ],
             postInstallScript: [`xdg-desktop-menu install ${LINUX_INSTALL_DIR}/${pkg.name}/${pkg.name}.desktop`],
             preUninstallScript: [`xdg-desktop-menu uninstall ${pkg.name}.desktop`],
             tempDir: path.join(RELEASE_DIR,'tmp-rpm-build-' + arch),
             keepTemp: false,
             verbose: false,
             rpmDest: RELEASE_DIR,
             execOpts: { maxBuffer: 1024 * 1024 * 16 },
    };

    buildRpm(options, function(err, rpm) {
        if (err) {
          console.error("Error generating rpm package: " + err);
        }
        done();
    });
}

function getLinuxPackageArch(type, arch) {
    var packArch;

    switch (arch) {
    case 'linux32':
        packArch = 'i386';
        break;
    case 'linux64':
        if (type == 'rpm') {
            packArch = 'x86_64';
        } else {
            packArch = 'amd64';
        }
        break;
    default:
        console.error("Package error, arch: " + arch);
        process.exit(1);
        break;
    }

    return packArch;
}
// Create distribution package for macOS platform
function release_osx64() {
    var appdmg = require('gulp-appdmg');

    // The appdmg does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    // The src pipe is not used
    return gulp.src(['.'])
        .pipe(appdmg({
            target: path.join(RELEASE_DIR, getReleaseFilename('macOS', 'dmg')),
            basepath: path.join(APPS_DIR, pkg.name, 'osx64'),
            specification: {
                title: 'Betaflight Configurator',
                contents: [
                    { 'x': 448, 'y': 342, 'type': 'link', 'path': '/Applications' },
                    { 'x': 192, 'y': 344, 'type': 'file', 'path': pkg.name + '.app', 'name': 'Betaflight Configurator.app' }
                ],
                background: path.join(__dirname, 'assets/osx/dmg-background.png'),
                format: 'UDZO',
                window: {
                    size: {
                        width: 638,
                        height: 479
                    }
                }
            },
        })
    );
}

// Create the dir directory, with write permissions
function createDirIfNotExists(dir) {
    fs.mkdir(dir, '0775', function(err) {
        if (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    });
}

// Create a list of the gulp tasks to execute for release
function listReleaseTasks(done) {

    var platforms = getPlatforms();

    var releaseTasks = [];

    if (platforms.indexOf('chromeos') !== -1) {
        releaseTasks.push(release_chromeos);
    }

    if (platforms.indexOf('linux64') !== -1) {
        releaseTasks.push(function release_linux64_zip() {
            return release_zip('linux64');
        });
        releaseTasks.push(function release_linux64_deb(done) {
            return release_deb('linux64', done);
        });
        releaseTasks.push(function release_linux64_rpm(done) {
            return release_rpm('linux64', done);
        });
    }

    if (platforms.indexOf('linux32') !== -1) {
        releaseTasks.push(function release_linux32_zip() {
            return release_zip('linux32');
        });
        releaseTasks.push(function release_linux32_deb(done) {
            return release_deb('linux32', done);
        });
        releaseTasks.push(function release_linux32_rpm(done) {
            return release_rpm('linux32', done);
        });
    }

    if (platforms.indexOf('armv7') !== -1) {
        releaseTasks.push(function release_armv7_zip() {
            return release_zip('armv7');
        });
    }

    if (platforms.indexOf('osx64') !== -1) {
        releaseTasks.push(release_osx64);
    }

    if (platforms.indexOf('win32') !== -1) {
        releaseTasks.push(function release_win32(done) {
            return release_win('win32', done);
        });
    }

    if (platforms.indexOf('win64') !== -1) {
        releaseTasks.push(function release_win64(done) {
            return release_win('win64', done);
        });
    }

    return releaseTasks;
}
