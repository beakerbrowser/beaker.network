#! /bin/sh

rm -Rf ./build
mkdir ./build
cp index.* ./build/
cp -R ./js ./build/js
cp -R ./css ./build/css
cp -R ./webfonts ./build/webfonts
cp ./favicon.png ./build/favicon.png
rollup ./index.js --format iife --name main --file ./build/index.build.js
cat ./index.html | sed 's/index.js/index.build.js/' > ./build/index.html