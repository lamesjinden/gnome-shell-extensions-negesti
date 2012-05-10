const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;

const Gdk = imports.gi.Gdk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = new Me.imports.utils.Utils();

const Lang = imports.lang;
const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

let createSlider = function(configName) {
  let ret = new Gtk.Scale({digits: 0, sensitive: true, orientation: Gtk.Orientation.HORIZONTAL, margin_right: 6, margin_left: 6});
  ret.set_range(0, 100);
  ret.set_value(Utils.getNumber(configName));
  ret.set_value_pos(Gtk.PositionType.RIGHT);
  ret.connect("value-changed", function(obj, userData) {
    Utils.setParameter(configName, obj.get_value());
  });
  return ret;
}

const PutWindowSettingsWidget = new GObject.Class({
  Name: 'PutWindow.Prefs.PutWindowSettingsWidget',
  GTypeName: 'PutWindowSettingsWidget',
  Extends: Gtk.Box,

  _init : function(params) {
    this.parent(params);
    this.orientation = Gtk.Orientation.VERTICAL;

    // width and height when window is centered
    let mainConfig = new Gtk.Grid();
    mainConfig.width = 4;
    mainConfig.margin = 4;
    mainConfig.column_homogeneous = true;

    mainConfig.attach(new Gtk.Label({label: "Center width:", halign: Gtk.Align.START, margin_left:2 }), 0, 0, 1, 1);
    let scaleCW = createSlider(Utils.CENTER_WIDTH);
    mainConfig.attach(scaleCW, 1, 0, 3, 1);

    mainConfig.attach(new Gtk.Label({label: "Center height:", halign:Gtk.Align.START, margin_left:2 }), 0, 1, 1, 1);
    let scaleCH = createSlider(Utils.CENTER_HEIGHT);
    mainConfig.attach(scaleCH, 1, 1, 3, 1);

    // width and height when window is moved to a side or corner
    mainConfig.attach(new Gtk.Label({label: "Side width:", halign:Gtk.Align.START, margin_left:2 }), 0, 2, 1, 1);
    let scaleCoW = createSlider(Utils.SIDE_WIDTH);
    mainConfig.attach(scaleCoW, 1, 2, 3, 1);

    mainConfig.attach(new Gtk.Label({label: "Side height:", halign:Gtk.Align.START, margin_left:2 }), 0, 3, 1, 1);
    let scaleCoH = createSlider(Utils.SIDE_HEIGHT);
    mainConfig.attach(scaleCoH, 1, 3, 3, 1);

    this.pack_start(mainConfig, false, false, 0);
    this.pack_start(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}), false, false, 1);

    // Application based settings
    this.pack_start(new PutWindowLocationWidget(), true, true, 2);

    let buttonPanel = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, margin: 4});

    let img = new Gtk.Image({stock: Gtk.STOCK_SAVE})

    let saveButton = new Gtk.Button({label: Gtk.STOCK_SAVE});
    saveButton.set_use_stock(true);

    saveButton.connect("button-press-event", function() {
      Utils.saveFile();
    });

    buttonPanel.pack_end(saveButton, false, false, 2);

    this.pack_start(buttonPanel, false, false, 0);
  }
});

