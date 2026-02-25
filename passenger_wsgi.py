import sys
import os

# Añadir el directorio de la aplicación al path
INTERP = os.path.join(os.environ['HOME'], 'virtualenv', 'myrentalhost-concierge', '3.9', 'bin', 'python3')
if sys.executable != INTERP:
    os.execl(INTERP, INTERP, *sys.argv)

# Añadir directorio actual al path
sys.path.append(os.getcwd())

# Importar la aplicación Flask
from app import application

# Esta es la aplicación WSGI que Passenger usará
def application(environ, start_response):
    return application(environ, start_response)
