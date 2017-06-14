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
	"timeout": 4000,
	"cacheTimeMs": 60000,
	"useLocalStorage": true,
	"rememberMe": true,
	"node": {
		"host": "g1.duniter.org",
		"port": "443"
	},
	"login": {
		"templateUrl": "plugins/market/templates/login/modal_simple_login.html"
	},
	"plugins": {
		"es": {
			"enable": true,
			"host": "data.gchange.fr",
			"port": "443"
		},
		"market": {
			"defaultCurrency": "€",
			"homeMessage": "<i class=\"icon ion-location\"></i> Vide-grenier de Villiers-charlemagne",
			"defaultTags": [
				{
					"tag": "vide-grenier",
					"name": "Vide-grenier"
				},
				{
					"tag": "villers-charlemagne-2017",
					"name": "Vide-grenier de Villiers-charlemagne"
				}
			],
			"record": {
				"type": {
					"show": false,
					"default": "offer",
					"canEdit": false
				},
				"category": {
					"show": true,
					"filter": "localSale"
				},
				"description": {
					"show": false
				},
				"location": {
					"show": true,
					"required": true,
					"label": "MARKET.LOCAL_SALE.LOCATION",
					"help": "MARKET.LOCAL_SALE.LOCATION_HELP",
					"prefix": "MARKET.LOCAL_SALE.LOCATION_PREFIX"
				},
				"unit": {
					"canEdit": false
				}
			}
		}
	},
	"version": "0.4.0",
	"build": "2017-06-14T10:59:31.142Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;