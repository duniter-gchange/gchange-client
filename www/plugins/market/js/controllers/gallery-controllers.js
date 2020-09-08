angular.module('cesium.market.gallery.controllers', ['cesium.market.record.services', 'cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.market_gallery', {
        cache: true,
        url: "/market/gallery",
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/gallery/view_gallery.html",
            controller: 'MkViewGalleryCtrl'
          }
        }
      });
  })

  .controller('MkViewGalleryCtrl', MkViewGalleryController)

;

function MkViewGalleryController($scope, csConfig, $q, $ionicScrollDelegate, $ionicSlideBoxDelegate, $ionicModal, $interval, mkRecord) {

  // Initialize the super class and extend it.
  $scope.zoomMin = 1;
  $scope.categories = [];
  $scope.pictures = [];
  $scope.activeSlide = 0;
  $scope.activeCategory = null;
  $scope.activeCategoryIndex = 0;
  $scope.started = false;

  $scope.options = $scope.options || angular.merge({
    category: {
      filter: undefined
    },
    slideDuration: 5000, // 5 sec
    showClosed: false
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

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

  $scope.resetSlideShow = function() {
    delete $scope.activeCategory;
    delete $scope.activeCategoryIndex;
    delete $scope.activeSlide;
    delete $scope.categories;
  };

  $scope.startSlideShow = function(options) {


    // Already load: continue
    if ($scope.activeCategory && $scope.activeCategory.pictures && $scope.activeCategory.pictures.length) {
      return $scope.showPicturesModal($scope.activeCategoryIndex,$scope.activeSlide);
    }

    options = options || {};
    options.filter = options.filter || ($scope.options && $scope.options.category && $scope.options.category.filter);
    options.withStock = (!$scope.options || !$scope.options.showClosed);
    options.withOld = $scope.options && $scope.options.showOld;

    $scope.stop();

    $scope.loading = true;

    delete $scope.activeCategory;
    delete $scope.activeCategoryIndex;
    delete $scope.activeSlide;

    return mkRecord.category.stats(options)
      .then(function(res) {
        // Exclude empty categories
        $scope.categories = _.filter(res, function(cat) {
          return cat.count > 0 && cat.children && cat.children.length;
        });

        // Increment category
        return $scope.nextCategory();
      })
      .then(function() {
        $scope.loading = false;
      })
      .catch(function(err) {
        console.error(err);
        $scope.loading = false;
      })
      .then(function() {
        if ($scope.categories && $scope.categories.length) {
          return $scope.showPicturesModal(0,0);
        }
      });
  };

  $scope.showPicturesModal = function(catIndex, picIndex, pause) {
    $scope.activeCategoryIndex = catIndex;
    $scope.activeSlide = picIndex;

    $scope.activeCategory = $scope.categories[catIndex];

    if ($scope.modal) {
      $ionicSlideBoxDelegate.slide(picIndex);
      $ionicSlideBoxDelegate.update();
      return $scope.modal.show()
        .then(function() {
          if (!pause) {
            $scope.start();
          }
        });
    }

    return $ionicModal.fromTemplateUrl('plugins/market/templates/gallery/modal_slideshow.html',
      {
        scope: $scope
      })
      .then(function(modal) {
        $scope.modal = modal;
        $scope.modal.scope.closeModal = $scope.hidePictureModal;
        // Cleanup the modal when we're done with it!
        $scope.$on('$destroy', function() {
          if ($scope.modal) {
            $scope.modal.remove();
            delete $scope.modal;
          }
        });

        return $scope.modal.show()
          .then(function() {
            if (!pause) {
              $scope.start();
            }
          });
      });

  };

  $scope.hidePictureModal = function() {
    $scope.stop();
    if ($scope.modal && $scope.modal.isShown()) {
      return $scope.modal.hide();
    }
    return $q.when();
  };

  $scope.start = function() {
    if ($scope.interval) {
      $interval.cancel($scope.interval);
    }

    console.debug('[market] [gallery] Start slideshow');
    $scope.interval = $interval(function() {
      $scope.nextSlide();
    }, $scope.options.slideDuration);

  };

  $scope.stop = function() {
    if ($scope.interval) {
      console.debug('[market] [gallery] Stop slideshow');
      $interval.cancel($scope.interval);
      delete $scope.interval;
    }
  };

  /* -- manage slide box slider-- */

  $scope.nextCategory = function(started) {
    if (!$scope.categories || !$scope.categories.length) return $q.when();

    started = started || !!$scope.interval;

    // Make sure sure to stop slideshow
    if (started && $scope.modal.isShown()) {
      return $scope.hidePictureModal()
        .then(function(){
          return $scope.nextCategory(started);
        });
    }

    $scope.activeCategoryIndex = $scope.loading ? 0 : $scope.activeCategoryIndex+1;

    // End of slideshow: restart (reload all)
    if ($scope.activeCategoryIndex === $scope.categories.length) {

      $scope.resetSlideShow();

      if (started) {
        return $scope.startSlideShow();
      }
      return $q.when();
    }

    var category = $scope.categories[$scope.activeCategoryIndex];

    // Load pictures
    return mkRecord.record.pictures({
      categories:  _.pluck(category.children, 'id'),
      size: 1000,
      withStock: (!$scope.options || !$scope.options.showClosed)
    })
      .then(function(pictures) {
        category.pictures = pictures;
        if (started) {
          return $scope.showPicturesModal($scope.activeCategoryIndex,0);
        }
      });
  };

  $scope.nextSlide = function() {

    // If end of category pictures
    if (!$scope.activeCategory || !$scope.activeCategory.pictures || !$scope.activeCategory.pictures.length || $ionicSlideBoxDelegate.currentIndex() == $scope.activeCategory.pictures.length-1) {
      $scope.nextCategory();
    }
    else {
      $ionicSlideBoxDelegate.next();
    }
  };

  $scope.updateSlideStatus = function(slide) {
    var zoomFactor = $ionicScrollDelegate.$getByHandle('scrollHandle' + slide).getScrollPosition().zoom;
    if (zoomFactor == $scope.zoomMin) {
      $ionicSlideBoxDelegate.enableSlide(true);
    } else {
      $ionicSlideBoxDelegate.enableSlide(false);
    }
  };

  $scope.isLoadedCategory = function(cat) {
    return cat.pictures && cat.pictures.length>0;
  };

  $scope.slideChanged = function(index) {
    $scope.activeSlide = index;
  };
}
