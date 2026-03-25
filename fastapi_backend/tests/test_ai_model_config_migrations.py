from pathlib import Path


def test_ai_model_configs_provider_column_has_migration():
    versions_dir = Path(__file__).resolve().parents[1] / "alembic_migrations" / "versions"
    migration_texts = [path.read_text(encoding="utf-8") for path in versions_dir.glob("*.py")]

    assert any(
        "op.add_column(\"ai_model_configs\"" in text and '"provider"' in text
        for text in migration_texts
    ), "Expected an Alembic migration adding ai_model_configs.provider"
