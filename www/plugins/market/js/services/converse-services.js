angular.module('cesium.market.converse.services', ['cesium.es.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.market;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkConverse');
    }

  })

.factory('mkConverse', function($rootScope, $q, $timeout, $translate, esHttp, UIUtils, csConfig, csWallet, Device, csSettings) {
  'ngInject';
  var
    defaultProfile,
    that = this,
    listeners,
    initialized = false;

  function onWalletReset(data) {
    data.xmpp = null;
    defaultProfile = undefined;
  }

  function textToNickname(text) {
    return text ? String(text).replace(/[^a-zA-Z0-9]+/gm, '') : '';
  }

  function onWalletLogin(data, deferred) {

    if (!data.name) {

      // Wait for profile load
      $timeout(function() {
        return onWalletLogin(data); // recursive loop
      }, 1000);
    }
    else {

      if (!initialized) {
        initialized = true;

        var isEnable = csConfig.plugins && csConfig.plugins.converse && csConfig.plugins.converse.enable;
        if (!isEnable) {
          console.debug("[market] [converse] Disabled by config (property 'plugins.converse.enable')");
          initialized = true;
        }
        else if (UIUtils.screen.isSmall()) {
          console.debug("[market] [converse] Disabled on small screen");
          initialized = true;
        }
        else {

          var nickname = data.name ? textToNickname(data.name) : data.pubkey.substring(0, 8);
          var now = new Date().getTime();
          console.debug("[market] [converse] Starting Chatroom with username {" + nickname + "}...");

          // Register plugin
          converse.plugins.add('gchange-plugin', {

            initialize: function () {
              var _converse = this._converse;

              $q.all([
                _converse.api.waitUntil('chatBoxesFetched'),
                _converse.api.waitUntil('roomsPanelRendered')
              ]).then(function () {
                console.debug("[market] [converse] Chatroom started in " + (new Date().getTime() - now) + "ms");
              });
            }
          });

          var options = angular.merge({
            "allow_muc_invitations": false,
            "auto_login": true,
            "allow_logout": true,
            "authentication": "anonymous",
            "jid": "anonymous.duniter.org",
            "auto_away": 300,
            "auto_join_on_invite": true,
            "auto_reconnect": true,
            "minimized": true,
            "auto_join_rooms": [
              "gchange@muc.duniter.org"
            ],
            "blacklisted_plugins": [
              "converse-mam",
              "converse-otr",
              "converse-register",
              "converse-vcard"
            ],
            "whitelisted_plugins": [
              "gchange-plugin"
            ],
            "bosh_service_url": "https://chat.duniter.org/http-bind/",
            "allow_registration": false,
            "show_send_button": false,
            "muc_show_join_leave": false,
            "notification_icon": "img/logo.png",
            "i18n": $translate.use()
          }, csSettings.data.plugins && csSettings.data.plugins.converse || {});

          options.auto_join_rooms = _.map(options.auto_join_rooms || [], function (room) {
            if (typeof room === "string") {
              return {
                jid: room,
                nick: nickname
              }
            }
            room.nick = nickname;
            // Minimized by default
            room.minimized = true;
            return room;
          });

          // Run initialization
          converse.initialize(options)
            .catch(console.error);
        }
      }

      // Already init
      else {
        // TODO:: close previous dialog and reconnect with the username
      }

    }

    return deferred ? deferred.resolve() && deferred.promise : $q.when();
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet events
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[market] [converse] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[market] [converse] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  // Default actions
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  that.setDefaultProfile = function(profile) {
    defaultProfile = angular.copy(profile);
  };

  return that;
})
;
