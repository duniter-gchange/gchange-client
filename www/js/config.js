/******
* !! WARNING: This is a generated file !!
*
* PLEASE DO NOT MODIFY DIRECTLY
*
* => Changes should be done on file 'app/config.json'.
******/

angular.module("cesium.config", [])

.constant("csConfig", {
	"fallbackLanguage": "fr-FR",
	"defaultLanguage": "fr-FR",
	"timeout": 300000,
	"cacheTimeMs": 300000,
	"useLocalStorage": true,
	"rememberMe": true,
	"helptip": {
		"enable": false
	},
	"feed": {
		"jsonFeed": {
			"fr-FR": "https://raw.githubusercontent.com/duniter-gchange/gchange-client/master/doc/feed/feed-fr.json",
			"en": "https://raw.githubusercontent.com/duniter-gchange/gchange-client/master/doc/feed/feed-en.json"
		},
		"maxContentLength": 1300
	},
	"node": {
		"host": "localhost",
		"port": "9200"
	},
	"plugins": {
		"es": {
			"enable": true,
			"host": "localhost",
			"port": "9200",
			"wsPort": "9400",
			"defaultCountry": "France"
		},
		"market": {
			"enable": true,
			"defaultSearch": {
				"geoDistance": "50"
			}
		},
		"converse": {
			"enable": false
		}
	},
	"version": "1.2.5",
	"build": "2020-12-22T14:38:27.789Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;