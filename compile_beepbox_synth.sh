#!/bin/bash

# Compile ts/synth.ts into beepbox_synth.js
tsc \
	--target ES5 \
	--ignoreDeprecations 6.0 \
	--strictNullChecks \
	--noImplicitAny \
	--noImplicitReturns \
	--noFallthroughCasesInSwitch \
	--removeComments \
	ts/synth.ts \
	--outFile beepbox-synth/beepbox_synth.js

# Minify beepbox_synth.js into beepbox_synth.min.js
uglifyjs \
	--compress \
	--mangle \
	--mangle-props regex=/^_.+/ \
	beepbox-synth/beepbox_synth.js \
	-o beepbox-synth/beepbox_synth.min.js
