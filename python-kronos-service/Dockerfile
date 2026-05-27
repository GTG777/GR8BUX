FROM python:3.11-slim

ARG KRONOS_GIT_URL=
ARG INSTALL_TORCH_CPU=true

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential && rm -rf /var/lib/apt/lists/*

# Copy service code
COPY ./python-kronos-service /app/python-kronos-service

# If user has a local kronos/ clone at repo root, copy it into the image
COPY ./kronos /app/kronos

WORKDIR /app/python-kronos-service

# Install service requirements
RUN pip install --no-cache-dir -r requirements-service.txt

# Install PyTorch (CPU) by default; user can set INSTALL_TORCH_CPU to false
RUN if [ "${INSTALL_TORCH_CPU}" = "true" ]; then \
      pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch; \
    fi

# If kronos is not present we can optionally clone it at build time (set KRONOS_GIT_URL)
RUN if [ -n "${KRONOS_GIT_URL}" ] && [ ! -d "/app/kronos" ]; then \
      git clone "${KRONOS_GIT_URL}" /app/kronos; \
    fi

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8000"]
