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
	"node": {
		"host": "localhost",
		"port": "9200",
		"useSsl": false
	},
	"plugins": {
		"es": {
			"enable": true,
			"host": "localhost",
			"port": "9200",
			"useSsl": false,
			"maxUploadBodySize": 5242880,
			"defaultCountry": "France"
		},
		"market": {
			"enable": true,
			"searchDistance": "50km",
			"cesiumApi": {
				"enable": true,
				"baseUrl": "https://g1.duniter.fr/api"
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
	"version": "1.0.1",
	"build": "2020-01-03T23:44:43.846Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;
