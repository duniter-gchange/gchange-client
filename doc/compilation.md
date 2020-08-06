# Compile from sources

## In a post-it

```bash
nvm use 10
git clone git@github.com:duniter-gchange/gchange-client.git
cd gchange-client
yarn
yarn run start
```

## Step by step

### Prerequisite  

To build Cesium, you will have to: 
 
  - Installing build tools:
```
 sudo apt-get install git wget curl unzip build-essential software-properties-common gcc make
```

  - Installing [nvm](https://github.com/creationix/nvm)
    ```bash
       wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.1/install.sh | bash
    ```

    > Alternatively, if you are using `fish shell`, there is a [dedicated plugin](https://github.com/jorgebucaran/fish-nvm).

    Then reload your terminal, for instance by executing the command `bash`

  - Configure NodeJS to use a version 10:
    ```bash
      nvm install 10
    ```
      
  - Installing node.js build tools, as global dependencies:
    ```bash
       npm install -g yarn gulp cordova@8.1.2 @ionic/cli web-ext
    ```

### Get the source code

1. Getting the source code:        
   ```bash
     git clone git@github.com:duniter-gchange/gchange-client.git
   ```
   
2. Install project dependencies:    
   ```bash
      cd gchange-client
      yarn
   ```
   
3. Installing Cordova plugins (required to build Android and iOS artifacts): 
   ```bash
      export JAVA_HOME=/path/to/jdk-8
      export PATH=$JAVA_HOME/bin:$PATH
      ionic cordova prepare
   ```

   This should create new directories `platforms/android` and `platforms/ios`.

   > As a reminder: make sure your command line has been well configured:
   > - You must place yourself in the directory of the application: `cd gchange-client`
   > - and working with NodeJs **v10**: `nvm use 10` (please check using the command `node --version`)


### Prepare configuration file

Configure your environment :
 
1. Add your environment config into `app/config.json`

2. Update default configuration, using the command:
   ```bash
     gulp config --env <your_env_name> 
   ```

   This will update the configuration file used by cesium, at `www/js/config.json`.

### Compile and launch

To compile and launch, run:
```bash
  yarn run start
```
 
> or alternative: `npm start` or `ionic serve` 

### Time to code !

#### Pull request

For each pull request, please create an issue first.

#### Best practices for development

ğchange could be run on phone devices. Please read [performance tips on AgularJS + Ionic](http://julienrenaux.fr/2015/08/24/ultimate-angularjs-and-ionic-performance-cheat-sheet/)
before starting to contribute.
 
Read also [Angular performance for large applicatoins](https://www.airpair.com/angularjs/posts/angularjs-performance-large-applications). 
