angular.module('cesium.es.http.services', ['ngResource', 'ngApi', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, $timeout, $rootScope, $state, $sce, $window, $filter,
                            CryptoUtils, csHttp, csConfig, csSettings, BMA, csWallet, csPlatform, Api) {
  'ngInject';

  // Allow to force SSL connection with port different from 443
  var forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
  ($window.location && $window.location.protocol === 'https:') ? true : false;
  if (forceUseSsl) {
    console.debug('[ES] [https] Enable SSL (forced by config or detected in URL)');
  }

  function Factory(host, port, wsPort, useSsl) {

    var
      that = this,
      constants = {
        ES_USER_API_ENDPOINT: 'ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))',
        MAX_UPLOAD_BODY_SIZE: csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.maxUploadBodySize || 2097152 /*=2M*/
      },
      regexp = {
        IMAGE_SRC: exact('data:([A-Za-z//]+);base64,(.+)'),
        URL: match('(www\\.|https?:\/\/(www\\.)?)[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)'),
        HASH_TAG: match('(?:^|[\t\n\r\s ])#([\\wḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+)'),
        USER_TAG: match('(?:^|[\t\n\r\s ])@('+BMA.constants.regexp.USER_ID+')'),
        ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT)
      },
      truncUrlFilter = $filter('truncUrl');

    that.cache = _emptyCache();
    that.api = new Api(this, "esHttp");
    that.init = init;

    init(host, port, wsPort, useSsl);

    function init(host, port, wsPort, useSsl) {
      // Use settings as default
      if (!host && csSettings.data) {
        host = host || (csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null);
        port = port || (host ? csSettings.data.plugins.es.port : null);
        wsPort = wsPort || (host ? csSettings.data.plugins.es.wsPort : null);
        useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443 || csSettings.data.plugins.es.useSsl || forceUseSsl);
      }

      that.alive = false;
      that.host = host;
      that.port = port || ((useSsl || forceUseSsl) ? 443 : 80);
      that.wsPort = wsPort || that.port;
      that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || forceUseSsl);
      that.server = csHttp.getServer(host, port);
    }

    function exact(regexpContent) {
      return new RegExp('^' + regexpContent + '$');
    }
    function match(regexpContent) {
      return new RegExp(regexpContent);
    }

    function _emptyCache() {
      return {
        getByPath: {},
        postByPath: {},
        wsByPath: {}
      };
    }

    that.cleanCache = function() {
      console.debug('[ES] [http] Cleaning requests cache...');
      _.keys(that.cache.wsByPath).forEach(function(key) {
        var sock = that.cache.wsByPath[key];
        sock.close();
      });
      that.cache = _emptyCache();
    };

    that.copy = function(otherNode) {
      that.init(otherNode.host, otherNode.port, otherNode.wsPort, otherNode.useSsl);
      return that.restart();
    };

    // Get time (UTC)
    that.date = { now : csHttp.date.now };

    that.byteCount = function (s) {
      s = (typeof s == 'string') ? s : JSON.stringify(s);
      return encodeURI(s).split(/%(?:u[0-9A-F]{2})?[0-9A-F]{2}|./).length - 1;
    };

    that.getUrl  = function(path) {
      return csHttp.getUrl(that.host, that.port, path, that.useSsl);
    };

    that.get = function (path) {
      return function(params) {
        var request = that.cache.getByPath[path];
        if (!request) {
          request =  csHttp.get(that.host, that.port, path, that.useSsl);
          that.cache.getByPath[path] = request;
        }
        return request(params);
      };
    };

    that.post = function(path) {
      return function(obj, params) {
        var request = that.cache.postByPath[path];
        if (!request) {
          request =  csHttp.post(that.host, that.port, path, that.useSsl);
          that.cache.postByPath[path] = request;
        }
        return request(obj, params);
      };
    };

    that.ws = function(path) {
      return function() {
        var sock = that.cache.wsByPath[path];
        if (!sock) {
          sock =  csHttp.ws(that.host, that.wsPort, path, that.useSsl);
          that.cache.wsByPath[path] = sock;
        }
        return sock;
      };
    };

    that.isAlive = function() {
      return that.node.summary()
        .then(function(json) {
          return json && json.duniter && json.duniter.software == 'duniter4j-elasticsearch';
        })
        .catch(function() {
          return false;
        });
    };

    that.start = function() {

      return csPlatform.ready()
        .then(that.init)
        .then(function() {
          console.debug('[ES] [http] Starting on [{0}]...'.format(that.server));
          var now = new Date().getTime();
          return that.isAlive()
            .then(function(alive) {
              that.alive = alive;
              if (!alive) {
                console.error('[ES] [http] Could not start [{0}]: node unreachable'.format(that.server));
                return false;
              }
              console.debug('[ES] [http] Started in '+(new Date().getTime()-now)+'ms');
              that.api.node.raise.start();
              return true;
            });
        });
    };

    that.stop = function() {
      console.debug('[ES] [http] Stopping...');
      that.alive = false;
      that.cleanCache();
      that.api.node.raise.stop();
      return $q.when();
    };

    that.restart = function() {
      that.stop();
      return $timeout(that.start, 200);
    };

    function parseTagsFromText(value, prefix) {
      prefix = prefix || '#';
      var reg = prefix === '@' ? regexp.USER_TAG : regexp.HASH_TAG;
      var matches = value && reg.exec(value);
      var tags = matches && [];
      while(matches) {
        var tag = matches[1];
        if (!_.contains(tags, tag)) {
          tags.push(tag);
        }
        value = value.substr(matches.index + matches[1].length + 1);
        matches = value.length > 0 && reg.exec(value);
      }
      return tags;
    }

    function parseUrlsFromText(value) {
      var matches = value && regexp.URL.exec(value);
      var urls = matches && [];
      while(matches) {
        var url = matches[0];
        if (!_.contains(urls, url)) {
          urls.push(url);
        }
        value = value.substr(matches.index + matches[0].length + 1);
        matches = value && regexp.URL.exec(value);
      }
      return urls;
    }

    function parseTitlesFromText(value, prefix, suffix) {
      prefix = prefix || '##';
      var reg = match('(?:^|[\\r\\s])('+prefix+'([\\w\\sḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+)' + (suffix||'') + ')');
      var matches = value && reg.exec(value);
      var lines = matches && [];
      var res = matches && [];
      while(matches) {
        var line = matches[1];
        if (!_.contains(lines, line)) {
          lines.push(line);
          res.push({
            line: line,
            title: matches[2]
          });
        }
        value = value.substr(matches.index + matches[1].length + 1);
        matches = value.length > 0 && reg.exec(value);
      }
      return res;
    }


    function escape(text) {
      if (!text) return text;
      return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function parseAsHtml(text, options) {

      var content = text ? escape(text.trim()) : undefined;
      if (content) {
        options = options || {};
        options.tagState = options.tagState || 'app.wot_lookup';
        options.uidState = options.uidState || 'app.wot_identity_uid';
        if (options.newLine || !angular.isDefined(options.newLine)) {
          content = content.replace(/\n/g, '<br>\n');
        }

        // Replace URL in description
        var urls = parseUrlsFromText(content);
        _.forEach(urls, function(url){
          // Make sure protocol is defined
          var href = (url.startsWith('http://') || url.startsWith('https://')) ? url : ('http://' + url);
          // Redirect URL to the function 'openLink', to open a new window if need (e.g. desktop app)
          var link = '<a on-tap=\"openLink($event, \'{0}\')\" href=\"{1}\" target="_blank">{2}</a>'.format(href, href, truncUrlFilter(url));
          content = content.replace(url, link);
        });

        // Replace hashtags
        var hashTags = parseTagsFromText(content);
        _.forEach(hashTags, function(tag){
          var link = '<a ui-sref=\"{0}({hash: \'{1}\'})\">#{2}</a>'.format(options.tagState, tag, tag);
          content = content.replace('#'+tag, link);
        });

        // Replace user tags
        var userTags = parseTagsFromText(content, '@');
        _.forEach(userTags, function(tag){
          var link = '<a ui-sref=\"{0}({uid: \'{1}\'})\">@{2}</a>'.format(options.uidState, tag, tag);
          content = content.replace('@'+tag, link);
        });

        // Replace title
        var titles = parseTitlesFromText(content, '#+[ ]*', '<br>');
        _.forEach(titles, function(matches){
          var size = matches.line.lastIndexOf('#', 5)+1;
          content = content.replace(matches.line, '<h{0}>{1}</h{2}>'.format(size, matches.title, size));
        });
      }
      return content;
    }

    function fillRecordTags(record, fieldNames) {
      fieldNames = fieldNames || ['title', 'description'];

      record.tags = fieldNames.reduce(function(res, fieldName) {
        var value = record[fieldName];
        var tags = value && parseTagsFromText(value);
        return tags ? res.concat(tags) : res;
      }, []);
    }

    function findObjectInTree(obj, attrName) {
      if (!obj) return;
      if (obj[attrName]) return obj[attrName];
      if (Array.isArray(obj)) {
        return obj.reduce(function(res, item) {
          return res ? res : findObjectInTree(item, attrName);
        }, false);
      }
      else if (typeof obj == "object") {
        return _.reduce(_.keys(obj), function (res, key) {
          return res ? res : findObjectInTree(obj[key], attrName);
        }, false);
      }
    }

    function postRecord(path, options) {
      options = options || {};
      var postRequest = that.post(path);
      return function(record, params) {
        if (!csWallet.isLogin()) {
          var deferred = $q.defer();
          deferred.reject('Wallet must be login before sending record to ES node');
          return deferred.promise;
        }

        // Always update the time - fix Cesium #572
        // Make sure time is always > previous (required by ES node)
        var now = that.date.now();
        record.time = (!record.time || record.time < now) ? now : (record.time+1);

        var keypair = $rootScope.walletData.keypair;
        var obj = {};
        angular.copy(record, obj);
        delete obj.signature;
        delete obj.hash;
        obj.issuer = $rootScope.walletData.pubkey;
        if (!obj.version) {
          obj.version = 2;
        }

        // Fill tags
        if (options.tagFields) {
          fillRecordTags(obj, options.tagFields);
        }

        var str = JSON.stringify(obj);

        return CryptoUtils.util.hash(str)
          .then(function(hash) {
            return CryptoUtils.sign(hash, keypair)
              .then(function(signature) {
                // Prepend hash+signature
                str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                // Send data
                return postRequest(str, params)
                  .then(function (id){
                    return id;
                  })
                  .catch(function(err) {
                    var bodyLength = that.byteCount(obj);
                    if (bodyLength > constants.MAX_UPLOAD_BODY_SIZE) {
                      throw {message: 'ERROR.ES_MAX_UPLOAD_BODY_SIZE', length: bodyLength};
                    }
                    throw err;
                  });
              });
            });
      };
    }

    function removeRecord(index, type) {
      return function(id) {
        if (!csWallet.isLogin()) {
          var deferred = $q.defer();
          deferred.reject('Wallet must be login before sending record to ES node');
          return deferred.promise;
        }

        var keypair = $rootScope.walletData.keypair;
        var obj = {
          version: 2,
          index: index,
          type: type,
          id: id,
          issuer: $rootScope.walletData.pubkey,
          time: that.date.now()
        };
        var str = JSON.stringify(obj);
        return CryptoUtils.util.hash(str)
          .then(function(hash) {
            return CryptoUtils.sign(hash, keypair)
              .then(function(signature) {
                // Prepend hash+signature
                str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                // Send data
                return that.post('/history/delete')(str)
                  .then(function (id){
                    return id;
                  });
              });
          });
      };
    }

    that.image = {};

    function imageFromAttachment(attachment) {
      if (!attachment || !attachment._content_type || !attachment._content || attachment._content.length === 0) {
        return null;
      }
      var image = {
        src: "data:" + attachment._content_type + ";base64," + attachment._content
      };
      if (attachment._title) {
        image.title = attachment._title;
      }
      if (attachment._name) {
        image.name = attachment._name;
      }
      return image;
    }

    function imageToAttachment(image) {
      if (!image || !image.src) return null;
      var match = regexp.IMAGE_SRC.exec(image.src);
      if (!match) return null;
      var attachment = {
        _content_type: match[1],
        _content: match[2]
      };
      if (image.title) {
        attachment._title = image.title;
      }
      if (image.name) {
        attachment._name = image.name;
      }
      return attachment;
    }

    /**
     * This will create a image (src, title, name) using the _content is present, or computing a image URL to the ES node
     * @param host
     * @param port
     * @param hit
     * @param imageField
     * @returns {{}}
     */
    that.image.fromHit = function(hit, imageField) {
      if (!hit || !hit._source) return;
      var attachment =  hit._source[imageField];
      if (!attachment || !attachment._content_type || !attachment._content_type.startsWith("image/")) return;
      var image = {};
      // If full content: then use it directly
      if (attachment._content) {
        image.src = "data:" + attachment._content_type + ";base64," + attachment._content;
      }
      // Compute an url
      else {
        var extension = attachment._content_type.substr(6);
        var path = [hit._index, hit._type, hit._id, '_image', imageField].join('/');
        path = '/' + path + '.' + extension;
        image.src = that.getUrl(path);
      }
      if (attachment._title) {
        image.title = attachment._title;
      }
      if (attachment._name) {
        image.name = attachment._name;
      }
      return image;
    };

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

    function emptyHit() {
      return {
         _id: null,
         _index: null,
         _type: null,
         _version: null,
         _source: {}
      };
    }

    that.api.registerEvent('node', 'start');
    that.api.registerEvent('node', 'stop');

    var exports = {
      getServer: csHttp.getServer,
      node: {
        summary: that.get('/node/summary'),
        parseEndPoint: parseEndPoint
      },
      record: {
        post: postRecord,
        remove: removeRecord
      },
      image: {
        fromAttachment: imageFromAttachment,
        toAttachment: imageToAttachment
      },
      hit: {
        empty: emptyHit
      },
      util: {
        parseTags: parseTagsFromText,
        parseAsHtml: parseAsHtml,
        findObjectInTree: findObjectInTree
      },
      constants: constants
    };
    exports.constants.regexp = regexp;
    angular.merge(that, exports);
  }


  var service = new Factory();

  service.instance = function(host, port, wsPort, useSsl) {
    return new Factory(host, port, wsPort, useSsl);
  };

  return service;
})
;
