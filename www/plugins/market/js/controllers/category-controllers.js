angular.module('cesium.market.category.controllers', ['cesium.market.record.services', 'cesium.market.category.services', 'cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.market_categories', {
        url: "/market/categories",
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/category/view_categories.html",
            controller: 'MkViewCategoriesCtrl'
          }
        },
        data: {
          large: 'app.market_categories_lg'
        }
      })

      .state('app.market_categories_lg', {
        url: "/market/categories/lg",
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/category/view_categories_lg.html",
            controller: 'MkViewCategoriesCtrl'
          }
        }
      })

      .state('app.market_categories_edit', {
        url: "/market/categories/edit",
        views: {
          'menuContent': {
            templateUrl: "plugins/market/templates/category/edit_categories.html",
            controller: 'MkEditCategoriesCtrl'
          }
        }
      });

  })

 .controller('MkListCategoriesCtrl', MkListCategoriesController)

 .controller('MkViewCategoriesCtrl', MkViewCategoriesController)

 .controller('MkEditCategoriesCtrl', MkEditCategoriesController)
;

function MkListCategoriesController($scope, $translate, UIUtils, csConfig, mkCategory, csSettings) {
  'ngInject';

  $scope.locale = undefined;
  $scope.loading = true;
  $scope.motion = UIUtils.motion.ripple;
  $scope.listeners = undefined;

  // Screen options
  $scope.options = $scope.options || angular.merge({
    type: undefined,
    category: {
      filter: undefined,
      withCache: false,
      withStats: true,
      withOld: false,
      withStock: true,
      nbsp: true
    },
    showClosed: false,
    showOld: false
  }, csConfig.plugins && csConfig.plugins.market && csConfig.plugins.market.record || {});

  $scope.load = function(options) {
    options = options || {};
    options.filter = options.filter || ($scope.options && $scope.options.category && $scope.options.category.filter);
    options.withStats = angular.isDefined($scope.options && $scope.options.category && $scope.options.category.withStats) ? $scope.options.category.withStats : true;
    options.withStock = angular.isDefined(options.withStock) ? options.withStock : (!$scope.options || !$scope.options.showClosed);
    options.withOld = angular.isDefined(options.withOld) ? options.withOld : (!$scope.options || $scope.options.showOld);
    options.silent = angular.isDefined(options.silent) ? options.silent : true;
    options.locale = angular.isDefined(options.locale) ? options.locale : $translate.use();
    options.type = angular.isDefined(options.type) ? options.type : $scope.search.type;
    options.nbsp = angular.isDefined(options.nbsp) ? options.nbsp : ($scope.options && $scope.options.category && $scope.options.category.nbsp);

    if (!options.silent) $scope.loading = true;

    // Remember locale
    $scope.locale = options.locale;
    angular.merge($scope.options.category, options);

    console.debug('[market] [categories] Loading...', options);

    var categoriesPromise = options.withStats ?
      mkCategory.stats(options) :
      mkCategory.filtered(options).then(mkCategory.asTree);

    return categoriesPromise
      .then(function(res) {
        res = res || [];
        if (options.nbsp) {
          res = _.map(res, function(cat) {
            cat.name = cat.name && cat.name.split(' ').join('&nbsp;');
            return cat;
          });
        }
        $scope.categories = res;
        $scope.totalCount = $scope.categories.reduce(function(res, cat) {
         return res + cat.count;
        }, 0);
        $scope.loading = false;
        if ($scope.motion.show && !options.silent) $scope.motion.show();

        // Add listeners, if need
        if (!$scope.listeners) {
          $scope.addListeners();
        }
      });
  };

  $scope.onOptionsChange = function() {
    if ($scope.loading || !$scope.locale) return; // Skip if not loaded

    var changed = (($scope.options.category.withStock || false) === $scope.options.showClosed) ||
      (($scope.options.category.withOld || false) !== $scope.options.showOld);

    // Reload data
    if (changed) {
      $scope.load();
    }
  };


  // Watch locale change, reload categories
  $scope.onLocaleChange = function(locale) {
    if (!$scope.locale || $scope.locale === locale) return; // Skip
    console.debug('[market] [categories] Need reload for locale {{0]]...'.format(locale));
    $scope.load({locale: locale, silent: true});
  };

  $scope.addListeners = function() {
    $scope.listeners = [
      $scope.$watch('options.showClosed', $scope.onOptionsChange, true),
      $scope.$watch('options.showOld', $scope.onOptionsChange, true),
      csSettings.api.locale.on.changed($scope, $scope.onLocaleChange, this)
    ];
  };

}

