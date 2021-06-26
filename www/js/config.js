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
		"host": "data.gchange.fr",
		"port": "443"
	},
	"fallbackNodes": [
		{
			"host": "data.gchange.fr",
			"port": "443"
		},
		{
			"host": "gchange.data.presles.fr",
			"port": "443"
		}
	],
	"plugins": {
		"es": {
			"enable": true,
			"maxUploadBodySize": 5242880,
			"defaultCountry": "France"
		},
		"market": {
			"enable": true,
			"defaultSearch": {
				"geoDistance": "50"
			},
			"cesiumApi": {
				"enable": true,
				"baseUrl": "https://g1.duniter.fr/api"
			}
		},
		"converse": {
			"enable": false
		}
	},
	"version": "1.3.1",
	"build": "2021-06-26T11:57:36.317Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;