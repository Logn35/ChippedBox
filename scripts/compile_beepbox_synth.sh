#!/bin/bash

# Compile synth/synth.ts into beepbox_synth.js
npm exec -- tsc \
	--target ES5 \
	--ignoreDeprecations 6.0 \
	--strictNullChecks \
	--noImplicitAny \
	--noImplicitReturns \
	--noFallthroughCasesInSwitch \
	--removeComments \
	synth/synth.ts \
	--outFile website/beepbox_synth.js

# Minify beepbox_synth.js into beepbox_synth.min.js
npm exec -- uglifyjs \
	--compress \
	--mangle \
	--mangle-props regex=/^_.+/ \
	website/beepbox_synth.js \
	-o website/beepbox_synth.min.js
