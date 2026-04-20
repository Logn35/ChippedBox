#!/bin/bash

# Compile editor/SongEditor.ts into beepbox_editor.js
npm exec -- tsc \
	--target ES5 \
	--ignoreDeprecations 6.0 \
	--strictNullChecks \
	--noImplicitAny \
	--noImplicitReturns \
	--noFallthroughCasesInSwitch \
	--removeComments \
	editor/SongEditor.ts \
	--outFile website/beepbox_editor.js

# Minify beepbox_editor.js into beepbox_editor.min.js
npm exec -- uglifyjs \
	--compress \
	--mangle \
	--mangle-props regex=/^_.+/ \
	website/beepbox_editor.js \
	-o website/beepbox_editor.min.js

# Combine the html and js into a single file for the offline version
sed \
	-e '/INSERT_BEEPBOX_SOURCE_HERE/{r website/beepbox_editor.min.js' -e 'd' -e '}' \
	website/beepbox_offline_template.html \
	> website/beepbox_offline.html
