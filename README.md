# Beaker.Network

A social aggregator application. Requires a Hyperdrive-enabled browser.

## Development

Run `npm install` to install dev deps.

To avoid having to run the build step, set the index.html script to `/index.js`. (Don't forget to restore this before committing.)

Serve the site statically (eg using `npx serve -s`). Edit your `/etc/hosts` to include a `dev.beaker.network` which points to localhost. (The address is required for Beaker to provide the correct permissions to the application.)

## Building

Run `npm run build` to produce `/index.build.js`.