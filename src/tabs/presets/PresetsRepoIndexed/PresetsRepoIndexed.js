'use strict';

class PresetsRepoIndexed
{
    constructor(urlRaw, urlGithub)
    {
        this._urlRaw = urlRaw;
        this._urlGithub = urlGithub;
        this._index = null;
    }

    get index()
    {
        return this._index;
    }

    loadIndex()
    {
        return fetch(this._urlRaw + "index.json")
            .then(res => res.json())
            .then((out) => {
                this._index = out;
            });
    }

    getPresetGitHubLink(preset)
    {
        return this._urlGithub + preset.fullPath;
    }


    _parceInclude(strings, includeRowIndexes, promises)
    {
        const regExpInclude = /^#[ ]+?include:[ ]+?(?<filePath>\S+$)/;
        // Reg exp extracts file/path.txt from # include: file/path.txt

        for (let i = 0; i < strings.length; i++) {
            const match = regExpInclude.exec(strings[i]);

            if (match !== null) {
                includeRowIndexes.push(i);
                const filePath = this._urlRaw + match.groups.filePath;
                const promise = this._loadPresetText(filePath);
                promises.push(promise);
            }
        }
    }

    _executeIncludeOnce(strings)
    {
        const includeRowIndexes = []; // row indexes with "#include" statements
        const promises = []; // promises to load included files
        this._parceInclude(strings, includeRowIndexes, promises);

        let resultPromise = new Promise((resolve, reject) => {
            Promise.all(promises)
            .then((includedTexts) => {
                for (let i = 0; i < includedTexts.length; i++)
                {
                    strings[includeRowIndexes[i]] = includedTexts[i];
                }

                resolve(strings.join('\n'));
            })
            .catch((err) => {
                reject(err);
            });
        });

        return resultPromise;
    }

    loadPreset(preset)
    {
        const promiseMainText = this._loadPresetText(this._urlRaw + preset.fullPath);

        let resultPromise = new Promise((resolve, reject) => {
            promiseMainText
            .then((text) => {
                let strings = text.split("\n");
                strings = strings.map(str => str.trim());
                console.log(strings);
                this._executeIncludeOnce(strings).then(finalText => {
                    resolve(finalText);
                }).
                catch(err => {
                    reject(err);
                })
            })
            .catch((err) => {
                reject(err);
            });
        });

        return resultPromise;
    }

    _loadPresetText(fullUrl)
    {
        let resultPromise = new Promise((resolve, reject) => {
            fetch(fullUrl).then(res => res.text()).then(text => {
                resolve(text);
            })
            .catch(err => {
                console.error(err);
                reject(err);
            });
        });

        return resultPromise;
    }
}
