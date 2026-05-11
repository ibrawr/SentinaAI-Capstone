1. extract zip where u like
########################################

2. Open Command-Prompt/Powershell/Mac Terminal
cd into \Downloads\convention_navmesh_extended\backend (or wherever u extracted the zip)

########################################

2. Install dependencies
pip install -r requirements.txt
(to use pip check if u have python installed by running 'py --version')

OR (similarly)

cd convention_navmesh_extended\backend
pip install Flask flask-cors

########################################

3. stay in the backend folder, then;
py app.py
it will host the server on `http://localhost:5000`

########################################

4. open http://localhost:5000 in browser
tada ✨