angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esUser');
    }

  })

.factory('esUser', function($rootScope, $q, $timeout, esHttp, $state, $sce, $sanitize,
                            esSettings, CryptoUtils, esProfile, UIUtils, csWallet, csWot, csPlatform) {
  'ngInject';
  var
    constants = {
      contentTypeImagePrefix: "image/",
      ES_USER_API_ENDPOINT: "ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))"
    },
    regexp = {
      ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT)
    },
    that = this,
    listeners;

  function exact(regexpContent) {
    return new RegExp("^" + regexpContent + "$");
  }


  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet and csWot events
    listeners = [
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [user] Disable");
      removeListeners();
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [user] Enable");
      addListeners();
    }
  }

  function parseEndPoint(endpoint) {
    var matches = regexp.ES_USER_API_ENDPOINT.exec(endpoint);
    if (!matches) return;
    return {
      "dns": matches[2] || '',
      "ipv4": matches[4] || '',
      "ipv6": matches[6] || '',
      "port": matches[8] || 80
    };
  }

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.node = {
      parseEndPoint: parseEndPoint
    };
  that.settings = {
      get: esHttp.get('/user/settings/:id'),
      add: esHttp.record.post('/user/settings'),
      update: esHttp.record.post('/user/settings/:id/_update'),
    };
  that.websocket = {
      event: function() {
        return esHttp.ws('/ws/event/user/:pubkey/:locale');
      },
      change: function() {
        return esHttp.ws('/ws/_changes');
      }
    };
  that.constants = constants;

  return that;
})
;
