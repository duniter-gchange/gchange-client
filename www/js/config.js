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
	"helptip": {
		"enable": false
	},
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
			"enable": true,
			"defaultCurrency": "€",
			"homeMessage": "<i class=\"icon ion-location\"></i> Vide-grenier de Villiers-charlemagne",
			"defaultTags": [
				{
					"tag": "VideGrenier",
					"name": "Vide-grenier"
				},
				{
					"tag": "VillersCharlemagne2017",
					"name": "Vide-grenier de Villiers-charlemagne"
				}
			],
			"defaultAdminPubkeys": [
				"CohjkoP5YnqzTV2wwdCFND74BDDmDR7dAQEPGt4tj2Tw",
				"GWAKPVoMdQw1LYqcWW8jckzox9VwNXGt6cQ1L5gNt3E9"
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
	"version": "0.4.2",
	"build": "2017-06-24T16:10:05.625Z",
	"newIssueUrl": "https://github.com/duniter-gchange/gchange-client/issues/new?labels=bug"
})

;