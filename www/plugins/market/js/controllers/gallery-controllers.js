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

function MkViewGalleryController($scope, csConfig, $q, $ionicScrollDelegate, $controller, $location, $ionicModal, ModalUtils, $interval, mkRecord) {

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

  $scope.search = {
    loading: false,
    text: null,
    showClosed: false,
    showOld: false
  };

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

  // When view enter: load data
  $scope.enter = function(e, state) {

    if (!$scope.entered) {
      $scope.entered = true;

      if (state && state.stateParams && state.stateParams.q)
      $scope.search.text = state.stateParams.q.trim();
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
        return $scope.nextCategory();
      })
      .then(function(category) {
        if (category) {
          const catIndex = _.findIndex($scope.categories, function(cat) {
            return cat.id === category.id;
          })
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
          $scope.search.loading = false
        });
  };


  $scope.stop = function() {
    delete $scope.activeCategoryIndex;
    delete $scope.categories;
    delete $scope.activeCategoryIndex;
    $scope.search.loading = false;
  };

  $scope.openSlideShowModal = function(catIndex, picIndex, pause) {
    $scope.activeCategoryIndex = catIndex || 0;
    $scope.activePictureIndex = picIndex || 0;

    var category = $scope.categories[catIndex];
    console.info("Opening slide show on category " + category.id + " on picture " + $scope.activePictureIndex);

    var closedByUser = true;
    var onLastSlide = function() {
      return $scope.nextCategory()
          .then(function(category) {
            if (category) {
              closedByUser = false; // Remember that modal has been closed dynamically
              $scope.openSlideShowModal($scope.activeCategoryIndex, 0, false);
            }
          });
    }

    return ModalUtils.show('plugins/market/templates/gallery/modal_slideshow.html', 'MkGallerySlideModalCtrl', {
      category: category,
      activeSlide: picIndex,
      slideDuration: $scope.options.slideDuration,
      started: pause !== true,
      lastSlideCallback: onLastSlide
    }).then(function(picIndex) {
      if (closedByUser && picIndex !== undefined) {
        console.info("User closed, on picture index: " + picIndex);
        $scope.activePictureIndex = picIndex;
      }
    });
  };

  /* -- Load category's pictures -- */

  $scope.nextCategory = function() {
    if (!$scope.categories || !$scope.categories.length) return $q.when(); // Skip - no categories

    if ($scope.activeCategoryIndex >= $scope.categories.length) {
      return $q.resolve(undefined);
    }
    if ($scope.activeCategoryIndex === undefined) {
      $scope.activeCategoryIndex = 0;
    }
    else {
      $scope.activeCategoryIndex++;
    }

    // Get the category
    var category = $scope.categories[$scope.activeCategoryIndex];
    console.info("Loading pictures for category : " + category.id + "...");

    // Load category's pictures
    return mkRecord.record.pictures({
      categories:  _.pluck(category.children, 'id'),
      text: $scope.search.text,
      withStock: !$scope.search.showClosed,
      withOld: !$scope.search.showOld,
      size: 1000
    })
      .then(function(pictures) {
        category.pictures = pictures || [];

        // user has cancelled (e.g. using stop() )
        if (!$scope.categories) return;

        // No pictures found: loop
        if (!category.pictures.length) {
          console.info('No pictures found in category ' + category.id + '. Skipping');
          return $scope.nextCategory();
        }

        // Return the active
        return category;
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
      console.debug('[market] [gallery] Go to next picture (current= ' + $scope.activeSlide + ')');
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
  }

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
  }
}
