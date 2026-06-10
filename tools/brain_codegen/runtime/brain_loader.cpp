#include "brain_loader.h"

#include <string>

namespace engine {
namespace brain {
namespace {

bool is_element( engine::XmlNode * node ) {
    return node != nullptr && node->type() == rapidxml::node_element;
}

std::string node_name( engine::XmlNode * node ) {
    if ( node == nullptr ) return "";

    std::string tag( node->name(), node->name_size() );
    if ( tag == "Leaf" ) {
        return engine::xmlget<std::string>( node, "type" );
    }
    return tag;
}

engine::XmlNode * first_element( engine::XmlNode * node ) {
    if ( node == nullptr ) return nullptr;
    for ( auto child = node->first_node(); child; child = child->next_sibling() ) {
        if ( is_element( child ) ) return child;
    }
    return nullptr;
}

uint32_t element_child_count( engine::XmlNode * node ) {
    uint32_t count = 0;
    if ( node == nullptr ) return count;
    for ( auto child = node->first_node(); child; child = child->next_sibling() ) {
        if ( is_element( child ) ) ++count;
    }
    return count;
}

Node * load_node( engine::XmlNode * xml, const Registry & registry, uint32_t & nextid )
{
    if ( !is_element( xml ) ) {
        return nullptr;
    }

    auto name = node_name( xml );
    if ( name.empty() ) {
        return nullptr;
    }

    auto node = registry.create( name, xml );
    if ( node == nullptr ) {
        return nullptr;
    }

    node->bind( nextid );
    ++nextid;

    if ( auto composite = dynamic_cast<Composite *>( node ) ) {
        for ( auto child = xml->first_node(); child; child = child->next_sibling() ) {
            if ( !is_element( child ) ) continue;

            auto childNode = load_node( child, registry, nextid );
            if ( childNode == nullptr ) {
                delete node;
                return nullptr;
            }
            composite->add( childNode );
        }
        return node;
    }

    if ( auto decorator = dynamic_cast<Decorator *>( node ) ) {
        if ( element_child_count( xml ) != 1 ) {
            delete node;
            return nullptr;
        }

        auto childNode = load_node( first_element( xml ), registry, nextid );
        if ( childNode == nullptr ) {
            delete node;
            return nullptr;
        }
        decorator->set( childNode );
        return node;
    }

    if ( element_child_count( xml ) != 0 ) {
        delete node;
        return nullptr;
    }

    return node;
}

engine::XmlNode * behavior_root( engine::XmlNode * root ) {
    if ( root == nullptr ) return nullptr;
    if ( !is_element( root ) ) return first_element( root );

    std::string tag( root->name(), root->name_size() );
    if ( tag == "BehaviorTree" ) {
        return first_element( root );
    }
    return root;
}

} // namespace

Tree * Loader::load( engine::XmlNode * root, const Registry & registry ) {
    auto behavior = behavior_root( root );
    if ( behavior == nullptr ) {
        return nullptr;
    }

    uint32_t nextid = 0;
    auto node = load_node( behavior, registry, nextid );
    if ( node == nullptr ) {
        return nullptr;
    }

    return new Tree( node, nextid );
}

Tree * Loader::load( const char * path, const Registry & registry ) {
    if ( path == nullptr ) {
        return nullptr;
    }

    engine::XmlFile xmlfile( path );
    engine::XmlRawDoc document;
    document.parse<0>( xmlfile.data() );
    return load( first_element( &document ), registry );
}

} // namespace brain
} // namespace engine
