from seed_models import MANUFACTURER_LIST, MODEL_LIST


def test_seed_models_contains_12ai_image_and_video_manufacturers():
    entries = {(item["code"], item["category"]): item for item in MANUFACTURER_LIST}

    assert ("12ai", "image") in entries
    assert ("12ai", "video") in entries
    assert entries[("12ai", "image")]["default_base_url"] == "https://cdn.12ai.org"
    assert entries[("12ai", "video")]["default_base_url"] == "https://cdn.12ai.org"


def test_seed_models_contains_nanobanana_sora_and_veo_catalog_models():
    models = {(item["manufacturer_code"], item["category"], item["code"]): item for item in MODEL_LIST}

    assert ("12ai", "image", "nanobanana") in models
    assert ("12ai", "video", "sora-2") in models
    assert ("12ai", "video", "veo-3.1") in models


def test_seed_models_contains_12ai_capability_metadata():
    models = {(item["manufacturer_code"], item["category"], item["code"]): item for item in MODEL_LIST}

    nanobanana = models[("12ai", "image", "nanobanana")]
    assert nanobanana["model_capabilities"]["input_modes"] == ["text_to_image", "image_to_image"]
    assert nanobanana["model_capabilities"]["supports_reference_image"] is True

    sora = models[("12ai", "video", "sora-2")]
    assert sora["model_capabilities"]["input_modes"] == ["text_to_video", "image_to_video"]
    assert sora["model_capabilities"]["duration_options"] == [5, 10, 15]

    veo = models[("12ai", "video", "veo-3.1")]
    assert veo["model_capabilities"]["input_modes"] == ["text_to_video", "image_to_video"]
    assert veo["model_capabilities"]["supports_audio"] is True
