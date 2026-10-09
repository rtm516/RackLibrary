#!/usr/bin/env bash
# Builds static wasm libraries for libxml2, librevenge and libvisio into $PREFIX.
set -euxo pipefail

PREFIX=${PREFIX:-/opt/deps}
LIBXML2_VERSION=2.15.4
LIBREVENGE_VERSION=0.0.5
LIBVISIO_VERSION=0.1.11

PORTS="-sUSE_ZLIB=1 -sUSE_ICU=1 -sUSE_BOOST_HEADERS=1"
export CFLAGS="-O2 -fwasm-exceptions $PORTS"
export CXXFLAGS="-O2 -fwasm-exceptions $PORTS"
export LDFLAGS="-fwasm-exceptions $PORTS"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
export EM_PKG_CONFIG_PATH="$PKG_CONFIG_PATH"

mkdir -p /build/src-deps && cd /build/src-deps

# --- libxml2 ---------------------------------------------------------------
curl -fsSL "https://download.gnome.org/sources/libxml2/${LIBXML2_VERSION%.*}/libxml2-${LIBXML2_VERSION}.tar.xz" | tar xJ
emcmake cmake -S "libxml2-${LIBXML2_VERSION}" -B libxml2-build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DBUILD_SHARED_LIBS=OFF \
  -DLIBXML2_WITH_PYTHON=OFF \
  -DLIBXML2_WITH_PROGRAMS=OFF \
  -DLIBXML2_WITH_TESTS=OFF \
  -DLIBXML2_WITH_ICONV=OFF \
  -DLIBXML2_WITH_ICU=OFF \
  -DLIBXML2_WITH_ZLIB=OFF \
  -DLIBXML2_WITH_LZMA=OFF \
  -DLIBXML2_WITH_THREADS=OFF \
  -DLIBXML2_WITH_HTTP=OFF \
  -DLIBXML2_WITH_MODULES=OFF \
  -DLIBXML2_WITH_DOCS=OFF
cmake --build libxml2-build -j"$(nproc)"
cmake --install libxml2-build

# --- librevenge ------------------------------------------------------------
curl -fsSL -o librevenge.tar.xz "https://sourceforge.net/projects/libwpd/files/librevenge/librevenge-${LIBREVENGE_VERSION}/librevenge-${LIBREVENGE_VERSION}.tar.xz/download"
tar xJf librevenge.tar.xz
cd "librevenge-${LIBREVENGE_VERSION}"
ZLIB_CFLAGS=" " ZLIB_LIBS="-sUSE_ZLIB=1" \
emconfigure ./configure --prefix="$PREFIX" \
  --disable-shared --enable-static --disable-werror --disable-tests --without-docs \
  --disable-fuzzers --disable-pretty-printers
emmake make -j"$(nproc)"
emmake make install
cd ..

# --- libvisio --------------------------------------------------------------
curl -fsSL "https://dev-www.libreoffice.org/src/libvisio/libvisio-${LIBVISIO_VERSION}.tar.xz" | tar xJ
cd "libvisio-${LIBVISIO_VERSION}"
for p in /build/patches/libvisio-*.patch; do
  patch -p1 -l < "$p"
done
ICU_CFLAGS=" " ICU_LIBS="-sUSE_ICU=1" \
emconfigure ./configure --prefix="$PREFIX" \
  --disable-shared --enable-static --disable-werror --disable-tests --without-docs \
  --disable-tools --disable-fuzzers
emmake make -j"$(nproc)"
emmake make install
cd ..
