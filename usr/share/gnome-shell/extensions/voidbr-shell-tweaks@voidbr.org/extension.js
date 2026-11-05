// VoidBR Shell Tweaks
//   - relógio do painel em duas linhas: hora em cima, data embaixo
//   - login abre na área de trabalho, sem a Visão Geral
//
// Copyright (c) 2026, Vilmar Catafesta <vcatafesta@gmail.com>
// Copyright (c) 2026, VoidLinuxBR Team
// SPDX-License-Identifier: MIT

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// só a primeira ativação da sessão mexe na Visão Geral (depois de
// desbloquear a tela, por exemplo, o enable() roda de novo)
let firstEnable = true;

export default class VoidBRShellTweaks extends Extension {
    enable() {
        this._enableNoOverview();
        this._enableTwoLineClock();
        this._enableFavoritesRelayout();
    }

    disable() {
        this._disableFavoritesRelayout();
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

    // --- barra atualiza na hora ao fixar/desafixar app ------------------
    // Com o Dash to Panel em comprimento dinâmico, o ícone novo só aparecia
    // na próxima reorganização do painel; forçamos essa reorganização.
    _enableFavoritesRelayout() {
        this._favorites = AppFavorites.getAppFavorites();
        this._favoritesId = this._favorites.connect('changed', () => {
            if (this._relayoutId)
                return;
            this._relayoutId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this._relayoutId = 0;
                for (let a = Main.panel; a && a !== Main.layoutManager.uiGroup; a = a.get_parent())
                    a.queue_relayout();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _disableFavoritesRelayout() {
        if (this._relayoutId) {
            GLib.source_remove(this._relayoutId);
            this._relayoutId = 0;
        }
        if (this._favoritesId) {
            this._favorites.disconnect(this._favoritesId);
            this._favoritesId = 0;
        }
        this._favorites = null;
    }

    // --- relógio em duas linhas -----------------------------------------
    _enableTwoLineClock() {
        const dateMenu = Main.panel.statusArea.dateMenu;
        if (!dateMenu)
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

        this._clockText.set_markup(
            `<span weight="bold">${GLib.markup_escape_text(time, -1)}</span>\n` +
            `<span size="small">${GLib.markup_escape_text(date, -1)}</span>`);
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
