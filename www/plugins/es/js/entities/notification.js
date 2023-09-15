


function EsNotification(json, markAsReadCallback) {

  var messagePrefixes = {
    'user': 'EVENT.USER.',
    'block': 'EVENT.BLOCK.',
    'page': 'EVENT.PAGE.',
    // gchange market record
    'market': 'EVENT.MARKET.'
  };

  var that = this;

  // Avoid undefined errors
  json = json || {};

  // DEBUG
  // console.debug('[notification] Processing a JSON: ', json);

  that.id = json.id || ('' + Date.now()); // Keep id if exists, otherwise create it from timestamp
  that.type = json.type && json.type.toLowerCase();
  that.time = json.time;
  that.hash = json.hash;
  that.read = json.read_signature ? true : false;

  that.message = json.reference && messagePrefixes[json.reference.index] ?
    messagePrefixes[json.reference.index] + json.code :
    'EVENT.' + json.code;

  that.params = json.params;

  if (markAsReadCallback && (typeof markAsReadCallback === "function") ) {
    that.markAsReadCallback = markAsReadCallback;
  }

  function _formatHash(input) {
    return input ? input.substr(0,4) + input.substr(input.length-4) : '';
  }

  that.markAsRead = function() {
    if (that.markAsReadCallback) {
      that.markAsReadCallback(that);
    }
  };

  var pubkeys, level;

  json.code = json.code || '';

  // Membership
  if (json.code.startsWith('MEMBER_')) {
    that.avatarIcon = 'ion-person';
    that.icon = 'ion-information-circled positive';
    that.state = 'app.view_wallet';
    that.medianTime = that.time;
  }

  // TX
  else if (json.code.startsWith('TX_')) {
    that.avatarIcon = 'ion-card';
    that.icon = (json.code === 'TX_SENT') ? 'ion-paper-airplane dark' : 'ion-archive balanced';
    that.medianTime = that.time;
    pubkeys = json.params.length > 0 ? json.params[0] : null;
    if (pubkeys && pubkeys.indexOf(',') == -1) {
      that.pubkey = pubkeys;
    }
    that.state = 'app.view_wallet_tx';
    that.stateParams = {refresh: true};
  }

  // Certifications
  else if (json.code.startsWith('CERT_')) {
    that.avatarIcon = (json.code === 'CERT_RECEIVED') ? 'ion-ribbon-b' : 'ion-ribbon-a';
    that.icon = (json.code === 'CERT_RECEIVED') ? 'ion-ribbon-b balanced' : 'ion-ribbon-a gray';
    that.pubkey = json.params.length > 0 ? json.params[0] : null;
    that.medianTime = that.time;
    that.state = 'app.wallet_cert';
    that.stateParams = {
      type: (json.code === 'CERT_RECEIVED') ? 'received' : 'given'
    };
  }

  // Message
  else if (json.code.startsWith('MESSAGE_')) {
    that.avatarIcon = 'ion-email';
    that.icon = 'ion-email dark';
    pubkeys = json.params.length > 0 ? json.params[0] : null;
    if (pubkeys && pubkeys.indexOf(',') === -1) {
      that.pubkey = pubkeys;
    }
    that.id = json.reference.id; // Do not care about notification ID, because notification screen use message _id
  }

  // user profile record
  else if (json.reference && json.reference.index === 'user' && json.reference.type === 'profile') {
    that.pubkey = json.params.length > 0 ? json.params[0] : null;
    that.state = 'app.user_identity';
    that.stateParams = {
      pubkey: that.pubkey,
      name: json.params && json.params[3],
    };
    if (json.code.startsWith('LIKE_')) {
      that.avatarIcon = 'ion-person';
      that.icon = 'ion-ios-heart positive';
    }
    else if (json.code.startsWith('STAR_')) {
      that.avatarIcon = 'ion-person';
      that.icon = 'ion-star gray';
    }
    else if (json.code.startsWith('FOLLOW_')) {
      that.avatarIcon = 'ion-person';
      that.icon = 'ion-ios-people gray';
    }
    else if (json.code.startsWith('ABUSE_')) {
      that.avatarIcon = 'ion-person';
      that.icon = 'ion-android-warning assertive';
    }
    if (json.code.startsWith('MODERATION_')) {
      that.state = 'app.user_identity';
      that.stateParams = {
        pubkey: json.reference.id,
        name: json.params && json.params[3],
      };
      that.avatarIcon = 'ion-alert-circled';
      that.icon = 'ion-alert-circled energized';
      // If deletion has been asked, change the message
      level = json.params && json.params[4] || 0;
      if (json.code === 'MODERATION_RECEIVED' && level == 5) {
        that.message = 'EVENT.USER.DELETION_RECEIVED';
        that.icon = 'ion-trash-a assertive';
      }
    }
    else {
      that.icon = 'ion-person dark';
      that.state = 'app.view_wallet';
    }
  }


  // Blockchain user event
  if (json.reference.type === 'block') {
    // TX crowdfunding event
    if (json.code.startsWith('CROWDFUNDING_TX_RECEIVED')) {

      // DEBUG
      console.debug('[notification] Processing a blockchain crowdfunding event: ', json);

      that.avatarIcon = 'ion-card';
      that.message = 'EVENT.MARKET.' + json.code;
      that.icon = (json.code === 'CROWDFUNDING_TX_RECEIVED') ? 'ion-archive balanced' : 'ion-paper-airplane dark';
      that.medianTime = that.time;

      that.state = 'app.market_view_record';
      that.stateParams = {
        id: json.params[2],
        title: json.params[3],
        refresh: true
      };
    }

    // Blockchain user event
    else if (json.code === 'LINK_PUBKEY' || json.code === 'UNLINK_PUBKEY') {

      // DEBUG
      console.debug('[notification] Processing a blockchain user event: ', json);

      if (json.code === 'LINK_PUBKEY') {
        var uid = that.params[1];
        that.avatarIcon = uid ? 'ion-person' : 'ion-key';
        that.message = 'EVENT.USER.' + (uid ? 'LINK_UID' : 'LINK_PUBKEY');
        that.icon = 'ion-lock-combination positive';
      }
      // Unlink
      else {
        that.avatarIcon = 'ion-person';
        that.message = 'EVENT.USER.UNLINK_PUBKEY';
        that.icon = 'ion-alert-circled energized';
      }
    }
  }

  // page record
  else if (json.reference && json.reference.index === 'page') {
    that.pubkey = json.params.length > 0 ? json.params[0] : null;
    that.avatarIcon = 'ion-social-buffer';
    if (json.reference.anchor) {
      that.icon = 'ion-ios-chatbubble-outline dark';
      that.state = 'app.view_page_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1],
        anchor: _formatHash(json.reference.anchor)
      };
    }
    else {
      that.icon = 'ion-social-buffer dark';
      that.state = 'app.view_page';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1]
      };
    }

    if (json.code.startsWith('LIKE_')) {
      that.icon = 'ion-ios-heart positive';
      that.state = 'app.user_identity';
      that.stateParams = {
        pubkey: that.pubkey,
        name: json.params && json.params[3],
      };
    }
    else if (json.code.startsWith('FOLLOW_')) {
      that.avatarIcon = 'ion-person';
      that.state = 'app.user_identity';
      that.stateParams = {
        pubkey: that.pubkey,
        name: json.params && json.params[3],
      };
    }
    else if (json.code.startsWith('ABUSE_')) {
      that.icon = 'ion-alert-circled energized';
      that.state = 'app.user_identity';
      that.stateParams = {
        pubkey: that.pubkey,
        name: json.params && json.params[3],
      };
    }
    else if (json.code.startsWith('MODERATION_')) {
      that.avatarIcon = 'ion-alert-circled';
      that.icon = 'ion-alert-circled energized';

      // If deletion has been asked, change the message
      level = json.params && json.params[4] || 0;
      if (json.code === 'MODERATION_RECEIVED' && level == 5) {
        that.message = 'EVENT.PAGE.DELETION_RECEIVED';
        that.icon = 'ion-trash-a assertive';
      }
    }
  }


  // market record
  else if (json.reference && json.reference.index === 'market') {
    that.avatarIcon = 'ion-speakerphone';
    that.pubkey = json.params.length > 0 ? json.params[0] : null;
    if (json.reference.anchor) {
      that.icon = 'ion-ios-chatbubble-outline dark';
      that.state = 'app.market_view_record_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[2],
        anchor: _formatHash(json.reference.anchor)
      };
    }
    else {
      that.icon = 'ion-speakerphone dark';
      that.state = 'app.market_view_record';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[2]};
    }

    if (json.code.startsWith('LIKE_')) {
      that.icon = 'ion-ios-heart positive';
    }
    else if (json.code.startsWith('FOLLOW_')) {
      that.avatarIcon = 'ion-person';
    }
    else if (json.code.startsWith('ABUSE_')) {
      that.icon = 'ion-alert-circled energized';
    }
    else if (json.code.startsWith('MODERATION_')) {
      that.avatarIcon = 'ion-alert-circled';
      that.icon = 'ion-alert-circled energized';

      // If deletion has been asked, change the message
      if (json.code === 'MODERATION_RECEIVED' && level == 5) {
        that.message = 'EVENT.MARKET.DELETION_RECEIVED';
        that.icon = 'ion-trash-a assertive';
      }
    }

  }

  // info message
  else if (json.type === 'INFO') {
    that.avatarIcon = 'ion-information';
    that.icon = 'ion-information-circled positive';
  }
  // warn message
  else if (json.type === 'WARN') {
    that.avatarIcon = 'ion-alert-circled';
    that.icon = 'ion-alert-circled energized';
  }
  // error message
  else if (json.type === 'ERROR') {
    that.avatarIcon = 'ion-close';
    that.icon = 'ion-close-circled assertive';
  }

  return that;
}
