// WebAssembly entry point: converts Visio stencils/drawings to SVG.
//
// Adapted from libvisio2svg (https://github.com/kakwa/libvisio2svg, GPLv2) by
// Pierre-Francois Carpentier. Differences from upstream:
//   - single parse pass (page titles are captured by the SVG generator itself)
//   - results keep document order and duplicate names
//   - no WMF support (libwmf needs font files on disk)
//   - output is returned to JavaScript via embind instead of written to disk

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <emf2svg.h>
#include <librevenge-generators/librevenge-generators.h>
#include <librevenge-stream/librevenge-stream.h>
#include <librevenge/librevenge.h>
#include <libvisio/libvisio.h>
#include <libxml/parser.h>
#include <libxml/tree.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

using emscripten::val;

namespace {

// SVG generator that also records the name of every page it emits.
class NamedSVGGenerator : public librevenge::RVNGSVGDrawingGenerator {
  public:
    NamedSVGGenerator(librevenge::RVNGStringVector &pages,
                      std::vector<std::string> &names)
        : librevenge::RVNGSVGDrawingGenerator(pages, ""), m_pages(pages),
          m_names(names) {}

    void startPage(const librevenge::RVNGPropertyList &propList) override {
        m_pending = propList["draw:name"] ? propList["draw:name"]->getStr().cstr() : "";
        librevenge::RVNGSVGDrawingGenerator::startPage(propList);
    }

    void endPage() override {
        librevenge::RVNGSVGDrawingGenerator::endPage();
        while (m_names.size() < m_pages.size())
            m_names.push_back(m_pending);
    }

  private:
    librevenge::RVNGStringVector &m_pages;
    std::vector<std::string> &m_names;
    std::string m_pending;
};

struct Stats {
    int emfConverted = 0;
    int emfFailed = 0;
    int wmfSkipped = 0;
    int blobCounter = 0;
};

void replaceAll(std::string &s, const std::string &from, const std::string &to) {
    for (size_t pos = s.find(from); pos != std::string::npos; pos = s.find(from, pos + to.size()))
        s.replace(pos, from.size(), to);
}

// Namespaces the ids (and references to them) in an emf2svg fragment.
std::string prefixIds(std::string svg, const std::string &prefix) {
    replaceAll(svg, " id=\"", " id=\"" + prefix);
    replaceAll(svg, "url(#", "url(#" + prefix);
    replaceAll(svg, "href=\"#", "href=\"#" + prefix);
    return svg;
}

const char EMF_PREFIX[] = "data:image/emf;base64,";
const char WMF_PREFIX[] = "data:image/wmf;base64,";

std::vector<unsigned char> base64Decode(const char *in, size_t len) {
    static int table[256];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < 256; i++)
            table[i] = -1;
        const char *chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (int i = 0; i < 64; i++)
            table[(unsigned char)chars[i]] = i;
        init = true;
    }
    std::vector<unsigned char> out;
    out.reserve(len * 3 / 4);
    unsigned buf = 0;
    int bits = 0;
    for (size_t i = 0; i < len; i++) {
        unsigned char c = in[i];
        if (c == '=')
            break;
        int v = table[c];
        if (v < 0)
            continue; // whitespace
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push_back((buf >> bits) & 0xFF);
        }
    }
    return out;
}

double attrDouble(xmlNode *node, const char *name) {
    xmlChar *v = xmlGetProp(node, (const xmlChar *)name);
    if (!v)
        return 0;
    double d = atof((const char *)v);
    xmlFree(v);
    return d;
}

