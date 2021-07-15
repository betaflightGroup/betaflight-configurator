'use strict';

class PresetsDetailedDialog
{
    constructor(domDialog, cliEngine, presetsRepo)
    {
        this._domDialog = domDialog;
        this._cliEngine = cliEngine;
        this._presetsRepo = presetsRepo;
    }

    load(onLoadedCallback)
    {
        this._onLoadedCallback = onLoadedCallback;
        this._domDialog.load("./tabs/presets/DetailedDialog/PresetsDetailedDialog.html", () =>
        {
            this._setupdialog();
        });
    }

    open(preset)
    {
        this._preset = preset;
        this._updatePresetUi();
        this._domDialog[0].showModal();
    }

    _updatePresetUi()
    {
        this._domDescription.html(this._preset.description?.join("<br/>"));

        this._domGitHubLink.attr("href", this._presetsRepo.getPresetGitHubLink(this._preset));
        this._titlePanel.empty();
        const presetPanel = new PresetTitlePanel(this._titlePanel, this._preset, false, ()=>{ this._setLoadingState(false); });
        this._setLoadingState(false);
    }

    _setLoadingState(isLoading)
    {
        this._domProperties.toggle(!isLoading);
        this._domLoading.toggle(isLoading);
        this._domButtonApply.toggle(!isLoading);
    }

    _readDom()
    {
        this._domButtonApply = $('#presets_detailed_dialog_applybtn');
        this._domButtonCancel = $('#presets_detailed_dialog_closebtn');
        this._domLoading = $('#presets_detailed_dialog_loading');
        this._domProperties = $('#presets_detailed_dialog_properties');
        this._titlePanel = $('.preset_detailed_dialog_title_panel');
        this._domDescription = this._domDialog.find('.preset_detailed_dialog_description');
        this._domGitHubLink = this._domDialog.find('#presets_github_link');
    }

    _setupdialog()
    {
        i18n.localizePage();
        this._readDom();

        this._domButtonApply.on("click", () =>
        {
            this._onApplyButtonClicked();
        });
        this._domButtonCancel.on("click", () =>
        {
            this._onCancelButtonClicked();
        });

        this._onLoadedCallback();
    }

    _onApplyButtonClicked()
    {
        this._setLoadingState(true);
        this._presetsRepo.loadPreset(this._preset)
        .then(txt => {
            this._cliEngine.send(txt, () => { this._onPresetApplied(); });
        })
        .catch(err => {
            console.log(err);
        });
    }

    _onPresetApplied()
    {
        this._onCancelButtonClicked();
    }

    _onCancelButtonClicked()
    {
        this._domDialog[0].close();
    }
}
