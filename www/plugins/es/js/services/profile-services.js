angular.module('cesium.es.profile.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esProfile');
    }

  })

.factory('esProfile', function($rootScope, $q, esHttp, SocialUtils, csWot, csWallet, csPlatform) {
  'ngInject';

  var
    that = this,
    listeners;

  that.raw = {
    getFields: esHttp.get('/user/profile/:id?&_source_exclude=avatar._content&_source=:fields'),
    get: esHttp.get('/user/profile/:id?&_source_exclude=avatar._content'),
    getAll: esHttp.get('/user/profile/:id'),
    search: esHttp.post('/user/profile/_search'),
    mixedSearch: esHttp.post('/user,page/profile,record/_search'),
    countLikes: esHttp.like.count('user', 'profile')
  };

  function getAvatarAndName(pubkey) {
    return that.raw.getFields({id: pubkey, fields: 'title,avatar._content_type,pubkey,creationTime,time'})
      .then(function(res) {
        var profile;
        if (res && res._source) {
          // name
          profile = {name: res._source.title, pubkey: res._source.pubkey};
          // avatar
          profile.avatar = esHttp.image.fromHit(res, 'avatar');
          // creationTime
          profile.creationTime = res._source.creationTime;
          profile.time = res._source.time;
        }
        return profile;
      })
      .catch(function(err){
        // no profile defined
        if (err && err.ucode && err.ucode == 404) {
          return null;
        }
        else {
          throw err;
        }
      });
  }

  function getProfile(pubkey, options) {
    options = options || {};

    var get = options.raw ? that.raw.getAll : that.raw.get;
    return get({id: pubkey})
        .then(function(res) {
          if (!res || !res.found || !res._source) return undefined;

          var profile = {
            name: res._source.title,
            source: res._source
          };

          // Avoid too long name (workaround for #308)
          if (profile.name && profile.name.length > 30) {
            // now using truncText filter
            // profile.name = profile.name.substr(0, 27) + '...';
          }

          // avatar
          profile.avatar = esHttp.image.fromHit(res, 'avatar');

          // description
          if (!options.raw) {
            profile.description = esHttp.util.parseAsHtml(profile.source.description);
          }

          // Social url must be unique in socials links - Workaround for issue #306:
          if (profile.source.socials && profile.source.socials.length) {
            profile.source.socials = _.uniq(profile.source.socials, false, function (social) {
              return social.url;
            });
          }

          if (!csWallet.isLogin()) {
            // Exclude crypted socials
            profile.source.socials = _.filter(profile.source.socials, function(social) {
              return social.type != 'curve25519';
            });
          }
          else {
            // decrypt socials (if login)
            return SocialUtils.open(profile.source.socials, pubkey)
                .then(function(){
                  //console.log(profile.source.socials);
                  // Exclude invalid decrypted socials
                  //profile.source.socials = _.where(profile.source.socials, {valid: true});
                  return profile;
                });
          }

          return profile;
        })
        .catch(function(err){
          // no profile defined
          if (err && err.ucode && err.ucode == 404) {
            return null;
          }
          else {
            throw err;
          }
        });
  }

  function fillAvatars(datas, pubkeyAtributeName) {
    return onWotSearch(null, datas, pubkeyAtributeName);
  }

  function _fillSearchResultFromHit(data, hit, avatarFieldName) {
    data.avatar = data.avatar || esHttp.image.fromHit(hit, avatarFieldName||'avatar');
    // name (basic or highlighted)
    data.name = hit._source.title;
    // Avoid too long name (workaround for #308)
    if (data.name && data.name.length > 30) {
      // now using truncText filter
      //data.name = data.name.substr(0, 27) + '...';
    }
    data.description = hit._source.description || data.description;
    data.city = hit._source.city || data.city;
    data.creationTime = hit._source.creationTime || data.creationTime;
    data.time = hit._source.time || data.time;

    // Fecth payment pubkey (need by Gchange)
    if (hit._source.pubkey) {
      data.pubkey = hit._source.pubkey;
    }

    if (hit.highlight) {
      if (hit.highlight.title) {
        data.name = hit.highlight.title[0];
      }
      if (hit.highlight.tags) {
        data.tags = hit.highlight.tags.reduce(function(res, tag){
          return res.concat(tag.replace('<em>', '').replace('</em>', ''));
        },[]);
      }
    }
  }

  function _fillSearchResultsFromHits(datas, res, dataByPubkey, pubkeyAtributeName) {
    if (!res || !res.hits || !res.hits.total) return datas;
    var indices = {};
    dataByPubkey = dataByPubkey || {};
    pubkeyAtributeName = pubkeyAtributeName || 'pubkey';
    var values;
    _.forEach(res.hits.hits, function (hit) {

      var avatarFieldName = 'avatar';
      // User profile
      if (hit._index === "user") {
        values = dataByPubkey && dataByPubkey[hit._id];
        if (!values) {
          var value = {};
          value[pubkeyAtributeName] = hit._id;
          values = [value];
          datas.push(value);
        }
      }

      // Page or group
      else if (hit._index !== "user") {
        if (!indices[hit._index]) {
          indices[hit._index] = true;
          // add a separator
          datas.push({
            id: 'divider-' + hit._index,
            divider: true,
            index: hit._index
          });
        }
        var item = {
          id: hit._index + '-' + hit._id, // unique id in list
          index: hit._index,
          templateUrl: 'plugins/es/templates/wot/lookup_item_{0}.html'.format(hit._index),
          state: 'app.view_{0}'.format(hit._index),
          stateParams: {id: hit._id, title: hit._source.title},
          creationTime: hit._source.creationTime,
          memberCount: hit._source.memberCount,
          type: hit._source.type
        };
        values = [item];
        datas.push(item);
        avatarFieldName = 'thumbnail';
      }

      avatar = esHttp.image.fromHit(hit, avatarFieldName);

      _.forEach(values, function (data) {
        data.avatar = avatar;
        _fillSearchResultFromHit(data, hit);
      });
    });

    // Add divider on top
    if (_.keys(indices).length) {
      datas.splice(0, 0, {
        id: 'divider-identities',
        divider: true,
        index: 'profile'
      });
    }
  }

  function search(options) {
    return searchText(undefined, options);
  }

  function searchText(text, options) {
    options = options || {};
    var request = {
      highlight: {fields : {title : {}, tags: {}}},
      from: options.from || 0,
      size: options.size || 100,
      _source: options._source || ["title", "avatar._content_type", "time", "city", "creationTime", "time"]
    };

    if (!text) {
      delete request.highlight; // highlight not need
      request.sort = {time: 'desc'};
    }
    else {
      request.query = {};
      request.query.bool = {
        should: [
          {match: {title: {
                query: text,
                boost: 2
              }}},
          {prefix: {title: text}}
        ]
      };
      var tags = text ? esHttp.util.parseTags(text) : undefined;
      if (tags) {
        request.query.bool.should.push({terms: {tags: tags}});
      }
    }

    if (options.mixedSearch) {
      console.debug("[ES] [profile] Mixed search: enable");
      if (text) {
        request.indices_boost = {
          "user" : 100,
          "page" : 1,
          "group" : 0.01
        };
      }
      request._source = request._source.concat(["description", "creationTime", "membersCount", "type"]);
    }

    var search = options.mixedSearch ? that.raw.mixedSearch : that.raw.search;
    return search(request)
      .then(function(res) {
        var result = [];
        _fillSearchResultsFromHits(result, res);
        return result;
      });
  }

  function onWotSearch(text, datas, pubkeyAtributeName, deferred) {
    deferred = deferred || $q.defer();
    if (!text && (!datas || !datas.length)) {
      deferred.resolve(datas);
      return deferred.promise;
    }

    console.debug("[ES] [profile] Searching on user profiles...");

    pubkeyAtributeName = pubkeyAtributeName || 'pubkey';
    text = text ? text.toLowerCase().trim() : text;
    var dataByPubkey;
    var tags = text ? esHttp.util.parseTags(text) : undefined;
    var request = {
      query: {},
      highlight: {fields : {title : {}, tags: {}}},
      from: 0,
      size: 100,
      _source: ["title", "avatar._content_type", "pubkey"]
    };

    // TODO: uncomment
    //var mixedSearch = text && esSettings.wot.isMixedSearchEnable();
    var mixedSearch = false;
    if (mixedSearch) {
      request._source = request._source.concat(["description", "city", "creationTime", "membersCount", "type"]);
      console.debug("[ES] [profile] Mixed search: enable");
    }

    if (datas.length > 0) {
      // collect pubkeys and fill values map
      dataByPubkey = {};
      _.forEach(datas, function(data) {
        var pubkey = data[pubkeyAtributeName];
        if (pubkey) {
          var values = dataByPubkey[pubkey];
          if (!values) {
            values = [data];
            dataByPubkey[pubkey] = values;
          }
          else {
            values.push(data);
          }
        }
      });
      var pubkeys = _.keys(dataByPubkey);
      // Make sure all results will be return
      request.size = (pubkeys.length <= request.size) ? request.size : pubkeys.length;
      if (!text) {
        delete request.highlight; // highlight not need
        request.query.constant_score = {
          filter: {
            terms : {_id : pubkeys}
          }
        };
      }
      else {
        request.query.constant_score = {
          filter: {bool: {should: [
              {terms : {_id : pubkeys}},
              {bool: {
                  must: [
                    {match: {title: {query: text, boost: 2}}},
                    {prefix: {title: text}}
                  ]}
              }
          ]}}
        };

        if (tags) {
          request.query.constant_score.filter.bool.should.push({terms: {tags: tags}});
        }
      }
    }
    else if (text){
      request.query.bool = {
        should: [
          {match: {title: {
            query: text,
            boost: 2
          }}},
          {prefix: {title: text}}
        ]
      };
      if (tags) {
        request.query.bool.should.push({terms: {tags: tags}});
      }
    }
    else {
      // nothing to search: stop here
      deferred.resolve(datas);
      return deferred.promise;
    }

    if (text && mixedSearch) {
      request.indices_boost = {
        "user" : 100,
        "page" : 1,
        "group" : 0.01
      };
    }

    var search = mixedSearch ? that.raw.mixedSearch : that.raw.search;
    search(request)
      .then(function(res) {
        _fillSearchResultsFromHits(datas, res, dataByPubkey, pubkeyAtributeName);
        deferred.resolve(datas);
      })
      .catch(function(err){
        if (err && err.ucode && err.ucode == 404) {
          deferred.resolve(datas);
        }
        else {
          deferred.reject(err);
        }
      });

    return deferred.promise;
  }

  function onWotLoad(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey) {
      deferred.resolve();
      return deferred.promise;
    }

    // Load full profile
    getProfile(data.pubkey)
      .then(function(profile) {
        if (profile) {
          data.name = profile.name;
          data.avatar = profile.avatar;
          data.profile = profile.source;
          data.profile.description = profile.description;
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
      csWot.api.data.on.search($rootScope, onWotSearch, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [profile] Disable");
      removeListeners();
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [profile] Enable");
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
    search: search,
    searchText: searchText,
    getAvatarAndName: getAvatarAndName,
    get: getProfile,
    add: esHttp.record.post('/user/profile', {tagFields: ['title', 'description'], creationTime: true}),
    update: esHttp.record.post('/user/profile/:id/_update', {tagFields: ['title', 'description'], creationTime: true}),
    remove: esHttp.record.remove("user","profile"),
    avatar: esHttp.get('/user/profile/:id?_source=avatar'),
    fillAvatars: fillAvatars,
    like: {
      toggle: esHttp.like.toggle('user', 'profile'),
      add: esHttp.like.add('user', 'profile'),
      remove: esHttp.like.remove('user', 'profile'),
      count: that.raw.countLikes
    }
  };
})
;
