/******
* !! WARNING: This is a generated file !!
*
* PLEASE DO NOT MODIFY DIRECTLY
*
* => Changes should be done on file 'app/config.json'.
******/

angular.module("cesium.config", [])

.constant("csConfig", {
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
			"fr-FR": "file:///home/blavenie/git/gchange/gchange-client/doc/feed/feed-fr.json",
			"en": "https://raw.githubusercontent.com/duniter-gchange/gchange-client/master/doc/feed/feed-en.json"
		},
		"maxContentLength": 1300
	},
	"node": {
		"host": "data.gchange.fr",
		"port": "443"
	},
	"plugins": {
		"es": {
			"enable": true,
			"host": "data.gchange.fr",
			"port": "443",
			"maxUploadBodySize": 5242880,
			"defaultCountry": "France"
		},
		"market": {
			"enable": true,
			"geoDistance": "100km",
			"cesiumApi": {
				"enable": true,
				"baseUrl": "https://g1.duniter.fr/api"
			}
		},
		"converse": {
			"enable": false
		}
	},
	"version": "1.1.7",
	"build": "2020-08-17T10:51:12.778Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;