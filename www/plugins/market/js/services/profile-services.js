angular.module('cesium.market.profile.services', ['cesium.services', 'cesium.es.http.services',  'cesium.es.notification.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('mkProfile');
    }

  })

.factory('mkProfile', function($rootScope, $q, esHttp, csWot, csPlatform, esNotification) {
  'ngInject';

  var
    that = this,
    listeners;

  function loadLinkPubkeyEvents(pubkey) {

    var options = {
      from: 0,
      size: 1000,
      codes: {
        includes: ['LINK_PUBKEY', 'UNLINK_PUBKEY']
      },
      // Sort by time ASC
      sort: { "time" : {"order" : "asc"}}
    };
    return esNotification.source.load(pubkey, options)
      .then(function(events) {

        var pubkeys = [];

        // Reduce link event
        var accounts = (events || []).reduce(function(res, event) {
          var currency = event.params[0];
          var pubkey = event.params[1];
          if (pubkey && event.code === 'LINK_PUBKEY') {
            pubkeys.push(pubkey)
            var uid = event.params[2];
            return res.concat({currency: currency, pubkey: pubkey, uid: uid})
          }
          else if (pubkey) {
            return _.reject(res, function(item) {
              return item.pubkey === pubkey;
            });
            pubkeys = _.without(res, pubkey);
          }
        }, []);

        var events = _.map(accounts, function(account) {
          return {
            type: 'pubkey',
            message: account.uid ? 'EVENT.WOT.LINK_UID' : 'EVENT.WOT.LINK_PUBKEY',
            messageParams: account
          }
        });
        return {
          events: events,
          pubkeys: pubkeys
        }
      })
      .catch(function(err) {
        console.error('[market] [profile] Error while getting linked accounts: ', err);
        // Continue
      });
  }

  function onWotLoad(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey) {
      deferred.resolve();
      return deferred.promise;
    }

    console.debug("[market] [profile] Load linked events " + data.pubkey);

    // Load link pubkeys event
    loadLinkPubkeyEvents(data.pubkey)
      .then(function(res) {
        if (res && res.events && res.events.length) {
          data.events = (data.events || []).concat(res.events);
        }
        if (res && res.pubkeys && res.pubkeys.length === 1) {
          data.profile = data.profile || {};
          data.profile.pubkey = data.profile.pubkey || res.pubkeys[0];
        }
        deferred.resolve(data);
      })
      .catch(function(err) {
        deferred.reject(data);
      });
    return deferred.promise;
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWot events
    listeners = [
      csWot.api.data.on.load($rootScope, onWotLoad, this),
      //csWot.api.data.on.search($rootScope, onWotSearch, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[market] [profile] Disable");
      removeListeners();
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[market] [profile] Enable");
      addListeners();
    }
  }

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  return {
    loadLinkPubkeyEvents: loadLinkPubkeyEvents
  };
})
;
