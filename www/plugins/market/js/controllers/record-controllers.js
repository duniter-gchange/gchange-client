angular.module('cesium.market.record.controllers', ['cesium.market.record.services', 'cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.market_lookup', {
      url: "/market?q&category&location&reload&type",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/lookup.html",
          controller: 'ESMarketLookupCtrl'
        }
      },
      data: {
        large: 'app.market_lookup_lg'
      }
    })

    .state('app.market_lookup_lg', {
      url: "/market/lg?q&category&location&reload&type",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/lookup_lg.html",
          controller: 'ESMarketLookupCtrl'
        }
      }
    })

    .state('app.market_view_record', {
      url: "/market/view/:id/:title?refresh",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/view_record.html",
          controller: 'ESMarketRecordViewCtrl'
        }
      }
    })

    .state('app.market_view_record_anchor', {
      url: "/market/view/:id/:title/:anchor?refresh",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/view_record.html",
          controller: 'ESMarketRecordViewCtrl'
        }
      }
    })

    .state('app.market_add_record', {
      cache: false,
      url: "/market/add/:type",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/edit_record.html",
          controller: 'ESMarketRecordEditCtrl'
        }
      }


    })

    .state('app.market_edit_record', {
      cache: false,
      url: "/market/edit/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/market/templates/edit_record.html",
          controller: 'ESMarketRecordEditCtrl'
        }
      }
    })

    .state('app.market_view_picture', {
      cache: false,
      url: "/market/pictures/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/common/view_pictures_slider.html",
          controller: 'ESMarketViewPicturesCtrl'
        }
      }
    });
  })

 .controller('ESMarketLookupCtrl', ESMarketLookupController)

 .controller('ESMarketRecordViewCtrl', ESMarketRecordViewController)

 .controller('ESMarketRecordEditCtrl', ESMarketRecordEditController)

 .controller('ESMarketViewPicturesCtrl', ESMarketViewPicturesController)

;

