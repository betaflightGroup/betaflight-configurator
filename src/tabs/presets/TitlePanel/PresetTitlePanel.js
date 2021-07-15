'use strict';

class PresetTitlePanel
{
    static s_panelCounter = 0;

    constructor(parentDiv, preset, clickable, onLoadedCallback)
    {
        PresetTitlePanel.s_panelCounter ++;
        this._parentDiv = parentDiv;
        this._onLoadedCallback = onLoadedCallback;
        this._domId = `preset_title_panel_${PresetTitlePanel.s_panelCounter}`;
        this._preset = preset;

        this._parentDiv.append(`<div class="${this._domId}"></div>`);
        this._domWrapperDiv = $(`.${this._domId}`);
        this._domWrapperDiv.toggle(false);

        if (clickable) {
            this._domWrapperDiv.addClass("preset_title_panel_border");
        }

        this._domWrapperDiv.load("./tabs/presets/TitlePanel/PresetTitlePanelBody.html", () =>
        {
            this._setupHtml();
        });
    }

    subscribeClick(presetsDetailedDialog)
    {
        this._domWrapperDiv.on("click", () => {
            presetsDetailedDialog.open(this._preset);
        });
    }

    _setupHtml()
    {
        this._readDom();

        this._domCategory.text(this._preset.category);
        this._domTitle.text(this._preset.title);
        this._domAuthor.text(this._preset.author);
        this._domVersions.text(this._preset.firmwareVersion?.join("; "));
        this._domKeywords.text(this._preset.keywords?.join("; "));
        this._domOfficialTrue.toggle(this._preset.official);
        this._domOfficialFalse.toggle(!this._preset.official);

        i18n.localizePage();
        this._domWrapperDiv.toggle(true);
        this._onLoadedCallback();
    }

    _readDom()
    {
        this._domTitle = this._domWrapperDiv.find('.preset_title_panel_title');
        this._domCategory = this._domWrapperDiv.find('.preset_title_panel_category');
        this._domAuthor = this._domWrapperDiv.find('.preset_title_panel_author_text');
        this._domKeywords = this._domWrapperDiv.find('.preset_title_panel_keywords_text');
        this._domVersions = this._domWrapperDiv.find('.preset_title_panel_versions_text');
        this._domOfficialTrue = this._domWrapperDiv.find('.preset_title_panel_official_true');
        this._domOfficialFalse = this._domWrapperDiv.find('.preset_title_panel_official_false');
    }

    remove()
    {
        this._domWrapperDiv.remove();
    }
}