// Replace an <image> holding an EMF blob with the vector SVG emf2svg produces.
bool replaceEmfImage(xmlNode *image, const char *href, Stats &stats) {
    double x = attrDouble(image, "x");
    double y = attrDouble(image, "y");
    double width = attrDouble(image, "width");
    double height = attrDouble(image, "height");

    std::vector<unsigned char> emf =
        base64Decode(href + sizeof(EMF_PREFIX) - 1, strlen(href) - (sizeof(EMF_PREFIX) - 1));
    if (emf.empty())
        return false;

    generatorOptions options = {};
    options.nameSpace = NULL;
    options.verbose = false;
    options.emfplus = true;
    // With svgDelimiter, emf2svg wraps its output in an <svg> sized to the image
    // and shifts the drawing by the EMF's bounds origin; without it that shift
    // is skipped, so EMFs whose bounds don't start at (0,0) land off-target.
    // The nested <svg> also clips the drawing to the picture frame, as Visio does.
    options.svgDelimiter = true;
    options.imgWidth = width;
    options.imgHeight = height;

    char *svgOut = NULL;
    size_t svgLen = 0;
    int ok = emf2svg((char *)emf.data(), emf.size(), &svgOut, &svgLen, &options);
    if (!ok || !svgOut) {
        free(svgOut);
        return false;
    }

    // emf2svg's clip-path ids restart for every blob; make them unique.
    std::string prefix = "emf" + std::to_string(++stats.blobCounter) + "_";
    std::string fragment = prefixIds(std::string(svgOut, svgLen), prefix);
    free(svgOut);

    xmlDocPtr blob = xmlReadMemory(fragment.data(), (int)fragment.size(), NULL, NULL,
                                   XML_PARSE_RECOVER | XML_PARSE_NOBLANKS | XML_PARSE_NONET |
                                       XML_PARSE_NOERROR | XML_PARSE_NOWARNING | XML_PARSE_HUGE);
    xmlNode *blobRoot = blob ? xmlDocGetRootElement(blob) : NULL;
    if (!blobRoot) {
        if (blob)
            xmlFreeDoc(blob);
        return false;
    }

    // emf2svg keeps the EMF's own aspect ratio and shrinks one side to fit; Visio
    // stretches the picture to fill its box. Keep emf2svg's size as the viewBox
    // and stretch it to the full image box.
    double drawnWidth = attrDouble(blobRoot, "width");
    double drawnHeight = attrDouble(blobRoot, "height");
    if (drawnWidth > 0 && drawnHeight > 0 && width > 0 && height > 0) {
        char buf[128];
        snprintf(buf, sizeof buf, "0 0 %f %f", drawnWidth, drawnHeight);
        xmlSetProp(blobRoot, (const xmlChar *)"viewBox", (const xmlChar *)buf);
        xmlSetProp(blobRoot, (const xmlChar *)"preserveAspectRatio", (const xmlChar *)"none");
        snprintf(buf, sizeof buf, "%f", width);
        xmlSetProp(blobRoot, (const xmlChar *)"width", (const xmlChar *)buf);
        snprintf(buf, sizeof buf, "%f", height);
        xmlSetProp(blobRoot, (const xmlChar *)"height", (const xmlChar *)buf);
    }

    // <g> carrying the image's attributes, translated to the image position.
    xmlNode *group = xmlNewNode(NULL, (const xmlChar *)"g");
    char translate[96];
    snprintf(translate, sizeof translate, " translate(%f,%f)", x, y);
    bool hasTransform = false;
    for (xmlAttr *a = image->properties; a; a = a->next) {
        const char *n = (const char *)a->name;
        if (!strcmp(n, "href") || !strcmp(n, "x") || !strcmp(n, "y") || !strcmp(n, "width") ||
            !strcmp(n, "height"))
            continue;
        xmlChar *value = xmlNodeListGetString(image->doc, a->children, 1);
        if (!strcmp(n, "transform")) {
            hasTransform = true;
            value = xmlStrcat(value, (const xmlChar *)translate);
        }
        xmlNewProp(group, a->name, value);
        xmlFree(value);
    }
    if (!hasTransform)
        xmlNewProp(group, (const xmlChar *)"transform", (const xmlChar *)translate);

    xmlAddChildList(group, xmlDocCopyNodeList(image->doc, blobRoot));
    xmlFreeDoc(blob);

    xmlReplaceNode(image, group);
    xmlFreeNode(image);
    stats.emfConverted++;
    return true;
}