function MkViewCategoriesController($scope, $controller, $state) {
    'ngInject';

    $scope.entered = false;

    // Initialize the super class and extend it.
    angular.extend(this, $controller('MkListCategoriesCtrl', {$scope: $scope}));

    // When view enter: load data
    $scope.enter = function(e, state) {

      // Load data
      return $scope.load({silent: true})
          .then(function() {

            $scope.loading = false;
            if (!$scope.entered) {
              $scope.motion.show();
            }
            $scope.entered = true;
          });
    };
    $scope.$on('$ionicView.enter',$scope.enter);

    $scope.onCategoryClick = function(cat) {
        return $state.go('app.market_lookup', {category: cat && cat.id, location: ''});
    };
}

function MkEditCategoriesController($scope, $controller, $ionicPopup, $translate, $q, UIUtils, csConfig, csSettings, mkCategory) {
  'ngInject';

  $scope.entered = false;
  $scope.reorderRoot = false;
  $scope.reorderChildren = false;
  $scope.dirty = false;
  $scope.locales = angular.merge({}, csSettings.locales); // Copy locales
  $scope.defaultLocale = csSettings.fixLocale(csConfig.defaultLanguage) || 'en';
  $scope.idPattern = mkCategory.regexp.ID;

  // Initialize the super class and extend it.
  angular.extend(this, $controller('MkListCategoriesCtrl', {$scope: $scope}));

  // Override default options
  $scope.options.category.withStats = false;
  $scope.options.category.withCache = false; // Disable

  // When view enter: load data
  $scope.enter = function(e, state) {

    // Load data
    return $scope.load({silent: true, withStats: false, withCache: false})
      .then(function() {
        $scope.loading = false;
        if (!$scope.entered) {
          $scope.motion.show({selector: '.list .item'});
        }
        $scope.entered = true;
      });
  };
  $scope.$on('$ionicView.enter',$scope.enter);

  $scope.cancel = function(confirmed) {

    // Ask confirmation
    if ($scope.dirty && !confirmed) {
      return UIUtils.alert.confirm('MARKET.CATEGORY.EDIT.CONFIRM.CANCEL')
        .then(function (confirm) {
          if (!confirm) return; // user cancelled
          return $scope.cancel(true);
        });
    }

    $scope.loading = true;
    return $scope.load();
  };

  $scope.save = function() {
    if (!$scope.dirty || $scope.saving) return; // Skip

    console.debug('[market] [category] Saving categories...');
    $scope.saving = true;

    return mkCategory.saveAll($scope.categories)
      .then(function() {
        $scope.saving = false;
        $scope.dirty = false;
        UIUtils.toast.show('MARKET.CATEGORY.EDIT.INFO.SAVED'); // toast
      })
      .catch(function(err) {
        $scope.saving = false;
        console.error(err && err.message || err);
        return UIUtils.onError('MARKET.CATEGORY.EDIT.ERROR.CANNOT_SAVE')(err);
      });

  };

  $scope.getName = function(cat, useItalicIfMissing) {
    if (!cat) throw new Error('Missing category');
    var name = cat.localizedNames && cat.localizedNames[$scope.locale];
    if (!name) {
      if (useItalicIfMissing && $scope.defaultLocale !== $scope.locale) {
        var defaultName = cat.localizedNames && $scope.defaultLocale && cat.localizedNames[$scope.defaultLocale] || cat.name;
        return '<span class="text-italic">' + defaultName + '</span>';
      }
      return cat.name || '';
    }
    return name || '';
  };

  $scope.reorderRootCategory = function(rootCategory, fromIndex, toIndex) {
    if (!rootCategory || fromIndex === toIndex) return; // no changes
    $scope.categories.splice(fromIndex, 1);
    $scope.categories.splice(toIndex, 0, rootCategory);
    $scope.dirty = true;
  };

  $scope.reorderChildrenCategory = function(rootCategory, childCategory, fromIndex, toIndex) {
    if (!rootCategory || !childCategory || fromIndex === toIndex) return; // no changes
    rootCategory.children = rootCategory.children || [];
    rootCategory.children.splice(fromIndex, 1);
    rootCategory.children.splice(toIndex, 0, childCategory);
    $scope.dirty = true;
  };

  $scope.editRootCategory = function(index) {
    var root = $scope.categories[index];
    return $scope.showEditPopup(root)
      .then(function(res) {
        if (!res) return; // User cancelled

        // Copy result to source category
        angular.merge(root, res);
        $scope.dirty = true;
      });
  };

  $scope.addRootCategory = function() {
    return $scope.showEditPopup()
      .then(function(res) {
        if (!res) return; // User cancelled
        $scope.categories.push(res);
        $scope.dirty = true;
      });
  };

  $scope.editChildCategory = function(rootCategory, index) {
    var child = rootCategory.children[index];
    return $scope.showEditPopup(child, rootCategory)
      .then(function(res) {
        if (!res) return; // User cancelled
        // Copy result to source category
        angular.merge(child, res);
        $scope.dirty = true;
      });
  };

  $scope.addChildCategory = function(rootCategory) {
    return $scope.showEditPopup()
      .then(function(res) {
        if (!res) return; // User cancelled
        rootCategory.children = rootCategory.children || [];
        rootCategory.children.push(res);
        $scope.dirty = true;
      });
  };

  $scope.removeRootCategory = function(index) {
    $scope.categories.splice(index, 1);
    $scope.dirty = true;
  };

  $scope.removeChildCategory = function(rootCat, index) {
    var child = rootCat.children[index];
    rootCat.children = rootCat.children || [];
    rootCat.children.splice(index, 1);
    rootCat.count -= child.count || 0;
    $scope.dirty = true;
  };

  $scope.onChangeLocale = function(locale) {
    console.debug('[market] [category] Changing categories locale to: ' + locale.label);
    $scope.locale = locale.id;
  };

  /* -- popups -- */

  $scope.setEditForm = function(editForm) {
    $scope.editForm = editForm;
  };

  $scope.showEditPopup = function(category, parent) {
    $scope.formData = {
      id: category && category.id,
      name: category && $scope.getName(category),
      parent: parent && parent.id,
      localizedNames: category && angular.merge({}, category.localizedNames) || {}
    };
    var isNew = !category;
    var titleKey = isNew ?  'MARKET.CATEGORY.EDIT.POPUP.TITLE_NEW' : 'MARKET.CATEGORY.EDIT.POPUP.TITLE_EDIT';

    return $q(function(resolve, reject) {
      $translate([titleKey, 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {

          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'plugins/market/templates/category/popup_edit_category.html',
            title: translations[titleKey],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.editForm.$submitted=true;

                  // Check ID is unique
                  if (isNew) $scope.editForm.id.$setValidity('duplicate', $scope.checkIdNotUsed($scope.formData.id));

                  if(!$scope.editForm.$valid || !$scope.formData.id || !$scope.formData.name) {
                    //don't allow the user to close unless he enters a name
                    e.preventDefault();
                  } else {
                    return $scope.formData;
                  }
                }
              }
            ]
          })
            .then(function(updatedCategory) {
              if (!updatedCategory) { // user cancel
                delete $scope.formData;
                UIUtils.loading.hide();
                return;
              }

              // Copy name into to map
              updatedCategory.localizedNames[$scope.locale] = updatedCategory.name;

              // Restore the original name, for backward compatibility
              if (category && category.name) {
                updatedCategory.name = category.name;
              }
              else {
                delete updatedCategory.name;
              }

              resolve(updatedCategory);
            })
            .catch(reject);
        });
    });
  };

  $scope.checkIdNotUsed = function(id) {
    return _.findIndex($scope.categories || [], function(cat) {
      return cat.id === id;
    }) === -1;
  };
}

