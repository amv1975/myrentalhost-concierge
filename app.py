"""
MyRentalHost Concierge - Backend API
Sistema de conciergue inteligente para huéspedes
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import hmac
import hashlib
import threading
from collections import OrderedDict
from datetime import datetime
import anthropic
from werkzeug.utils import secure_filename
import PyPDF2
import docx
from pathlib import Path

from whatsapp_integration import WhatsAppClient, GuestPhoneRegistry

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Configuración
# DATA_DIR: en Railway apuntarlo al punto de montaje de un Volume; sin volumen,
# los documentos y el historial se pierden en cada deploy.
DATA_DIR = os.environ.get('DATA_DIR', '.')
UPLOAD_FOLDER = os.path.join(DATA_DIR, 'apartments_data')
HISTORY_FOLDER = os.path.join(DATA_DIR, 'chat_history')
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Crear carpetas necesarias
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(HISTORY_FOLDER, exist_ok=True)

# Cliente de Anthropic (configurar con tu API key)
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
CLAUDE_MODEL = os.environ.get('CLAUDE_MODEL', 'claude-sonnet-5-5')
MAX_HISTORY_MESSAGES = 20  # mensajes previos que se envían al modelo

# Clave para el panel y la API de administración (todo menos el webhook y /health)
ADMIN_KEY = os.environ.get('ADMIN_KEY', '')
OPEN_ENDPOINTS = {'health_check', 'whatsapp_webhook', 'admin_panel', 'index', 'static'}

# WhatsApp
WHATSAPP_APP_SECRET = os.environ.get('WHATSAPP_APP_SECRET', '')
# Si se define (números separados por coma, sin +), el bot solo responde a esos números.
WHATSAPP_ALLOWED_NUMBERS = {
    ''.join(ch for ch in n if ch.isdigit())
    for n in os.environ.get('WHATSAPP_ALLOWED_NUMBERS', '').split(',')
    if n.strip()
}
guest_registry = GuestPhoneRegistry(os.path.join(DATA_DIR, 'guest_phone_registry.json'))


@app.before_request
def require_admin_key():
    """Protege los endpoints de administración con la cabecera X-Admin-Key"""
    if request.method == 'OPTIONS' or request.endpoint is None or request.endpoint in OPEN_ENDPOINTS:
        return None
    if not ADMIN_KEY:
        return jsonify({'error': 'ADMIN_KEY no está configurada en el servidor'}), 503
    provided = request.headers.get('X-Admin-Key', '')
    if not hmac.compare_digest(provided.encode('utf-8'), ADMIN_KEY.encode('utf-8')):
        return jsonify({'error': 'No autorizado'}), 401
    return None

def allowed_file(filename):
    """Verifica si el archivo tiene una extensión permitida"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(filepath):
    """Extrae texto de un archivo PDF"""
    text = ""
    try:
        with open(filepath, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
    except Exception as e:
        print(f"Error extrayendo texto del PDF: {e}")
    return text

def extract_text_from_docx(filepath):
    """Extrae texto de un archivo Word"""
    text = ""
    try:
        doc = docx.Document(filepath)
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
    except Exception as e:
        print(f"Error extrayendo texto del Word: {e}")
    return text

def load_apartment_info(apartment_id):
    """Carga la información de un apartamento desde sus documentos"""
    apartment_folder = os.path.join(UPLOAD_FOLDER, apartment_id)
    
    if not os.path.exists(apartment_folder):
        return None
    
    apartment_info = {
        'apartment_id': apartment_id,
        'documents': [],
        'full_text': ""
    }
    
    # Leer todos los documentos del apartamento
    for filename in os.listdir(apartment_folder):
        filepath = os.path.join(apartment_folder, filename)
        
        if filename.endswith('.pdf'):
            text = extract_text_from_pdf(filepath)
        elif filename.endswith('.docx') or filename.endswith('.doc'):
            text = extract_text_from_docx(filepath)
        else:
            continue
        
        apartment_info['documents'].append({
            'filename': filename,
            'content': text
        })
        apartment_info['full_text'] += f"\n\n=== {filename} ===\n{text}"
    
    return apartment_info

def get_concierge_system_prompt(apartment_info):
    """Genera el prompt del sistema para el conciergue"""
    return f"""Eres el conciergue virtual de MyRentalHost para el apartamento {apartment_info['apartment_id']} en Barcelona.

Tu función es ayudar a los huéspedes con cualquier duda o necesidad durante su estancia. Debes ser:
- Amable, profesional y servicial
- Claro y conciso en tus respuestas
- Proactivo en ofrecer información relevante
- Capaz de manejar emergencias con calma

INFORMACIÓN DEL APARTAMENTO:
{apartment_info['full_text']}

INSTRUCCIONES IMPORTANTES:
1. Responde en el idioma en que te escriba el huésped (español si no está claro), de forma natural y conversacional
2. Si el huésped pregunta algo que está en la documentación, proporciona la respuesta exacta
3. Para recomendaciones de Barcelona, usa tu conocimiento general de la ciudad
4. Si hay una emergencia, proporciona los contactos de emergencia del apartamento
5. Si no tienes información específica, sé honesto y ofrece contactar con el equipo de MyRentalHost
6. Mantén un tono cálido pero profesional, como un conciergue de hotel de lujo
7. Personaliza tus respuestas según el contexto de la conversación

Recuerda: Tu objetivo es hacer que la estancia del huésped sea lo más cómoda y agradable posible."""

def get_general_system_prompt():
    """Prompt para un contacto de WhatsApp que aún no está asociado a un apartamento"""
    return """Eres el conciergue virtual de MyRentalHost, empresa de gestión de apartamentos en Barcelona. Atiendes por WhatsApp.

Todavía NO sabes en qué apartamento se aloja esta persona, ni si es huésped.

INSTRUCCIONES IMPORTANTES:
1. Responde en el idioma en que te escriban (español si no está claro), de forma breve y natural, como en un chat
2. Si necesitas datos del alojamiento para ayudar, pide el nombre o la dirección del apartamento, o el código de reserva
3. NUNCA inventes datos concretos de un apartamento o de una reserva: wifi, códigos de acceso, direcciones, horarios de check-in o check-out, precios, normas. Si te los piden, di que el equipo de MyRentalHost se lo confirmará
4. Puedes dar recomendaciones generales de Barcelona con tu conocimiento de la ciudad
5. Ante una emergencia (fuego, salud, seguridad), indica que llamen al 112
6. No prometas plazos ni acciones del equipo que no puedas garantizar
7. Mantén un tono cálido y profesional"""

def _history_path(guest_id, suffix=''):
    """Ruta del archivo de historial de un huésped (nombre saneado)"""
    safe_id = secure_filename(str(guest_id)) or 'unknown'
    return os.path.join(HISTORY_FOLDER, f'{safe_id}{suffix}.json')

def get_chat_history(guest_id):
    """Obtiene el historial de chat de un huésped"""
    history_file = _history_path(guest_id)
    if os.path.exists(history_file):
        with open(history_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_chat_history(guest_id, history):
    """Guarda el historial de chat de un huésped"""
    history_file = _history_path(guest_id)
    with open(history_file, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

_guest_locks = {}
_guest_locks_guard = threading.Lock()

def _guest_lock(guest_id):
    """Un lock por huésped: evita que dos mensajes seguidos pisen el historial"""
    with _guest_locks_guard:
        return _guest_locks.setdefault(str(guest_id), threading.Lock())

def generate_reply(guest_id, system_prompt, message):
    """Añade el mensaje al historial, pide la respuesta a Claude y la guarda.
    Lanza excepción si la llamada falla (el historial no se modifica en ese caso)."""
    with _guest_lock(guest_id):
        chat_history = get_chat_history(guest_id)
        chat_history.append({
            'role': 'user',
            'content': message,
            'timestamp': datetime.now().isoformat()
        })

        api_messages = [
            {'role': msg['role'], 'content': msg['content']}
            for msg in chat_history
            if msg['role'] in ['user', 'assistant']
        ][-MAX_HISTORY_MESSAGES:]
        while api_messages and api_messages[0]['role'] != 'user':
            api_messages.pop(0)

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1000,
            system=system_prompt,
            messages=api_messages
        )
        assistant_message = ''.join(
            block.text for block in response.content if block.type == 'text'
        ).strip()
        if not assistant_message:
            raise RuntimeError('Respuesta vacía del modelo')

        chat_history.append({
            'role': 'assistant',
            'content': assistant_message,
            'timestamp': datetime.now().isoformat()
        })
        save_chat_history(guest_id, chat_history)
        return assistant_message

def save_guest_info(guest_id, apartment_id):
    """Guarda la asociación entre huésped y apartamento"""
    guest_file = _history_path(guest_id, '_info')
    info = {
        'guest_id': guest_id,
        'apartment_id': apartment_id,
        'created_at': datetime.now().isoformat()
    }
    with open(guest_file, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=2)

def load_guest_info(guest_id):
    """Carga la información de un huésped"""
    guest_file = _history_path(guest_id, '_info')
    if os.path.exists(guest_file):
        with open(guest_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de verificación de salud"""
    return jsonify({'status': 'healthy', 'service': 'MyRentalHost Concierge'})

@app.route('/apartments', methods=['GET'])
def list_apartments():
    """Lista todos los apartamentos registrados"""
    apartments = []
    if os.path.exists(UPLOAD_FOLDER):
        apartments = [d for d in os.listdir(UPLOAD_FOLDER) 
                     if os.path.isdir(os.path.join(UPLOAD_FOLDER, d))]
    return jsonify({'apartments': apartments})

@app.route('/apartments/<apartment_id>/documents', methods=['GET'])
def list_documents(apartment_id):
    """Lista los documentos de un apartamento"""
    apartment_folder = os.path.join(UPLOAD_FOLDER, apartment_id)
    
    if not os.path.exists(apartment_folder):
        return jsonify({'error': 'Apartamento no encontrado'}), 404
    
    documents = [f for f in os.listdir(apartment_folder) 
                if allowed_file(f)]
    
    return jsonify({
        'apartment_id': apartment_id,
        'documents': documents
    })

@app.route('/apartments/<apartment_id>/upload', methods=['POST'])
def upload_document(apartment_id):
    """Sube un documento para un apartamento"""
    
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'Nombre de archivo vacío'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Tipo de archivo no permitido'}), 400
    
    # Crear carpeta del apartamento si no existe
    apartment_folder = os.path.join(UPLOAD_FOLDER, apartment_id)
    os.makedirs(apartment_folder, exist_ok=True)
    
    # Guardar archivo
    filename = secure_filename(file.filename)
    filepath = os.path.join(apartment_folder, filename)
    file.save(filepath)
    
    return jsonify({
        'message': 'Documento subido exitosamente',
        'apartment_id': apartment_id,
        'filename': filename
    })

@app.route('/apartments/<apartment_id>/documents/<filename>', methods=['DELETE'])
def delete_document(apartment_id, filename):
    """Elimina un documento de un apartamento"""
    filepath = os.path.join(UPLOAD_FOLDER, apartment_id, secure_filename(filename))
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'Documento no encontrado'}), 404
    
    os.remove(filepath)
    
    return jsonify({
        'message': 'Documento eliminado exitosamente',
        'apartment_id': apartment_id,
        'filename': filename
    })

@app.route('/chat', methods=['POST'])
def chat():
    """
    Endpoint principal para el chat del conciergue
    Espera: {
        "guest_id": "identificador_unico_huesped",
        "apartment_id": "identificador_apartamento",
        "message": "mensaje del huésped"
    }
    """
    data = request.json
    
    guest_id = data.get('guest_id')
    apartment_id = data.get('apartment_id')
    message = data.get('message')
    
    if not guest_id or not message:
        return jsonify({'error': 'guest_id y message son requeridos'}), 400
    
    # Si no se proporciona apartment_id, intentar cargarlo del historial
    if not apartment_id:
        guest_info = load_guest_info(guest_id)
        if guest_info:
            apartment_id = guest_info['apartment_id']
        else:
            return jsonify({'error': 'apartment_id es requerido para nuevos huéspedes'}), 400
    else:
        # Guardar la asociación huésped-apartamento
        save_guest_info(guest_id, apartment_id)
    
    # Cargar información del apartamento
    apartment_info = load_apartment_info(apartment_id)
    
    if not apartment_info:
        return jsonify({'error': f'No se encontró información para el apartamento {apartment_id}'}), 404
    
    # Generar respuesta con Claude (añade al historial y lo guarda)
    try:
        assistant_message = generate_reply(
            guest_id, get_concierge_system_prompt(apartment_info), message
        )

        return jsonify({
            'response': assistant_message,
            'apartment_id': apartment_id,
            'guest_id': guest_id
        })
        
    except Exception as e:
        print(f"Error al generar respuesta: {e}")
        return jsonify({'error': 'Error al procesar la solicitud'}), 500

@app.route('/chat/<guest_id>/history', methods=['GET'])
def get_history(guest_id):
    """Obtiene el historial de chat de un huésped"""
    history = get_chat_history(guest_id)
    guest_info = load_guest_info(guest_id)
    
    return jsonify({
        'guest_id': guest_id,
        'apartment_id': guest_info['apartment_id'] if guest_info else None,
        'history': history
    })

@app.route('/chat/<guest_id>/reset', methods=['POST'])
def reset_chat(guest_id):
    """Reinicia el historial de chat de un huésped"""
    history_file = _history_path(guest_id)
    if os.path.exists(history_file):
        os.remove(history_file)
    
    return jsonify({
        'message': 'Historial reiniciado exitosamente',
        'guest_id': guest_id
    })

@app.route('/guests', methods=['GET', 'POST'])
def guests():
    """
    GET: lista los huéspedes registrados (teléfono -> apartamento)
    POST: registra un huésped. Espera: {"phone": "34612345678", "apartment_id": "...", "guest_name": "..."}
    """
    if request.method == 'GET':
        return jsonify({'guests': guest_registry.registry})

    data = request.get_json(silent=True) or {}
    phone = ''.join(ch for ch in str(data.get('phone', '')) if ch.isdigit())
    apartment_id = data.get('apartment_id')

    if not phone or not apartment_id:
        return jsonify({'error': 'phone y apartment_id son requeridos'}), 400

    if not os.path.isdir(os.path.join(UPLOAD_FOLDER, secure_filename(apartment_id))):
        return jsonify({'error': f'No se encontró el apartamento {apartment_id}'}), 404

    guest_registry.register_guest(phone, apartment_id, data.get('guest_name'))
    return jsonify({'message': 'Huésped registrado', 'phone': phone, 'apartment_id': apartment_id})

@app.route('/guests/<phone>', methods=['DELETE'])
def delete_guest(phone):
    """Elimina la asociación de un teléfono con su apartamento"""
    guest_registry.unregister_guest(''.join(ch for ch in phone if ch.isdigit()))
    return jsonify({'message': 'Huésped eliminado', 'phone': phone})

# IDs de mensajes ya atendidos: Meta reintenta la entrega y no hay que responder dos veces
_processed_ids = OrderedDict()
_processed_lock = threading.Lock()

def _already_processed(message_id):
    with _processed_lock:
        if message_id in _processed_ids:
            return True
        _processed_ids[message_id] = True
        while len(_processed_ids) > 2000:
            _processed_ids.popitem(last=False)
        return False

def _valid_signature(req):
    """Comprueba la firma X-Hub-Signature-256 que Meta añade a cada webhook"""
    if not WHATSAPP_APP_SECRET:
        print("AVISO: WHATSAPP_APP_SECRET no configurado, no se verifica la firma del webhook")
        return True
    expected = 'sha256=' + hmac.new(
        WHATSAPP_APP_SECRET.encode('utf-8'), req.get_data(), hashlib.sha256
    ).hexdigest()
    provided = req.headers.get('X-Hub-Signature-256', '')
    return hmac.compare_digest(provided.encode('utf-8'), expected.encode('utf-8'))

def handle_whatsapp_message(message):
    """Atiende un mensaje entrante de WhatsApp: genera la respuesta y la envía"""
    from_number = message.get('from')
    wa_client = WhatsAppClient()
    try:
        if WHATSAPP_ALLOWED_NUMBERS and from_number not in WHATSAPP_ALLOWED_NUMBERS:
            print(f"Mensaje de {from_number} ignorado (no está en WHATSAPP_ALLOWED_NUMBERS)")
            return

        wa_client.mark_as_read(message.get('id'))

        if message.get('type') != 'text':
            wa_client.send_message(
                from_number,
                "Por ahora solo puedo leer mensajes de texto. ¿Me lo puedes escribir?\n"
                "For now I can only read text messages. Could you type it out?"
            )
            return

        message_text = message['text']['body']

        # Apartamento del huésped, si su teléfono está registrado
        apartment_id = guest_registry.get_apartment_id(from_number)
        apartment_info = load_apartment_info(apartment_id) if apartment_id else None
        if apartment_info:
            system_prompt = get_concierge_system_prompt(apartment_info)
        else:
            system_prompt = get_general_system_prompt()

        reply = generate_reply(from_number, system_prompt, message_text)
        result = wa_client.send_message(from_number, reply)
        if 'error' in result:
            print(f"No se pudo enviar la respuesta a {from_number}: {result['error']}")

    except Exception as e:
        print(f"Error atendiendo mensaje de WhatsApp de {from_number}: {e}")
        wa_client.send_message(
            from_number,
            "Disculpa, estoy teniendo un problema técnico. Nuestro equipo te responderá en cuanto pueda.\n"
            "Sorry, I'm having a technical problem. Our team will get back to you as soon as possible."
        )

@app.route('/whatsapp/webhook', methods=['GET', 'POST'])
def whatsapp_webhook():
    """
    Webhook para WhatsApp Business API
    GET: Verificación del webhook
    POST: Recepción de mensajes
    """
    if request.method == 'GET':
        # Verificación del webhook
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token', '')
        challenge = request.args.get('hub.challenge', '')

        VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')

        if VERIFY_TOKEN and mode == 'subscribe' and hmac.compare_digest(
            token.encode('utf-8'), VERIFY_TOKEN.encode('utf-8')
        ):
            return challenge
        return 'Forbidden', 403

    if not _valid_signature(request):
        return 'Forbidden', 403

    # Se contesta 200 enseguida y el mensaje se atiende en segundo plano:
    # si Meta no recibe respuesta rápido, reintenta y el huésped recibiría duplicados.
    data = request.get_json(silent=True) or {}
    my_phone_number_id = os.environ.get('WHATSAPP_PHONE_NUMBER_ID')

    for entry in data.get('entry', []):
        for change in entry.get('changes', []):
            value = change.get('value', {})
            phone_number_id = value.get('metadata', {}).get('phone_number_id')
            if my_phone_number_id and phone_number_id != my_phone_number_id:
                continue
            for message in value.get('messages', []):
                if not message.get('id') or _already_processed(message['id']):
                    continue
                threading.Thread(
                    target=handle_whatsapp_message, args=(message,), daemon=True
                ).start()

    return jsonify({'status': 'received'})

@app.route('/admin.html')
def admin_panel():
    """Sirve el panel de administración"""
    return app.send_static_file('admin.html')

@app.route('/')
def index():
    """Redirige a admin"""
    return app.send_static_file('admin.html')
application = app

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
