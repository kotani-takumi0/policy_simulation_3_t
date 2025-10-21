.PHONY: dev db_upgrade test

dev:
	uvicorn backend.app.main:app --reload

db_upgrade:
	alembic upgrade head

test:
	pytest -q
