/**
 * Source: https://github.com/guiseek/ng-svg-styling-map/blob/master/src/component.js
 */
angular.module('ngSvgStylingMap', [])
  .component('svgMap', {
    bindings: {
      src: '@',
      init: '<',
      props: '<',
      events: '<',
      onEvent: '&'
    },
    template: `<object type="image/svg+xml" ng-attr-data="{{$ctrl.src}}"></object>`,
    controller: function ($element) {
      var ctrl = this, svg

      var getNodesAndProps = function(obj) {
        return Object.keys(obj).map(function(selector) {
          var nodes = []
          try {nodes = svg.querySelectorAll(selector)} catch (e) {}
          return {nodes, props: obj[selector], selector}
        })
      }
      var updateProps = props => {
        getNodesAndProps(props).forEach(function(control) {
          control.nodes.forEach(function(node) {
            Object.keys(control.props).forEach(function(prop) {
              node.style[prop] = control.props[prop]
            })
          })
        })
      }
      var applyProps = function() {
        if (!svg) return

        if (ctrl.init) updateProps(ctrl.init)
        if (ctrl.props) updateProps(ctrl.props)
      }
      var applyEvents = function () {
        if (!svg || !ctrl.events || !ctrl.onEvent) return false

        getNodesAndProps(ctrl.events).forEach(function(control) {
          control.nodes.forEach(node => {
            control.props.forEach(function(prop) {
              node.addEventListener(prop, function(e) {
                ctrl.onEvent({'$event': {name: prop, element: e.target, selector: control.selector, srcEvent: e}})
              }, false);
            });
          });
        })
      }
      ctrl.$onChanges = function () {return applyProps();}
      ctrl.$doCheck = function () {return applyProps();}
      ctrl.$postLink = function() {
        var object = $element[0].querySelector('object');
        object.addEventListener('load', () => {
          svg = object.contentDocument
          applyProps()
          applyEvents()
        }, false);
      }
    }
  });
