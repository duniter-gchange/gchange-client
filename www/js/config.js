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
			"geoDistance": "50km",
			"cesiumApi": {
				"enable": true,
				"baseUrl": "https://g1.duniter.fr/api"
			}
		},
		"converse": {
			"enable": true,
			"jid": "anonymous.duniter.org",
			"bosh_service_url": "https://chat.duniter.org/http-bind/",
			"auto_join_rooms": [
				"gchange@muc.duniter.org"
			]
		}
	},
	"version": "1.1.5",
	"build": "2020-02-07T07:17:01.084Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;