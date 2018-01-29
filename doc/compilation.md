# Compile from sources

## Prerequisite  

To build Cesium, you will have to: 
 
  - Installing build tools:
```
 sudo apt-get install build-essential
```

  - Installing [nvm](https://github.com/creationix/nvm)
```
  wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
```

> Then reload your terminal, for instance by executing the commande `bash`

  - Configure NodeJS to use a version 8:
```
  nvm install 5
```
      
  - Installing node.js build tools:
```
   npm install -g gulp bower@1.8.0 cordova@6.5.0 ionic@1.7.16
```

## Get the source code
   
  - Getting source and installing project dependencies:    
```
  git clone https://github.com/duniter-gchange/gchange-client.git
  cd gchange-client
  git submodule update --init
  git submodule sync
  npm install
```

  - Installing Cordova plugins (need for platforms specific builds)   
```
  ionic state restore
  ionic browser add crosswalk@12.41.296.5
```


## Prepare environment, then compile and launch

 - To configure your build environment :
 
    * Add your environment config into `app/config.json`
   
    * Update default configuration, using the command:

```
  gulp config --env <your_env_name> 
```

> This will update the configuration file used by cesium, at `www/js/config.json`.
 
  - Compiling and running Cesium:
```
  npm start
```
 
> or alternative: `ionic serve` 

## Best pratices for development

 ğchange could be run on phone devices. Please read [performance tips on AgularJS + Ionic ](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
 before starting to contribute.
 Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
