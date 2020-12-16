angular.module('cesium.market.gallery.controllers', ['cesium.market.record.services', 'cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.market_gallery', {
        cache: true,
        url: "/gallery/market?q",
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/gallery/view_gallery.html",
            controller: 'MkViewGalleryCtrl'
          }
        }
      });
  })

    .controller('MkViewGalleryCtrl', MkViewGalleryController)

    .controller('MkGallerySlideModalCtrl', MkGallerySlideModalController)

;

function MkViewGalleryController($scope, $q, $ionicScrollDelegate, $controller, $location, $ionicModal, $interval,
                                 csConfig, csSettings, ModalUtils, mkRecord) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESLookupPositionCtrl', {$scope: $scope}));

  $scope.entered = false;
  $scope.categories = [];
  $scope.activeCategoryIndex = undefined;
  $scope.activePictureIndex = undefined;


  $scope.options = $scope.options || angular.merge({
    location: {
      show: true,
      prefix: '' // e.g. 'stand
    },
    category: {
      filter: undefined
    },
    slideDuration: 10000, // 10 sec
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  $scope.search = $scope.search || angular.merge({
    loading: false,
    text: null,
    location: null,
    geoPoint: null,
    geoShape: null,
    showClosed: false,
    showOld: false,
    geoDistance: csSettings.data.plugins.market && csSettings.data.plugins.market,
    from: 0,
    hasMore: true
  }, $scope.search);

  // Force default
  $scope.search.size = 10;
  $scope.search.type = 'all';

  $scope.slideDurationLabels = {
    3000: {
      labelKey: 'MARKET.GALLERY.SLIDE_DURATION_OPTION',
      labelParams: {value: 3}
    },
    5000: {
      labelKey: 'MARKET.GALLERY.SLIDE_DURATION_OPTION',
      labelParams: {value: 5}
    },
    10000: {
      labelKey: 'MARKET.GALLERY.SLIDE_DURATION_OPTION',
      labelParams: {value: 10}
    },
    15000: {
      labelKey: 'MARKET.GALLERY.SLIDE_DURATION_OPTION',
      labelParams: {value: 15}
    },
    20000: {
      labelKey: 'MARKET.GALLERY.SLIDE_DURATION_OPTION',
      labelParams: {value: 20}
    }
  };
  $scope.slideDurations = _.keys($scope.slideDurationLabels);

  $scope.adTypeLabels = {
    all: 'MARKET.GALLERY.ALL_AD_TYPES',
    offer: 'MARKET.TYPE.OFFER_SHORT',
    need: 'MARKET.TYPE.NEED_SHORT',
    crowdfunding: 'MARKET.TYPE.CROWDFUNDING_SHORT',
  };
  $scope.adTypes = _.keys($scope.adTypeLabels);

  // When view enter: load data
  $scope.enter = function(e, state) {

    // Apply defaults from settings
    var defaultSearch = csSettings.data.plugins.market && csSettings.data.plugins.market.defaultSearch;
    if (defaultSearch && !defaultSearch.geoShape/*not supported yet*/) {
      console.info("[market] [gallery] Restoring last search from settings", defaultSearch);
      angular.merge($scope.search, defaultSearch);
    }

    if (!$scope.entered) {

      if (state && state.stateParams && state.stateParams.q) {
        $scope.search.text = state.stateParams.q.trim();
      }

      $scope.entered = true;
    }

  };
  $scope.$on('$ionicView.enter',$scope.enter);


  $scope.start = function(options) {

    // Already started: restore
    if ($scope.activeCategoryIndex !== undefined) {
      return $scope.openSlideShowModal($scope.activeCategoryIndex, $scope.activePictureIndex);
    }

    $scope.stop();

    options = options || {};
    options.filter = options.filter || ($scope.options && $scope.options.category && $scope.options.category.filter);
    options.withStock = (!$scope.options || !$scope.options.showClosed);
    options.withOld = $scope.options && $scope.options.showOld;
    options.text = $scope.search && $scope.search.text;

    $scope.search.loading = true;

    var stateParams = {
      //location: null
      q: options.text
    };

    // Update location href
    $location.search(stateParams).replace();

    return mkRecord.category.stats(options)
      .then(function(res) {
        // Exclude empty categories
        $scope.categories = _.filter(res, function(cat) {
          return cat.count > 0 && cat.children && cat.children.length;
        });

        // Find a the first category with pictures
        return $scope.fetchNextPictures();
      })
      .then(function(res) {
        var category = res && res[0];
        if (category) {
          var catIndex = _.findIndex($scope.categories, function(cat) {
            return cat.id === category.id;
          });
          return $scope.openSlideShowModal(catIndex, 0);
        }
      })
      .catch(function(err) {
        if (err === 'END') {
          console.info("All pictures displayed");
        }
        else {
          console.error(err);
        }
        $scope.search.loading = false;
      })
        .then(function() {
          $scope.search.loading = false;
        });
  };


  $scope.stop = function() {
    delete $scope.activeCategoryIndex;
    delete $scope.categories;
    delete $scope.activeCategoryIndex;
    $scope.search.loading = false;
  };

  $scope.removeLocation = function() {
    $scope.search.location = null;
    $scope.search.geoPoint = null;
    $scope.search.geoShape = null;
  };

  $scope.openSlideShowModal = function(catIndex, picIndex, pause) {
    $scope.activeCategoryIndex = catIndex || 0;
    $scope.activePictureIndex = picIndex || 0;

    var category = $scope.categories[catIndex];
    console.info("Opening slide show on category " + category.id + " on picture " + $scope.activePictureIndex);

    var closedByUser = true;
    return ModalUtils.show('plugins/market/templates/gallery/modal_slideshow.html', 'MkGallerySlideModalCtrl', {
      category: category,
      activeSlide: picIndex,
      slideDuration: $scope.options.slideDuration,
      started: pause !== true,
      lastSlideCallback: function() {
        return $scope.fetchNextPictures()
            .then(function(res) {
              var nextCategory = res && res[0];
              var nextPicIndex = res && res[1] || 0;
              if (nextCategory) {
                closedByUser = false; // Remember that modal has been closed dynamically
                $scope.openSlideShowModal($scope.activeCategoryIndex, nextPicIndex, false);
              }
            });
      }
    }).then(function(picIndex) {
      if (closedByUser && picIndex !== undefined) {
        console.info("User closed, on picture index: " + picIndex);
        $scope.activePictureIndex = picIndex;
      }
    });
  };

  /* -- Load category's pictures -- */

  $scope.fetchNextPictures = function(forceNextCategory) {
    if (!$scope.categories || !$scope.categories.length) return $q.when(); // Skip - no categories

    $scope.search.size = $scope.search.size || 0;

    if ($scope.activeCategoryIndex >= $scope.categories.length -1) {
      $scope.activeCategoryIndex = undefined; // Loop
    }

    // First category
    if ($scope.activeCategoryIndex === undefined) {
      $scope.activeCategoryIndex = 0;
      $scope.search.from = 0;
    }
    // Next category
    else if (forceNextCategory || $scope.search.hasMore === false) {
      $scope.activeCategoryIndex++;
      $scope.search.from = 0;
    }
    else {
      $scope.search.from += $scope.search.size;
    }

    // Get the category
    var category = $scope.categories[$scope.activeCategoryIndex];
    var now = Date.now();
    console.info("Loading pictures for category : " + category.id + "...");

    var request = {
      categories:  _.pluck(category.children, 'id'),
      text: $scope.search.text,
      type: $scope.search.type === 'all' ? undefined : $scope.search.type,
      withStock: !$scope.search.showClosed,
      withOld: !$scope.search.showOld,
      from: $scope.search.from,
      size: $scope.search.size,
      location: $scope.search.location,
      geoPoint: $scope.search.geoPoint,
      geoShape: $scope.search.geoShape
    };
    $scope.search.loading = (request.from === 0);

    // Load category's pictures
    return mkRecord.record.pictures(request)
      .then(function(res) {

        var hits = res && res.hits || [];

        // user has cancelled (e.g. using stop() )
        if (!$scope.categories) return;

        // No pictures found: loop to next category
        if (!hits.length) {
          console.info('No pictures found in category ' + category.id + '. Skipping');
          category.pictures = [];
          $scope.search.total = (request.from > 0) ? $scope.search.total : (res.total || 0);
          $scope.search.hasMore = false;
          return $scope.fetchNextPictures(true);
        }

        // Replace results, or concat if offset
        if (!request.from) {
          category.pictures = hits;
          $scope.search.total = res.total;
        }
        else {
          category.pictures = category.pictures.concat(hits);
        }
        $scope.search.hasMore = category.pictures.length < $scope.search.total;

        console.info('[market] [category] ' + category.pictures.length + '/'+ $scope.search.total +' pictures fetched in ' + (Date.now() - now) + 'ms');

        // Return the active category, and the new index
        return [category, request.from];
      });
  };

  $scope.isLoadedCategory = function(cat) {
    return cat.pictures && cat.pictures.length>0;
  };

}

function MkGallerySlideModalController($scope, $http, $interval, $ionicSlideBoxDelegate, $timeout, UIUtils, parameters) {
  'ngInject';

  $scope.zoomMin = 1;
  $scope.activeSlide = parameters && parameters.activeSlide || 0;
  $scope.category = parameters && parameters.category || {};
  $scope.lastSlideCallback = parameters && parameters.lastSlideCallback || undefined;
  $scope.started = parameters && parameters.started !== false;
  $scope.motion = UIUtils.motion.fadeSlideInRight;

  $scope.options = {
    slideDuration: parameters && parameters.slideDuration || 5000
  };

  $scope.shown = function() {
    if ($scope.started) {
      $scope.startTimer();
    }
  };
  $scope.$on('modal.shown', $scope.shown);

  $scope.startTimer = function() {

    if ($scope.interval) {
      $interval.cancel($scope.interval);
    }

    console.debug('[market] [gallery] Start slideshow (' + $scope.options.slideDuration + 'ms)');
    $scope.interval = $interval(function() {
      $scope.nextSlide();
    }, $scope.options.slideDuration);

    $scope.showDescription();
  };

  $scope.stopTimer = function() {
    if ($scope.interval) {
      console.debug('[market] [gallery] Stop slideshow');
      $interval.cancel($scope.interval);
      delete $scope.interval;
    }
  };

  $scope.slideChanged = function(index) {
    $scope.activeSlide = index;
    $scope.showDescription();
  };

  $scope.nextSlide = function() {

    // If end of category pictures
    if (!$scope.category || !$scope.category.pictures || !$scope.category.pictures.length || $scope.activeSlide === $scope.category.pictures.length-1) {
      if (typeof $scope.lastSlideCallback === 'function') {
        $scope.loading = true;
        $scope.stopTimer();
        // Wait the callback to be ended, before close
        return $scope.lastSlideCallback()
          .then(function() {
            // Close (with a delay to wait new modal to be open)
            return $timeout($scope.closeModal, 500);
          });
      }
      else {
        $scope.closeModal();
        $scope.showDescription();
      }
    }
    else {
      $scope.activeSlide++;
      console.debug('[market] [gallery] Slide index=' + $scope.activeSlide);
      $scope.showDescription();
    }
  };

  $scope.showDescription = function() {
    var record = $scope.category.pictures[$scope.activeSlide];
    if (record && record.description && !record.showDescription) {
      $timeout(function() {
        record.showDescription = true;
      }, 500);
    }
  };

  $scope.updateSlideStatus = function(slide) {
    var zoomFactor = $ionicScrollDelegate.$getByHandle('scroll' + slide).getScrollPosition().zoom;
    if (zoomFactor === $scope.zoomMin) {
      $ionicSlideBoxDelegate.enableSlide(true);
    } else {
      $ionicSlideBoxDelegate.enableSlide(false);
    }
  };

  $scope.stopAndCloseModal = function() {
    $scope.stopTimer();
    $scope.closeModal($scope.activeSlide);
  };
}
