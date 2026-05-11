FROM python:3.11-slim-bookworm
WORKDIR /app

# wkhtmltopdf with patched Qt — the apt package on Bookworm is a reduced build
# that crashes on PDF generation; use the official 0.12.6.1 release instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libfontconfig1 \
    libfreetype6 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libssl3 \
    fonts-dejavu-core \
    xfonts-75dpi \
    xfonts-base \
  && curl -fsSL -o /tmp/wkhtmltox.deb \
    "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.bookworm_amd64.deb" \
  && apt-get install -y /tmp/wkhtmltox.deb \
  && rm /tmp/wkhtmltox.deb \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