void convertImages(xmlNode *node, Stats &stats) {
    for (xmlNode *cur = node; cur;) {
        xmlNode *next = cur->next;
        if (cur->type == XML_ELEMENT_NODE && !xmlStrcmp(cur->name, (const xmlChar *)"image")) {
            xmlChar *href = xmlGetProp(cur, (const xmlChar *)"href");
            if (href && !xmlStrncmp(href, (const xmlChar *)EMF_PREFIX, sizeof(EMF_PREFIX) - 1)) {
                if (!replaceEmfImage(cur, (const char *)href, stats))
                    stats.emfFailed++;
            } else if (href && !xmlStrncmp(href, (const xmlChar *)WMF_PREFIX, sizeof(WMF_PREFIX) - 1)) {
                stats.wmfSkipped++;
            }
            if (href)
                xmlFree(href);
        } else if (cur->children) {
            convertImages(cur->children, stats);
        }
        cur = next;
    }
}

std::string postProcess(const librevenge::RVNGString &page, Stats &stats) {
    xmlDocPtr doc = xmlReadMemory(page.cstr(), (int)page.size(), NULL, NULL,
                                  XML_PARSE_RECOVER | XML_PARSE_NOBLANKS | XML_PARSE_NONET |
                                      XML_PARSE_NOERROR | XML_PARSE_NOWARNING | XML_PARSE_HUGE);
    xmlNode *root = doc ? xmlDocGetRootElement(doc) : NULL;
    if (!root) {
        if (doc)
            xmlFreeDoc(doc);
        return page.cstr();
    }
    convertImages(root, stats);

    xmlBufferPtr buffer = xmlBufferCreate();
    xmlNodeDump(buffer, doc, root, 0, 0);
    std::string result((const char *)xmlBufferContent(buffer), xmlBufferLength(buffer));
    xmlBufferFree(buffer);
    xmlFreeDoc(doc);
    return result;
}

// Converts a .vss/.vssx/.vsd/.vsdx file. `stencil` selects masters (true) or pages.
// Returns { ok, error?, shapes: [{ name, svg }], stats: {...} }.
val convert(const std::string &bytes, bool stencil) {
    val result = val::object();
    val shapes = val::array();
    result.set("shapes", shapes);

    librevenge::RVNGStringStream input((const unsigned char *)bytes.data(), bytes.size());
    if (!libvisio::VisioDocument::isSupported(&input)) {
        result.set("ok", false);
        result.set("error", std::string("Unsupported file format, or the file is encrypted"));
        return result;
    }
    input.seek(0, librevenge::RVNG_SEEK_SET);

    librevenge::RVNGStringVector pages;
    std::vector<std::string> names;
    NamedSVGGenerator generator(pages, names);
    bool parsed = stencil ? libvisio::VisioDocument::parseStencils(&input, &generator)
                          : libvisio::VisioDocument::parse(&input, &generator);
    if (!parsed) {
        result.set("ok", false);
        result.set("error", std::string("libvisio failed to parse the document"));
        return result;
    }

    Stats stats;
    for (unsigned i = 0; i < pages.size(); i++) {
        val shape = val::object();
        shape.set("name", i < names.size() ? names[i] : std::string());
        shape.set("svg", postProcess(pages[i], stats));
        shapes.call<void>("push", shape);
    }

    val s = val::object();
    s.set("emfConverted", stats.emfConverted);
    s.set("emfFailed", stats.emfFailed);
    s.set("wmfSkipped", stats.wmfSkipped);
    result.set("stats", s);
    result.set("ok", true);
    return result;
}

} // namespace

EMSCRIPTEN_BINDINGS(visio2svg) {
    emscripten::function("convert", &convert);
}
