# Run the Report Export Service

## 1. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

## 2. Install dependencies
pip install -r requirements.txt

## 3. Start the FastAPI server
uvicorn app.main:app --reload

## 4. Open API docs
http://127.0.0.1:8000/docs