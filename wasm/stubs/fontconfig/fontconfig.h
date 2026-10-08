/*
 * Minimal fontconfig stand-in for the wasm build of libemf2svg.
 *
 * libemf2svg only uses fontconfig to locate a TTF file on disk so it can
 * reverse-map glyph-index encoded text. There are no font files in the
 * browser, so FcNameParse() returns NULL and the caller falls back to
 * emitting the text as-is.
 */
#ifndef RACKLIBRARY_FONTCONFIG_STUB_H
#define RACKLIBRARY_FONTCONFIG_STUB_H

#include <stddef.h>

typedef unsigned char FcChar8;
typedef int FcBool;
typedef enum { FcResultMatch, FcResultNoMatch } FcResult;
typedef enum { FcMatchPattern, FcMatchFont } FcMatchKind;
typedef struct _FcPattern FcPattern;
typedef struct _FcObjectSet FcObjectSet;
typedef struct _FcConfig FcConfig;
typedef struct {
    int nfont;
    int sfont;
    FcPattern **fonts;
} FcFontSet;

#define FC_FILE "file"
#define FC_SLANT "slant"
#define FC_WEIGHT "weight"
#define FC_SLANT_ITALIC 100
#define FC_WEIGHT_THIN 0
#define FC_WEIGHT_EXTRALIGHT 40
#define FC_WEIGHT_LIGHT 50
#define FC_WEIGHT_BOOK 75
#define FC_WEIGHT_REGULAR 80
#define FC_WEIGHT_MEDIUM 100
#define FC_WEIGHT_DEMIBOLD 180
#define FC_WEIGHT_BOLD 200
#define FC_WEIGHT_HEAVY 210
#define FC_WEIGHT_BLACK 210

static inline FcPattern *FcNameParse(const FcChar8 *name) { (void)name; return NULL; }
static inline FcBool FcConfigSubstitute(FcConfig *c, FcPattern *p, FcMatchKind k) { (void)c; (void)p; (void)k; return 0; }
static inline FcBool FcPatternAddInteger(FcPattern *p, const char *o, int i) { (void)p; (void)o; (void)i; return 0; }
static inline FcPattern *FcFontMatch(FcConfig *c, FcPattern *p, FcResult *r) { (void)c; (void)p; if (r) *r = FcResultNoMatch; return NULL; }
static inline FcFontSet *FcFontSetCreate(void) { return NULL; }
static inline FcBool FcFontSetAdd(FcFontSet *s, FcPattern *p) { (void)s; (void)p; return 0; }
static inline void FcFontSetDestroy(FcFontSet *s) { (void)s; }
static inline void FcPatternDestroy(FcPattern *p) { (void)p; }
static inline FcPattern *FcPatternFilter(FcPattern *p, const FcObjectSet *os) { (void)p; (void)os; return NULL; }
static inline FcResult FcPatternGetString(const FcPattern *p, const char *o, int n, FcChar8 **s) { (void)p; (void)o; (void)n; if (s) *s = NULL; return FcResultNoMatch; }
static inline void FcObjectSetDestroy(FcObjectSet *os) { (void)os; }
static inline void FcFini(void) {}

#endif