function ESMarketLookupController($scope, $rootScope, $state, $focus, $filter, $q,
                                  UIUtils, ModalUtils, csConfig, esMarket, BMA) {
  'ngInject';

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    type: null,
    lastRecords: true,
    results: [],
    loading: true,
    category: null,
    location: null,
    options: null,
    loadingMore: false,
    focusElementId: 'marketSearchText',
    fabAddNewRecordId: 'fab-add-market-record'
  };

  // Screen options
  $scope.options = $scope.options || angular.merge({
      type: {
        show: true
      },
      category: {
        show: true
      },
      description: {
        show: true
      },
      location: {
        show: true,
        prefix : undefined
      }
    }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  //console.debug("[market] Screen options: ", $scope.options);

  $scope.enter = function(e, state) {

    var hasOptions = false;

    // Search by text
    if (state.stateParams && state.stateParams.q) { // Query parameter
      $scope.search.text=state.stateParams.q;
      hasOptions = true;
    }

    // Search on type
    if (state.stateParams && state.stateParams.type) {
      $scope.search.type = state.stateParams.type;
      hasOptions = true;
    }

    // Search on location
    if (state.stateParams && state.stateParams.location) {
      $scope.search.location = state.stateParams.location;
      hasOptions = true;
    }

    // Search on category
    if (state.stateParams && state.stateParams.category) {
      esMarket.category.get({id: state.stateParams.category})
        .then(function(cat) {
          $scope.search.category = cat;
          $scope.finishEnter(true);
        });
    }
    else {
      $scope.finishEnter(hasOptions);
    }

  };

  $scope.$on('$ionicView.enter', function(e, state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
      $scope.enter(e, state);
    }
  });

  $scope.finishEnter = function(hasOptions) {
    $scope.search.options = hasOptions ? true : $scope.search.options; // keep null if first call
    if (hasOptions) {
      $scope.doSearch()
          .then(function() {
            if ($scope.search.fabAddNewRecordId) {
              $scope.showFab($scope.search.fabAddNewRecordId);
            }
          });
    }
    else { // By default : get last record
      $scope.doGetLastRecord()
          .then(function() {
            if ($scope.search.fabAddNewRecordId) {
              $scope.showFab($scope.search.fabAddNewRecordId);
            }
          });
    }
    // removeIf(device)
    // Focus on search text (only if NOT device, to avoid keyboard opening)
    if($scope.search.focusElementId) {
      $focus('marketSearchText');
    }
    // endRemoveIf(device)
    $scope.entered = true;
  };

  $scope.setAdType = function(type) {
    if (type != $scope.search.type) {
      $scope.search.type = type;
      if ($scope.search.lastRecords) {
        $scope.doGetLastRecord();
      }
      else {
        $scope.doSearch();
      }
    }
  };

  $scope.doSearch = function(from) {
    $scope.search.loading = !from;
    $scope.search.lastRecords = false;
    if (!$scope.search.options) {
      $scope.search.options = false;
    }

    var text = $scope.search.text.trim();
    var matches = [];
    var filters = [];
    if (text.length > 1) {
      // pubkey : use a special 'term', because of 'non indexed' field
      if (BMA.regexp.PUBKEY.test(text /*case sensitive*/)) {
        matches = [];
        filters.push({term : { issuer: text}});
      }
      else {
        text = text.toLowerCase();
        var matchFields = ["title", "description", "location"];
        matches.push({multi_match : { query: text,
          fields: matchFields,
          type: "phrase_prefix"
        }});
        matches.push({match: { title: text}});
        matches.push({match: { description: text}});
        matches.push({prefix: { location: text}});
        matches.push({
           nested: {
             path: "category",
             query: {
               bool: {
                 filter: {
                   match: { "category.name": text}
                 }
               }
             }
           }
         });
      }
    }
    if ($scope.search.options && $scope.search.category) {
      filters.push({
        nested: {
          path: "category",
          query: {
            bool: {
              filter: {
                term: { "category.id": $scope.search.category.id}
              }
            }
          }
        }
      });
    }
    if ($scope.search.options && $scope.search.location && $scope.search.location.length > 0) {
      filters.push({match_phrase: { location: $scope.search.location}});
    }

    if (!matches.length && !filters.length) {
      $scope.search.results = [];
      $scope.search.hasMore = false;
      $scope.search.loading = false;
      return $q.when();
    }

    if ($scope.search.type) {
      filters.push({term: {type: $scope.search.type}});
    }

    var query = {bool: {}};
    if (matches.length > 0) {
      query.bool.should =  matches;
    }
    if (filters.length > 0) {
      query.bool.filter =  filters;
    }

    return $scope.doRequest({query: query, from: from});
  };

  $scope.doGetLastRecord = function(from) {

    $scope.search.lastRecords = true;

    var options = {
      sort: {
        "creationTime" : "desc"
      },
      from: from
    };

    if ($scope.search.type) {
      options.query = {bool: {filter: {term: {type: $scope.search.type}}}};
    }

    return $scope.doRequest(options);
  };

  $scope.showMore = function() {
    var from = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    var searchFunction = ($scope.search.lastRecords) ?
      $scope.doGetLastRecord :
      $scope.doSearch;

    return searchFunction(from)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      })
      .catch(function(err) {
        console.error(err);
        $scope.search.loadingMore = false;
        $scope.search.hasMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.doRequest = function(options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || defaultSearchLimit;
    if (options.size < defaultSearchLimit) options.size = defaultSearchLimit;
    $scope.search.loading = (options.from === 0);

    return  esMarket.record.search(options)
    .then(function(records){
      if (!records && !records.length) {
        $scope.search.results = (options.from > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        $scope.search.loading = false;
        return;
      }

      // Filter on type (workaround if filter on term 'type' not working)
      var formatSlug = $filter('formatSlug');
      records.reduce(function(res, record) {
        if ($scope.search.type && $scope.search.type != record.type) {
          return res;
        }
        record.urlTitle = formatSlug(record.title);
        return res.concat(record);
      }, []);

      // Replace results, or append if 'show more' clicked
      if (!options.from) {
        $scope.search.results = records;
      }
      else {
        $scope.search.results = $scope.search.results.concat(records);
      }
      $scope.search.hasMore = $scope.search.results.length >= options.from + options.size;
      $scope.search.loading = false;

      // motion
      if (records.length > 0) {
        $scope.motion.show();
      }
    })
    .catch(function(err) {
      $scope.search.loading = false;
      $scope.search.results = (options.from > 0) ? $scope.search.results : [];
      $scope.search.hasMore = false;
      UIUtils.onError('MARKET.ERROR.LOOKUP_RECORDS_FAILED')(err);
    });
  };

  /* -- options -- */

  $scope.onToggleOptions = function() {
    if ($scope.search.entered) {
      $scope.doSearch();
    }
  };
  $scope.$watch('search.options', $scope.onToggleOptions, true);

  /* -- modals -- */

  $scope.showCategoryModal = function() {
    // load categories
    return esMarket.category.all()
      .then(function(categories){
        return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
          {categories : categories},
          {focusFirstInput: true}
        );
      })
      .then(function(cat){
        if (cat && cat.parent) {
          $scope.search.category = cat;
          $scope.doSearch();
        }
      });
  };

  $scope.showNewRecordModal = function() {
    return $scope.loadWallet({minData: true})
      .then(function() {
        return UIUtils.loading.hide();
      }).then(function() {
        if (!$scope.options.type.show && $scope.options.type.default) {
          return $scope.options.type.default;
        }
        return ModalUtils.show('plugins/market/templates/modal_record_type.html');
      })
      .then(function(type){
        if (type) {
          $state.go('app.market_add_record', {type: type});
        }
      });
  };


  $scope.showRecord = function(event, index) {
    if (event.defaultPrevented) return;
    var item = $scope.search.results[index];
    if (item) {
      $state.go('app.market_view_record', {
        id: item.id,
        title: item.title
      });
    }
  };

  $scope.showRecordPictures = function(event, index) {
    var item = $scope.search.results[index];
    if (item && item.thumbnail) {
      event.preventDefault();
      $rootScope.picture = item.thumbnail;
      $state.go('app.market_view_picture', {
        id: item.id,
        title: item.title
      });
    }
  };
}

function ESMarketRecordViewController($scope, $rootScope, $anchorScroll, $ionicPopover, $state, $ionicHistory, $q,
                                      $timeout, $filter, Modals, csConfig,
                                      csWallet, esMarket, UIUtils, esHttp) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.maxCommentSize = 10;
  $scope.loading = true;
  $scope.motion = UIUtils.motion.fadeSlideInRight;

  // Screen options
  $scope.options = $scope.options || angular.merge({
    type: {
      show: true
    },
    category: {
      show: true
    },
    description: {
      show: true
    },
    location: {
      show: true,
      prefix : undefined
    }
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  $scope.$on('$ionicView.enter', function (e, state) {
    if (state.stateParams && state.stateParams.id) { // Load by id
      if ($scope.loading || state.stateParams.refresh) { // prevent reload if same id (if not force)
        $scope.load(state.stateParams.id, state.stateParams.anchor);
      }

      // Notify child controllers
      $scope.$broadcast('$recordView.enter', state);
    }
    else {
      $state.go('app.market_lookup');
    }
  });

  $scope.$on('$ionicView.beforeLeave', function (event, args) {
    $scope.$broadcast('$recordView.beforeLeave', args);
  });

  $scope.load = function (id, anchor) {
    $scope.loading = true;
    esMarket.record.load(id, {
      fetchPictures: false,// lazy load for pictures
      convertPrice: true // convert to user unit
    })
      .then(function (data) {
        $scope.formData = data.record;
        $scope.id = data.id;
        $scope.issuer = data.issuer;
        $scope.canEdit = $scope.formData && csWallet.isUserPubkey($scope.formData.issuer);
        UIUtils.loading.hide();
        $scope.loading = false;
        // Set Motion (only direct children, to exclude .lazy-load children)
        $scope.motion.show({
          selector: '.list > .item'
        });
      })
      .catch(function (err) {
        if (!$scope.secondTry) {
          $scope.secondTry = true;
          $q(function () {
            $scope.load(id); // loop once
          }, 100);
        }
        else {
          $scope.loading = false;
          UIUtils.loading.hide();
          if (err && err.ucode === 404) {
            UIUtils.toast.show('MARKET.ERROR.RECORD_NOT_EXISTS');
            $state.go('app.market_lookup');
          }
          else {
            UIUtils.onError('MARKET.ERROR.LOAD_RECORD_FAILED')(err);
          }
        }
      });

    // Continue loading other data
    $timeout(function () {

      // Load pictures
      esMarket.record.picture.all({id: id})
        .then(function (hit) {
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function (res, pic) {
              return res.concat(esHttp.image.fromAttachment(pic.file));
            }, []);
          }
        })
        .then(function () {
          // Set Motion
          $scope.motion.show({
            selector: '.lazy-load .item.card-gallery',
            ink: false
          });
        })
        .catch(function () {
          $scope.pictures = [];
        });

      // Load other data (from child controller)
      $scope.$broadcast('$recordView.load', id, esMarket.record.comment);

      // scroll (if comment anchor)
      if (anchor) $timeout(function () {
        $anchorScroll(anchor);
      }, 1000);
    });

  };

  $scope.refreshConvertedPrice = function () {
    $scope.loading = true; // force reloading if settings changed (e.g. unit price)
  };
  $scope.$watch('$root.settings.useRelative', $scope.refreshConvertedPrice, true);

  $scope.edit = function () {
    $state.go('app.market_edit_record', {id: $scope.id, title: $filter('formatSlug')($scope.formData.title)});
  };

  $scope.delete = function () {
    $scope.hideActionsPopover();

    UIUtils.alert.confirm('MARKET.VIEW.REMOVE_CONFIRMATION')
      .then(function (confirm) {
        if (confirm) {
          esMarket.record.remove($scope.id)
            .then(function () {
              $ionicHistory.nextViewOptions({
                historyRoot: true
              });
              $state.go('app.market_lookup');
              UIUtils.toast.show('MARKET.INFO.RECORD_REMOVED');
            })
            .catch(UIUtils.onError('MARKET.ERROR.REMOVE_RECORD_FAILED'));
        }
      });
  };

  /* -- modals & popover -- */

  $scope.showActionsPopover = function (event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/market/templates/view_popover_actions.html', {
        scope: $scope
      }).then(function (popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function () {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function () {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.showSharePopover = function(event) {
    $scope.hideActionsPopover();

    var title = $scope.formData.title;
    var url = $rootScope.rootPath + $state.href('app.market_view_record', {title: title, id: $scope.id});
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'MARKET.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        time: $scope.formData.time,
        postMessage: title,
        postImage: $scope.pictures.length > 0 ? $scope.pictures[0] : null
      }
    });
  };

  $scope.buy = function () {
    $scope.hideActionsPopover();

    return $scope.loadWallet()
      .then(function (walletData) {
        UIUtils.loading.hide();
        if (walletData) {
          return Modals.showTransfer({
              pubkey: $scope.issuer.pubkey,
              uid: $scope.issuer.name || $scope.issuer.uid,
              amount: $scope.formData.price
            }
          )
            .then(function (result) {
              if (result) {
                return UIUtils.toast.show('INFO.TRANSFER_SENT');
              }
            });
        }
      });
  };
}

