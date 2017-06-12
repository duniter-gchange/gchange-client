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
	"timeout": 6000,
	"cacheTimeMs": 60000,
	"useRelative": true,
	"timeWarningExpireMembership": 5184000,
	"timeWarningExpire": 7776000,
	"useLocalStorage": true,
	"rememberMe": true,
	"showUDHistory": false,
	"node": {
		"host": "g1-test.duniter.org",
		"port": "10900"
	},
	"plugins": {
		"es": {
			"enable": false,
			"host": "localhost",
			"port": "9200",
			"wsPort": "9400"
		},
		"market": {
			"defaultCurrency": "€",
			"homeMessage": "<i class=\"icon ion-location\"></i> Vide-grenier de Villiers-charlemagne",

		}
	},
	"version": "0.3.3",
	"build": "2017-06-12T16:00:42.407Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;