const PutWindowLocationWidget = new GObject.Class({
  Name: 'PutWindow.Prefs.PutWindowLocationWidget',
  GTypeName: 'PutWindowLocationWidget',
  Extends: Gtk.Box,
  _init: function(params) {
    this.parent(params);
    this.width = 4;
    this.margin = 4;
    this.orientation= Gtk.Orientation.HORIZONTAL;
    this.column_homogeneous = true;

    this._selectedApp = null;
    this._apps = [];

    this.treeModel = new Gtk.ListStore();
    this.treeModel.set_column_types([GObject.TYPE_STRING]);

    this.treeView = new Gtk.TreeView({model: this.treeModel, headers_visible: false});

    this.treeView.get_style_context().add_class(Gtk.STYLE_CLASS_RAISED);
    let column = new Gtk.TreeViewColumn();
    let renderer = new Gtk.CellRendererText();
    column.pack_start(renderer, true);
    column.add_attribute(renderer, 'text', 0);

    let appsLength = 1;
     if (Utils.getParameter("locations", null) != null) {
      let apps = Object.getOwnPropertyNames(Utils.getParameter("locations"));
      appsLength = apps.length;
      apps.sort();
      for(let i=0; i< appsLength; i++) {
        let iter = this.treeModel.append();
        this.treeModel.set(iter, [0], [ apps[i] ]);
        this._apps.push({name: apps[i], listElement: iter});
      }
    }

    this.treeView.append_column(column);

    this.treeView.get_selection().connect("changed",
      Lang.bind(this, function(selection) {
        let s = selection.get_selected();
        let selectedValue = s[1].get_value(s[2], 0);
        if (this._selectedApp != null && this._selectedApp == selectedValue) {
          return;
        }

        this._removeAppButton.set_sensitive(true);
        this._updateAppContainerContent(selectedValue, this.createAppWidgets(selectedValue));
      })
    );

    let leftPanel = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    leftPanel.pack_start(this.treeView, true, true, 0);
    let toolbar = new Gtk.Toolbar({});
    toolbar.set_icon_size(Gtk.IconSize.MENU);
    toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR)

    this._removeAppButton = new Gtk.ToolButton( {stock_id: Gtk.STOCK_REMOVE} );
    this._removeAppButton.set_sensitive(false);

    this._removeAppButton.connect("clicked",
      Lang.bind(this, function() {

        let dialog = new Gtk.MessageDialog({
          modal: true,
          message_type: Gtk.MessageType.QUESTION,
          title: "Delete application '" + this._selectedApp + "'?",
          text: "Are you sure to delete the configuration for  '" + this._selectedApp + "'?"
        });

        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        dialog.add_button(Gtk.STOCK_DELETE, Gtk.ResponseType.DELETE_EVENT);

        dialog.connect("response",
          Lang.bind(this, function(dialog, responseType) {
            if (responseType == Gtk.ResponseType.DELETE_EVENT) {
              for (let i=0; i< this._apps.length; i++) {
                if (this._apps[i].name != this._selectedApp) {
                  continue;
                }
                // remove the widget, unset the parameter and remove the entry from _apps array
                this.treeModel.remove(this._apps[i].listElement);
                Utils.unsetParameter("locations." + this._apps[i].name);
                this._apps.pop(apps[i]);
                break;
              }
            }
          })
        );
        dialog.run();
        dialog.destroy();

      })
    );

    this._addAppButton = new Gtk.ToolButton( {stock_id:Gtk.STOCK_ADD} );
    this._addAppButton.connect("clicked",
      Lang.bind(this, function() {

        let dialog = new Gtk.MessageDialog({
          modal: false,
          message_type: Gtk.MessageType.QUESTION,
          title: "Add application",
          text: "Please select the application you want to add"
        });

        let appModel = new Gtk.ListStore();
        appModel.set_column_types([ GObject.TYPE_INT, GObject.TYPE_STRING ]);

        let appSelector = new Gtk.ComboBox({ model: appModel, hexpand: true });
        appSelector.get_style_context().add_class(Gtk.STYLE_CLASS_RAISED);

        let renderer = new Gtk.CellRendererText();
        appSelector.pack_start(renderer, true);
        appSelector.add_attribute(renderer, 'text', 1);

        let apps = this._getRunningApps(this._apps);
        let appsLength = apps.length;

        for (let i = 0; i < appsLength; i++ ) {
          let iter = appModel.append();
          appModel.set(iter, [0, 1], apps[i] );
        }

        appSelector.connect('changed',
          Lang.bind(this, function(combo) {
            let selection = combo.get_model().get_value(combo.get_active_iter()[1], 1);
            let configPath = "locations." + selection;
            Utils.setParameter(configPath, Utils.START_CONFIG);

            this._addToTreeView(selection, true);

            this._updateAppContainerContent(selection, this.createAppWidgets(selection));
            dialog.destroy();
          })
        );
        //box.pack_start(appSelector, true, true, 2);

        dialog.get_action_area().add(appSelector);
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);

        dialog.set_default_size(350, 100);
        dialog.show_all();
        dialog.run();
        dialog.destroy();
      })
    );

    toolbar.insert(this._removeAppButton, 0);
    toolbar.insert(this._addAppButton, 1);
    leftPanel.pack_start(toolbar, false, false, 0);

    this.add(leftPanel);

    this._appContainer = new Gtk.Frame({ hexpand: true});
    this._appContainer.add(new Gtk.Label({label: _("Select an application to configure using the list on the left side.") }));
    this.add(this._appContainer);
  },

  _getRunningApps: function(exclude) {
    let ret = [];
    ret.push( [ret.length, "test0"] );
    ret.push( [ret.length, "test1"] );
    ret.push( [ret.length, "test2"] );
    ret.push( [ret.length, "test3"] );
    return ret;
    /*
    if (!this._appSystem) {
      this._appSystem = Shell.AppSystem.get_default();
    }

    let exludeLength = exclude.length;
    let apps = this._appSystem.get_running();
    let ret = [];

    for (let i=0; i < apps.length; i++) {
      let wm =  apps[i].get_windows()[0].get_wm_class(),
        found = false;
      // dont add excluded entries to the returned value
      for (let j=0; j < exludeLength; j++) {
        if (exclude[j] == wm) {
          found = true;
          break;
        }
      }

      if (!found) {
        ret.push( [ret.length, wm]);
      }
    }
    return ret;
    */
  },

  _addApplication: function() {
    let dialog = new Gtk.Dialog({
      title: _("Create new matching rule"),
      transient_for: this.get_toplevel(),
      modal: true
    });

    dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
    dialog.add_button(_("Add"), Gtk.ResponseType.OK);
    dialog.set_default_response(Gtk.ResponseType.OK);

    dialog._appChooser = new Gtk.AppChooserWidget({ show_all: true });
    dialog.get_content_area().pack_start(dialog._appChooser, true, true, 0);

    dialog.connect('response',
      Lang.bind(this, function(dialog, id) {
        if (id != Gtk.ResponseType.OK) {
          dialog.destroy();
          return;
        }


        let appInfo = dialog._appChooser.get_app_info();
        if (!appInfo) {
          return;
        }

        let selection = appInfo.get_id();
        let configPath = "locations." + selection;
        Utils.setParameter(configPath, Utils.START_CONFIG);

        this._addToTreeView(selection, true);

        this._updateAppContainerContent(selection, this.createAppWidgets(selection));
        dialog.destroy();
      })
    );
    dialog.show_all();
  },

  createAppWidgets: function(appName) {

    let configLocation = "locations." + appName + ".";

    let ret = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_left: 10 });

    let autoMoveBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL});
    autoMoveBox.pack_start(new Gtk.Label({label: "Auto-Move window when created", xalign: 0}), true, true, 0);

    let btn = new Gtk.Switch({ active: Utils.getBoolean(configLocation + "autoMove")});
    btn.connect("notify::active", function(sw) {
      Utils.setParameter(configLocation + "autoMove", sw.get_active());
    })
    autoMoveBox.pack_end(btn, false, false, 0);

    ret.pack_start(autoMoveBox, false, false, 0);


    // widgets for the positions defined for the app
    let positions = Utils.getParameter(configLocation + "positions", { positions: []});
    let positionSize = positions.length;

    this.locationBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    for (let i = 0; i < positionSize; i++) {
      this.locationBox.pack_start(this._generateOnePositionWidgets(configLocation, i, positionSize), false, false, 0);
    }
    ret.pack_start(this.locationBox, false, false, 0);

    return ret;
  },

  _updateAppContainerContent: function(appName, widget) {
    this._selectedApp = appName;
    if (this._appContainer.get_child()) {
      this._appContainer.get_child().destroy();
    }
    this._appContainer.add(widget);
    this._appContainer.show_all();
  },

  _addToTreeView: function(value, select) {
    let iter = this.treeModel.append();
    this.treeModel.set(iter, [0], [ value ]);
    this._apps.push({name: value, listElement: iter});

    if (select && select == true) {
      this.treeView.get_selection().select_iter(iter);
    }
  },

  _generateOnePositionWidgets: function(configLocation, index, positionSize) {

    let loc = configLocation + "positions." + index + ".",
        top = 0;

    let grid = new Gtk.Grid({ hexpand: true});
    grid.locationIndex = index;
    // screen ComboBox
    let screenModel = new Gtk.ListStore();
    screenModel.set_column_types([GObject.TYPE_STRING, GObject.TYPE_INT]);

    let screenSelector = new Gtk.ComboBox({ model: screenModel, hexpand: true, margin_top: 6, margin_bottom: 6 });
    screenSelector.get_style_context().add_class(Gtk.STYLE_CLASS_RAISED);

    let screenSelectRenderer = new Gtk.CellRendererText();
    screenSelector.pack_start(screenSelectRenderer, true);
    screenSelector.add_attribute(screenSelectRenderer, 'text', 0);


    let numScreens =  Gdk.Screen.get_default().get_n_monitors();
    for (let j = 0; j < numScreens; j++ ) {
      let iter = screenModel.append();
      screenModel.set(iter, [0, 1], ["Screen " + (j+1), j]);
    }

    screenSelector.set_active(Utils.getNumber(loc + "screen", 0));
    screenSelector.connect('changed',
      Lang.bind(this, function(combo) {
        Utils.setParameter(loc + "screen", combo.get_model().get_value(combo.get_active_iter()[1], 1));
      })
    );

    grid.attach(new Gtk.Label({label: "Screen", xalign: 0}), 0, top, 3, 1);
    grid.attach(screenSelector, 3, top, 1, 1);

    // add/delete buttons
    let buttonContainer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    let addButton = new Gtk.ToolButton({ stock_id: Gtk.STOCK_ADD });
    addButton.connect("clicked",
      Lang.bind(this, function() {

        let length = Utils.getParameter(configLocation + "positions", []).length;
        let newLocation = configLocation + "positions." + length;
        Utils.setParameter(newLocation, {x: 0, y: 0, width: 100, height: 100, screen: 0} );

        this.locationBox.pack_start(this._generateOnePositionWidgets(configLocation, length, length), false, false, 0);
        this.locationBox.show_all();
      })
    );
    buttonContainer.pack_end(addButton, false, false, 0)

    // don't delete the first position
    if (index > 0) {
      let deleteButton = new Gtk.ToolButton({ stock_id: Gtk.STOCK_REMOVE });
      deleteButton.connect("clicked",
        Lang.bind(this, function() {
          Utils.unsetParameter(configLocation + "positions." + index);
          this.locationBox.remove(grid);

        })
      );
      buttonContainer.pack_end(deleteButton, false, false, 0)
    }

    grid.attach(buttonContainer, 4, top, 1, 1);

    // sliders for widht, height, x, y
    top++;
    let scaleW = createSlider(loc + "width");
    grid.attach(new Gtk.Label({label: "width", xalign: 0}), 0, top, 1, 1);
    grid.attach(scaleW, 1, top, 4, 1);

    top++;
    let scaleH = createSlider(loc + "height");
    grid.attach(new Gtk.Label({label: "Height", xalign: 0}), 0, top, 1, 1);
    grid.attach(scaleH, 1, top, 4, 1);

    top++;
    let scaleX = createSlider(loc + "x");
    grid.attach(new Gtk.Label({label: "X-Position", xalign: 0}), 0, top, 1, 1);
    grid.attach(scaleX, 1, top, 4, 1);

    top++;
    let scaleY = createSlider(loc + "y");
    grid.attach(new Gtk.Label({label: "Y-Position", xalign: 0}), 0, top, 1, 1);
    grid.attach(scaleY, 1, top, 4, 1);

    if (index < (positionSize -1 )) {
      top++;
      grid.attach(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL, margin_top: 4, margin_bottom: 4}), 0, top, 6, 1);
    }
    return grid;
  }
})


function init() {

}

function buildPrefsWidget() {
    let widget = new PutWindowSettingsWidget();
    widget.show_all();
    return widget;
};