function ESMarketRecordEditController($scope, $q, $state, $ionicPopover, esMarket, $ionicHistory, $focus,
                                      UIUtils, ModalUtils, csConfig, esHttp, csSettings, csCurrency) {
  'ngInject';

  $scope.formData = {
    price: null,
    category: {}
  };
  $scope.id = null;
  $scope.pictures = [];
  $scope.loading = true;

  // Screen options
  $scope.options = $scope.options || angular.merge({
    recordType: {
      show: true,
      canEdit: true
    },
    category: {
      show: true,
      filter: undefined
    },
    description: {
      show: true
    },
    location: {
      show: true,
      required: true
    },
    unit: {
      canEdit: true
    },
    login: {
      type: "full"
    }
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  //console.debug("[market] Screen options: ", $scope.options);

  $scope.motion = UIUtils.motion.ripple;

  $scope.setForm =  function(form) {
    $scope.form = form;
  };

  $scope.$on('$ionicView.enter', function(e, state) {
    // Load wallet
    $scope.loadWallet({
      minData: true
    })
    .then(function() {
      $scope.useRelative = csSettings.data.useRelative;
      if (state.stateParams && state.stateParams.id) { // Load by id
        $scope.load(state.stateParams.id);
      }
      else {
        // New record
        if (state.stateParams && state.stateParams.type) {
          $scope.formData.type = state.stateParams.type;
        }
        $scope.formData.type = $scope.formData.type || ($scope.options.type && $scope.options.type.default) || 'offer'; // default: offer

        // Get the default currency
        var getCurrency;
        if (csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.defaultCurrency) {
          getCurrency = $q.when({name: csConfig.plugins.market.defaultCurrency});
        }
        else {
          getCurrency = csCurrency.default();
        }
        getCurrency.then(function(currency){
            $scope.formData.currency = currency.name;
            $scope.loading = false;
            UIUtils.loading.hide();
            $scope.motion.show();
          });
      }

      // Focus on title
      if ($scope.options.focus && !UIUtils.screen.isSmall()) {
        $focus('market-record-title');
      }
    })
    .catch(function(err){
      if (err == 'CANCELLED') {
        $scope.showHome();
      }
    });
  });

  $ionicPopover.fromTemplateUrl('plugins/es/templates/market/popover_unit.html', {
    scope: $scope
  }).then(function(popover) {
    $scope.unitPopover = popover;
  });

  $scope.$on('$destroy', function() {
    if (!!$scope.unitPopover) {
      $scope.unitPopover.remove();
    }
  });

  $scope.cancel = function() {
    $scope.closeModal();
  };

  $scope.load = function(id) {
    return esMarket.record.load(id, {
        fetchPictures: true,
        convertPrice: false // keep original price
      })
      .then(function(data) {
        $scope.formData = data.record;
        if (data.record.unit === 'unit') {
          $scope.formData.price = $scope.formData.price / 100; // add 2 decimals in quantitative mode
        }
        $scope.id = data.id;
        $scope.pictures = data.record.pictures || [];
        delete $scope.formData.pictures; // duplicated with $scope.pictures
        $scope.useRelative = $scope.formData.price ?
          ($scope.formData.unit === 'UD') :
          csSettings.data.useRelative;
        $scope.loading = false;
        UIUtils.loading.hide();
        $scope.motion.show({
          selector: '.animate-ripple .item, .card-gallery'
        });
      })
      .catch(UIUtils.onError('MARKET.ERROR.LOAD_RECORD_FAILED'));
  };

  $scope.save = function() {
    $scope.form.$submitted=true;
    if($scope.saving || // avoid multiple save
       !$scope.form.$valid || !$scope.formData.category.id) {
      return;
    }
    $scope.saving = true;

    return UIUtils.loading.show({delay: 0})
      // Preparing json (pictures + resizing thumbnail)
      .then(function() {
        var json = angular.copy($scope.formData);

        if (json.price && typeof json.price == "string") {
          json.price = parseFloat(json.price.replace(new RegExp('[.,]'), '.')); // fix #124
        }
        if (json.price) {
          if (!$scope.useRelative) {
            json.unit = 'unit';
            json.price = json.price * 100;
          }
          else {
            json.unit = 'UD';
          }
          if (!json.currency) {
            json.currency = $scope.currency;
          }
        }
        else {
          json.unit = undefined;
          json.currency = undefined;
        }
        json.time = esHttp.date.now();

        json.picturesCount = $scope.pictures.length;
        if (json.picturesCount) {

          return $q.all(
              // resize all pictures
              $scope.pictures.reduce(function(res, pic) {
                return res.concat(UIUtils.image.resizeSrc(pic.src, false));
              },
              // First: resize thumbnail
              [UIUtils.image.resizeSrc($scope.pictures[0].src, true)]
          ))
            .then(function(imagesSrc) {
              // First image = the thumbnail
              json.thumbnail = esHttp.image.toAttachment({src: imagesSrc.splice(0,1)});
              // Then = all pictures
              json.pictures = imagesSrc.reduce(function(res, imagesSrc) {
                return res.concat({
                  file: esHttp.image.toAttachment({src: imagesSrc})
                });
              }, []);

              return json;
            });
        }
        else {
          if ($scope.formData.thumbnail) {
            // FIXME: this is a workaround to allow content deletion
            // Is it a bug in the ES attachment-mapper ?
            $scope.formData.thumbnail = {
              _content: '',
              _content_type: ''
            };
          }
          json.pictures = [];
          return json;
        }
      })

      // Send data (create or update)
      .then(function(json) {
        if (!$scope.id) {
          json.creationTime = esHttp.date.now();
          return esMarket.record.add(json);
        }
        else {
          return esMarket.record.update(json, {id: $scope.id});
        }
      })

      // Redirect to record view
      .then(function(id) {
        $scope.id = $scope.id || id;
        $scope.saving = false;
        $scope.dirty = false;
        $ionicHistory.clearCache($ionicHistory.currentView().stateId); // clear current view
        $ionicHistory.nextViewOptions({historyRoot: true});
        return $state.go('app.market_view_record', {id: $scope.id, refresh: true});
      })

      .catch(function(err) {
        $scope.saving = false;
        UIUtils.onError('MARKET.ERROR.FAILED_SAVE_RECORD')(err);
      });
  };

  $scope.setUseRelative = function(useRelative) {
    $scope.formData.unit = useRelative ? 'UD' : 'unit';
    $scope.useRelative = useRelative;
    $scope.unitPopover.hide();
  };

  $scope.openCurrencyLookup = function() {
    alert('Not implemented yet. Please submit an issue if occur again.');
  };

  $scope.cancel = function() {
    $scope.dirty = false; // force not saved
    $ionicHistory.goBack();
  };

  $scope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
    if (!$scope.dirty || $scope.saving) return;

    // stop the change state action
    event.preventDefault();

    if ($scope.loading) return;

    return UIUtils.alert.confirm('CONFIRM.SAVE_BEFORE_LEAVE',
      'CONFIRM.SAVE_BEFORE_LEAVE_TITLE', {
        cancelText: 'COMMON.BTN_NO',
        okText: 'COMMON.BTN_YES_SAVE'
      })
      .then(function(confirmSave) {
        if (confirmSave) {
          return $scope.save();
        }
      })
      .then(function() {
        $scope.dirty = false;
        $ionicHistory.nextViewOptions({
          historyRoot: true
        });
        $state.go(next.name, nextParams);
        UIUtils.loading.hide();
      });
  });

  $scope.onFormDataChanged = function() {
    if ($scope.loading) return;
    $scope.dirty = true;
  };
  $scope.$watch('formData', $scope.onFormDataChanged, true);

  /* -- modals -- */
  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/market/templates/modal_record_type.html')
    .then(function(type){
      if (type) {
        $scope.formData.type = type;
      }
    });
  };

  $scope.showCategoryModal = function() {
    // load categories
    var getCategories;
    console.log("getting categories");
    if ($scope.options && $scope.options.category && $scope.options.category.filter) {
      getCategories = esMarket.category.filtered({filter: $scope.options.category.filter});
    }
    else {
      getCategories = esMarket.category.all();
    }

    getCategories
    .then(function(categories){
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
        {categories : categories},
        {focusFirstInput: true}
      );
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.formData.category = cat;
      }
    });
  };
}

function ESMarketViewPicturesController($scope, $rootScope) {
  console.log("enter ESMarketViewPicturesController", $rootScope);

  $scope.formData = {
    picture: $rootScope.picture
  };
  delete $rootScope.picture;

}
