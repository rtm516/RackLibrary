#!/usr/bin/env bash
# Links the final visio2svg.js / visio2svg.wasm module into /build/dist.
set -euxo pipefail

PREFIX=${PREFIX:-/opt/deps}
mkdir -p /build/dist

em++ -O3 -std=c++17 -fwasm-exceptions \
  -sUSE_ZLIB=1 -sUSE_ICU=1 -sUSE_BOOST_HEADERS=1 -sUSE_LIBPNG=1 -sUSE_FREETYPE=1 \
  -I"$PREFIX/include" \
  -I"$PREFIX/include/librevenge-0.0" \
  -I"$PREFIX/include/libvisio-0.1" \
  -I"$PREFIX/include/libxml2" \
  /build/src/visio2svg_wasm.cpp \
  "$PREFIX/lib/libvisio-0.1.a" \
  "$PREFIX/lib/librevenge-generators-0.0.a" \
  "$PREFIX/lib/librevenge-stream-0.0.a" \
  "$PREFIX/lib/librevenge-0.0.a" \
  "$PREFIX/lib/libemf2svg.a" \
  "$PREFIX/lib/libxml2.a" \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createVisio2Svg \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB -sINITIAL_MEMORY=64MB \
  -sSTACK_SIZE=5MB \
  -o /build/dist/visio2svg.js

ls -la /build/dist
