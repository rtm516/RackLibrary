# Builds libvisio2svg (libvisio + librevenge + libemf2svg) as a WebAssembly module.
#
#   docker build -t racklibrary-wasm wasm
#   docker run --rm -v "$PWD/public/wasm:/out" racklibrary-wasm
#
FROM emscripten/emsdk:6.0.11

RUN apt-get update \
 && apt-get install -y --no-install-recommends autoconf automake libtool pkg-config gperf xz-utils curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PREFIX=/opt/deps
WORKDIR /build

# Pre-build the emscripten ports we depend on so their headers land in the sysroot.
RUN embuilder build zlib libpng freetype icu boost_headers

COPY build-deps.sh /build/build-deps.sh
RUN bash /build/build-deps.sh

COPY stubs /build/stubs
COPY patches /build/patches
COPY build-emf2svg.sh /build/build-emf2svg.sh
RUN bash /build/build-emf2svg.sh

COPY src /build/src
COPY build-module.sh /build/build-module.sh
RUN bash /build/build-module.sh

CMD ["sh", "-c", "cp /build/dist/* /out/"]
