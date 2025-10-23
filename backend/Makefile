.PHONY: dev db_upgrade db_revision db_downgrade test

dev:
	PYTHONPATH=.. uvicorn backend.app.main:app --reload

db_upgrade:
	alembic upgrade head

db_revision:
	@if [ -z "$(m)" ]; then \
		echo "Usage: make db_revision m=\"add tables\""; \
		exit 1; \
	fi
	alembic revision --autogenerate -m "$(m)"

db_downgrade:
	alembic downgrade -1

test:
	pytest -q
