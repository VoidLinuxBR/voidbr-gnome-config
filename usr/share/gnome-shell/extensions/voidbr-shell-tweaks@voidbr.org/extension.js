// VoidBR Shell Tweaks
//   - relógio do painel em duas linhas: hora em cima, data embaixo
//   - login abre na área de trabalho, sem a Visão Geral
//
// Copyright (c) 2026, Vilmar Catafesta <vcatafesta@gmail.com>
// Copyright (c) 2026, VoidLinuxBR Team
// SPDX-License-Identifier: MIT

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// só a primeira ativação da sessão mexe na Visão Geral (depois de
// desbloquear a tela, por exemplo, o enable() roda de novo)
let firstEnable = true;

export default class VoidBRShellTweaks extends Extension {
    enable() {
        // chaves em org.gnome.shell.extensions.voidbr-shell-tweaks
        // (o voidbr-gnome-tweaks liga e desliga cada parte por elas)
        this._settings = this.getSettings();

        if (this._settings.get_boolean('no-overview'))
            this._enableNoOverview();
        else
            firstEnable = false;

        if (this._settings.get_boolean('two-line-clock'))
            this._enableTwoLineClock();

        this._clockSettingId = this._settings.connect('changed::two-line-clock', () => {
            if (this._settings.get_boolean('two-line-clock'))
                this._enableTwoLineClock();
            else
                this._disableTwoLineClock();
        });
    }

    disable() {
        if (this._clockSettingId) {
            this._settings.disconnect(this._clockSettingId);
            this._clockSettingId = 0;
        }
        this._settings = null;

        this._disableTwoLineClock();
        this._disableNoOverview();
    }

    // --- sem Visão Geral no login ---------------------------------------
    // No GNOME 45+ as extensões carregam de forma assíncrona, então o enable()
    // pode chegar antes ou depois de o Shell decidir abrir a Visão Geral:
    //   - antes: desligamos hasOverview só até o startup terminar;
    //   - depois: fechamos a Visão Geral na primeira ativação da sessão.
    _enableNoOverview() {
        if (!firstEnable)
            return;
        firstEnable = false;

        if (Main.layoutManager._startingUp) {
            this._realHasOverview = Main.sessionMode.hasOverview;
            Main.sessionMode.hasOverview = false;

            this._startupId = Main.layoutManager.connect('startup-complete', () => {
                Main.sessionMode.hasOverview = this._realHasOverview;
                this._realHasOverview = undefined;
                this._disconnectStartup();
                this._hideOverview();
            });
        } else {
            this._hideOverview();
        }
    }

    _hideOverview() {
        if (Main.overview.visible)
            Main.overview.hide();
    }

    _disableNoOverview() {
        if (this._realHasOverview !== undefined) {
            Main.sessionMode.hasOverview = this._realHasOverview;
            this._realHasOverview = undefined;
        }
        this._disconnectStartup();
    }

    _disconnectStartup() {
        if (this._startupId) {
            Main.layoutManager.disconnect(this._startupId);
            this._startupId = 0;
        }
    }

    // --- relógio em duas linhas -----------------------------------------
    _enableTwoLineClock() {
        const dateMenu = Main.panel.statusArea.dateMenu;
        if (!dateMenu || this._dateMenu)
            return;

        this._dateMenu = dateMenu;
        this._clockText = dateMenu._clockDisplay.clutter_text;
        this._oldEllipsize = this._clockText.ellipsize;
        this._oldAlignment = this._clockText.line_alignment;

        this._clockText.ellipsize = Pango.EllipsizeMode.NONE;
        this._clockText.line_alignment = Pango.Alignment.CENTER;

        this._clockId = dateMenu._clock.connect('notify::clock', () => this._updateClock());
        this._updateClock();
    }

    _updateClock() {
        const now = GLib.DateTime.new_now_local();
        const time = now.format('%H:%M');
        // ex.: "qua 4 nov" (dia sem zero à esquerda)
        const date = `${now.format('%a')} ${now.get_day_of_month()} ${now.format('%b')}`;

        // hora em destaque (15pt, negrito) e data em 12pt; o "pt" no size é do Pango >= 1.50
        this._clockText.set_markup(
            `<span weight="bold" size="15pt">${GLib.markup_escape_text(time, -1)}</span>\n` +
            `<span size="12pt">${GLib.markup_escape_text(date, -1)}</span>`);
    }

    _disableTwoLineClock() {
        if (!this._dateMenu)
            return;

        if (this._clockId) {
            this._dateMenu._clock.disconnect(this._clockId);
            this._clockId = 0;
        }

        this._clockText.ellipsize = this._oldEllipsize;
        this._clockText.line_alignment = this._oldAlignment;
        this._clockText.set_use_markup(false);
        this._dateMenu._clockDisplay.text = this._dateMenu._clock.clock;

        this._clockText = null;
        this._dateMenu = null;
    }
}
