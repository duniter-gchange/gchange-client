Need node 12, and yarn (/!\ and NOT NPM!)

# Steps to build from sources

- Install node JS v12:
  `nvm use 12`

- Clone the project (or use attached sources)
  ```
  git clone git@github.com:duniter-gchange/gchange-client.git
  cd gchange-client
  ```

- Install global deps
  `npm install -g gulp @ionic/cli web-ext`

- Install project deps: /!\ do NOT used NPM!!
  `yarn install`

- Compile sources /!\ This step was missing in last version - sorry !!
  `gulp build`

- Build the extension: 
  `gulp webExtBuild --release`

Artifacts should be inside: 'dist/web/build'


