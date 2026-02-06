from fastapi.routing import APIRoute


def simple_generate_unique_route_id(route: APIRoute):
    tag = route.tags[0] if route.tags else "default"
    return f"{tag}-{route.name}"
