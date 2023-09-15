angular.module('cesium.es.notification.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esNotification');
    }

  })

.factory('esNotification', function($rootScope, $q, $timeout, $translate, $state,
                                    esHttp, csConfig, csSettings, csWallet, csWot, UIUtils, BMA, CryptoUtils, csPlatform, Api) {
  'ngInject';

  var
    constants = {
      MESSAGE_CODES: ['MESSAGE_RECEIVED'],
      INVITATION_CODES: ['INVITATION_TO_CERTIFY'],
      DEFAULT_LOAD_SIZE: 20
    },

    fields = {
      commons: ["type", "code", "params", "reference", "recipient", "time", "hash", "read_signature"]
    },
    that = this,
    listeners,
    api = new Api(this, 'esNotification')
  ;

  constants.EXCLUDED_CODES = constants.MESSAGE_CODES.concat(constants.INVITATION_CODES);

  that.raw = {
    postCount: esHttp.post('/user/event/_count'),
    postSearch: esHttp.post('/user/event/_search'),
    postReadById: esHttp.post('/user/event/:id/_read'),
    ws: {
      getUserEvent: esHttp.ws('/ws/event/user/:pubkey/:locale'),
      getChanges: esHttp.ws('/ws/_changes')
    }
  };

  // Create the filter query
  function createFilterQuery(pubkey, options) {
    options = options || {};
    options.codes = options.codes || {};
    options.codes.excludes = options.codes.excludes || constants.EXCLUDED_CODES;
    var query = {
      bool: {
        must: [
          {term: {recipient: pubkey}}
        ]
      }
    };

    // Includes codes
    if (options.codes && options.codes.includes) {
      query.bool.must.push({terms: { code: options.codes.includes}});
    }
    else {
      // Excludes codes
      var excludesCodes = [];
      if (!csSettings.getByPath('plugins.es.notifications.txSent', false)) {
        excludesCodes.push('TX_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.txReceived', true)) {
        excludesCodes.push('TX_RECEIVED');
      }
      if (!csSettings.getByPath('plugins.es.notifications.certSent', false)) {
        excludesCodes.push('CERT_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.certReceived', true)) {
        excludesCodes.push('CERT_RECEIVED');
      }
      if (options.codes.excludes) {
        _.forEach(options.codes.excludes, function(code) {
          excludesCodes.push(code);
        });
      }
      if (excludesCodes.length) {
        query.bool.must_not = {terms: { code: excludesCodes}};
      }
    }

    // Filter on time
    if (options.readTime) {
      query.bool.must.push({range: {time: {gt: options.readTime}}});
    }
    return query;
  }

  // Load unread notifications count
  function loadUnreadNotificationsCount(pubkey, options) {
    var request = {
      query: createFilterQuery(pubkey, options)
    };
    // Filter unread only
    request.query.bool.must.push({missing: { field : "read_signature" }});
    return that.raw.postCount(request)
      .then(function(res) {
        return res.count;
      });
  }
  // Load user events (_source, with an id)
  function loadUserEvents(pubkey, options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;
    var request = {
      query: createFilterQuery(pubkey, options),
      sort: options.sort || [
        {"time": {"order": "desc"}}
      ],
      from: options.from,
      size: options.size,
      _source: fields.commons
    };

    return that.raw.postSearch(request)
      .then(function (res) {
        if (!res.hits || !res.hits.total) return [];
        return res.hits.hits.reduce(function(res, hit) {
          var item = hit._source;
          item.id = hit._id;
          return res.concat(item);
        }, []);
      });
  }

  // Load user notifications
  function loadNotifications(pubkey, options) {
    // Load user events
    return loadUserEvents(options)
      .then(function(events) {
        // Transform into notifications
        var notifications = (events || []).reduce(function(res, event) {
          var item = new EsNotification(event, markNotificationAsRead);
          item.id = event.id;
          return res.concat(item);
        }, []);

        return csWot.extendAll(notifications);
      });
  }



  function onNewUserEvent(event) {
    if (!event || !csWallet.isLogin()) return;

    // If notification is an invitation
    if (_.contains(constants.INVITATION_CODES, event.code)) {
      api.event.raise.newInvitation(event);
      return;
    }

    // If notification is a message
    if (_.contains(constants.MESSAGE_CODES, event.code)) {
      api.event.raise.newMessage(event);
      return;
    }

    var notification = new EsNotification(event, markNotificationAsRead);
    notification.id = event.id || notification.id;

    // Extend the notification entity
    return csWot.extendAll([notification])
      .then(function() {
        if (!$rootScope.$$phase) {
          $rootScope.$apply(function() {
            addNewNotification(notification);
          });
        }
        else {
          addNewNotification(notification);
        }
      })
      .then(function() {
        return emitEsNotification(notification);
      });
  }

  function addNewNotification(notification) {
    csWallet.data.notifications = csWallet.data.notifications || {};
    csWallet.data.notifications.unreadCount++;
    api.data.raise.new(notification);
    return notification;
  }

  function htmlToPlaintext(text) {
    return text ? String(text).replace(/<[^>]*>/gm, '').replace(/&[^;]+;/gm, '')  : '';
  }

  function emitEsNotification(notification, title) {

      // If it's okay let's create a notification
      $q.all([
        $translate(title||'COMMON.NOTIFICATION.TITLE'),
        $translate(notification.message, notification)
      ])
      .then(function(res) {
        var title = htmlToPlaintext(res[0]);
        var body = htmlToPlaintext(res[1]);
        var icon = notification.avatar && notification.avatar.src || './img/logo.png';
        emitHtml5Notification(title, {
          body: body,
          icon: icon,
          lang: $translate.use(),
          tag: notification.id,
          onclick: function() {
            $rootScope.$applyAsync(function() {
              if (typeof notification.markAsRead === "function") {
                notification.markAsRead();
              }
              if (notification.state) {
                $state.go(notification.state, notification.stateParams);
              }
            });
          }
        });
      });
  }

  function emitHtml5Notification(title, options) {

    // Let's check if the browser supports notifications
    if (!("Notification" in window)) return;

    // Let's check whether notification permissions have already been granted
    if (Notification.permission === "granted") {

      // If it's okay let's create a notification
      var browserNotification = new Notification(title, options);
      browserNotification.onclick = options.onclick || browserNotification.onclick;
    }

    // Otherwise, we need to ask the user for permission
    else if (Notification.permission !== "denied") {
      Notification.requestPermission(function (permission) {
        // If the user accepts, let's create a notification
        if (permission === "granted") {
          emitHtml5Notification(title, options); // recursive call
        }
      });
    }
  }

  // Mark a notification as read
  function markNotificationAsRead(notification) {
    if (notification.read || !notification.id) return; // avoid multi call
    // Should never append (fix in Duniter4j issue #12)
    if (!notification.id) {
      console.error('[ES] [notification] Could not mark as read: no \'id\' found!', notification);
      return;
    }
    notification.read = true;
    CryptoUtils.sign(notification.hash, csWallet.data.keypair)
      .then(function(signature){
        return that.raw.postReadById(signature, {id:notification.id});
      })
      .catch(function(err) {
        console.error('[ES] [notification] Error while trying to mark event as read.', err);
      });
  }

  function onWalletReset(data) {
    data.notifications = data.notifications || {};
    data.notifications.unreadCount = null;
    // Stop listening notification
    that.raw.ws.getUserEvent().close();
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    console.debug('[ES] [notification] Loading count...');
    var now = Date.now();

    // Load unread notifications count
    loadUnreadNotificationsCount(
        data.pubkey, {
          readTime: csSettings.data.wallet ? csSettings.data.wallet.notificationReadTime : 0,
          excludeCodes: constants.EXCLUDED_CODES
        })
      .then(function(unreadCount) {
        data.notifications = data.notifications || {};
        data.notifications.unreadCount = unreadCount;
        // Emit HTML5 notification
        if (unreadCount > 0) {
          $timeout(function() {
            emitEsNotification({
              message: 'COMMON.NOTIFICATION.HAS_UNREAD',
              count: unreadCount,
              state: 'app.view_notifications'
            }, 'COMMON.APP_NAME');
          }, 500);
        }
        console.debug('[ES] [notification] Loaded count ({0}) in {1}ms'.format(unreadCount, Date.now() - now));
        deferred.resolve(data);
      })
      .catch(function(err){
        deferred.reject(err);
      })

      // Listen new events
      .then(function(){
        console.debug('[ES] [notification] Starting listen user event...');
        var userEventWs = that.raw.ws.getUserEvent();
        listeners.push(userEventWs.close);
        return userEventWs.on(onNewUserEvent,
            {pubkey: data.pubkey, locale: csSettings.data.locale.id}
          )
          .catch(function(err) {
            console.error('[ES] [notification] Unable to listen user event', err);

            // TODO : send a event to csHttp instead ?
            // And display such connectivity errors in UI
            UIUtils.alert.error('ACCOUNT.ERROR.WS_CONNECTION_FAILED');
          });
      });

    return deferred.promise;
  }

  function addListeners() {
    // Listen some events
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [notification] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [notification] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  // Register extension points
  api.registerEvent('data', 'new');
  api.registerEvent('event', 'newInvitation');
  api.registerEvent('event', 'newMessage');

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.source = {
    load: loadUserEvents
  };
  that.load = loadNotifications;
  that.unreadCount = loadUnreadNotificationsCount;
  that.html5 = {
    emit: emitHtml5Notification
  };
  that.api = api;
  that.websocket = {
      event: that.raw.ws.getUserEvent,
      change: that.raw.ws.getChanges
    };
  that.constants = constants;

  return that;
})
;
