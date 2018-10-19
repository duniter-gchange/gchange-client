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
	"node": {
		"host": "g1.duniter.fr",
		"port": "443"
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
			"enable": true
		},
		"converse": {
			"enable": false
		}
	},
	"version": "0.7.5",
	"build": "2018-10-15T15:30:05.076Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;