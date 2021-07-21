# Build Gchange as an unhosted web application

Gchange can be build as a simple web application, portable and runnable anywhere.

## Prerequisites

### Install the development environment

Follow all the steps defined in the [Development guide](./development_guide.md).

After that you should be able to start the application using `npm start`or `yarn run start`, and to test it.

## Build the unhosted web application


- To create a compressed ZIP artifact, run:
  ```bash
     cd gchange-client
     gulp webBuild --release
  ```
  
  A ZIP archive will be visible `dist/web/build/gchange-vx.y.z.zip`

## Publishing to a web site 

Uncompress the web archive, then open the `ìndex.html` file in your web browser.
