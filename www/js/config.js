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
	"useRelative": false,
	"decimalCount": 2,
	"shareBaseUrl": "https://gchange.fr",
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
	"share": {
		"mastodonAuthor": "@gchange@framapiaf.org"
	},
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
				"baseUrl": "https://demo.cesium.app/api"
			}
		},
		"converse": {
			"enable": false,
			"jid": "anonymous.duniter.org",
			"bosh_service_url": "https://chat.duniter.org/http-bind/",
			"auto_join_rooms": [
				"gchange@muc.duniter.org"
			]
		}
	},
	"version": "1.4.0",
	"build": "2021-07-19T16:33:02.256Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;
