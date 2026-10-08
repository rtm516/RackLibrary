#!/usr/bin/env bash
# Builds libemf2svg as a static wasm library. Its CMake build insists on
# fontconfig and argp, so the library sources are compiled directly instead.
set -euxo pipefail

PREFIX=${PREFIX:-/opt/deps}
LIBEMF2SVG_VERSION=1.8.1

cd /build/src-deps
curl -fsSL "https://github.com/kakwa/libemf2svg/archive/refs/tags/${LIBEMF2SVG_VERSION}.tar.gz" | tar xz
SRC="/build/src-deps/libemf2svg-${LIBEMF2SVG_VERSION}"
for p in /build/patches/libemf2svg-*.patch; do
  patch -p1 -l -d "$SRC" < "$p"
done

mkdir -p emf2svg-build && cd emf2svg-build
CFLAGS="-O2 -fwasm-exceptions -sUSE_LIBPNG=1 -sUSE_FREETYPE=1 -sUSE_ZLIB=1 \
  -DE2S_VERSION=\"${LIBEMF2SVG_VERSION}\" \
  -I/build/stubs -I$SRC/inc -I$SRC/vendor/libuemf \
  -Wno-implicit-function-declaration -Wno-int-conversion -Wno-incompatible-pointer-types"

SOURCES=(
  "$SRC"/src/lib/*.c
  "$SRC"/vendor/libuemf/uemf_utf.c
  "$SRC"/vendor/libuemf/uemf_endian.c
  "$SRC"/vendor/libuemf/uemf.c
  "$SRC"/vendor/libuemf/upmf.c
)
for f in "${SOURCES[@]}"; do
  emcc $CFLAGS -c "$f" -o "$(basename "${f%.c}").o"
done
emar rcs libemf2svg.a ./*.o

mkdir -p "$PREFIX/lib" "$PREFIX/include"
cp libemf2svg.a "$PREFIX/lib/"
cp "$SRC"/inc/emf2svg.h "$PREFIX/include/"
