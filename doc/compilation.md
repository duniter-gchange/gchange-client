# Compile from sources

## Prerequisite  

To build Cesium, you will have to: 
 
  - Installing build tools:
```
 sudo apt-get install git wget curl unzip build-essential software-properties-common ruby ruby-dev ruby-ffi gcc make
```

  - Installing [nvm](https://github.com/creationix/nvm)
```
  wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.35.1/install.sh | bash
```

> Then reload your terminal, for instance by executing the commande `bash`

  - Configure NodeJS to use a version 10:
```
  nvm install 10
```
      
  - Installing node.js build tools, as global dependencies:
```
   npm install -g yarn gulp cordova ionic
```

## Get the source code
   
  - Getting source and installing project dependencies:    
```
  git clone git@git.duniter.org:marketplaces/gchange-client.git
  cd gchange-client
  yarn
```

  - Installing Cordova plugins (need for platforms specific builds)   
```
  ionic cordova prepare
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
  ionic serve
```
 
> or alternative: `yarn run start` or `npm start` 

## Best practices for development

 ğchange could be run on phone devices. Please read [performance tips on AgularJS + Ionic ](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
 before starting to contribute.
 Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
