FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_PROFILE=cloud
WORKDIR /app

# REQUIREMENTS=local builds the full image with scikit-learn.
ARG REQUIREMENTS=cloud
COPY requirements ./requirements
RUN pip install --no-cache-dir -r requirements/${REQUIREMENTS}.txt

COPY app ./app
EXPOSE 8787
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8787}"]
