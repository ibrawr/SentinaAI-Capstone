FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source and supporting data files
COPY backend/ ./backend/
COPY convention_map.svg .
COPY data/ ./data/

# Tell the app where to find the SVG
ENV CONVENTION_SVG_PATH=/app/convention_map.svg
ENV PYTHONPATH=/app/backend

EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "120", "backend.app:app"]
