#ifndef ENGINE_BRAIN_LOADER_H
#define ENGINE_BRAIN_LOADER_H

#include "engine/game/brain.h"
#include "engine/utils/xmldocument.h"

namespace engine {
namespace brain {

class Loader {
public:
    static Tree * load( const char * path, const Registry & registry );
    static Tree * load( engine::XmlNode * root, const Registry & registry );
};

} // namespace brain
} // namespace engine

#endif // ENGINE_BRAIN_LOADER_H
