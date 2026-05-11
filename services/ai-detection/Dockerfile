FROM python:3.11-slim
WORKDIR /app

# requirements.txt is minimal — install known deps directly
RUN pip install --no-cache-dir fastapi uvicorn scikit-learn pandas numpy

COPY . .

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
