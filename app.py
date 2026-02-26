"""
MyRentalHost Concierge - Backend API
Sistema de conciergue inteligente para huéspedes
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from datetime import datetime
import anthropic
from werkzeug.utils import secure_filename
import PyPDF2
import docx
from pathlib import Path

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Configuración
UPLOAD_FOLDER = 'apartments_data'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Crear carpetas necesarias
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('chat_history', exist_ok=True)

# Cliente de Anthropic (configurar con tu API key)
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

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
1. Responde SIEMPRE en español de forma natural y conversacional
2. Si el huésped pregunta algo que está en la documentación, proporciona la respuesta exacta
3. Para recomendaciones de Barcelona, usa tu conocimiento general de la ciudad
4. Si hay una emergencia, proporciona los contactos de emergencia del apartamento
5. Si no tienes información específica, sé honesto y ofrece contactar con el equipo de MyRentalHost
6. Mantén un tono cálido pero profesional, como un conciergue de hotel de lujo
7. Personaliza tus respuestas según el contexto de la conversación

Recuerda: Tu objetivo es hacer que la estancia del huésped sea lo más cómoda y agradable posible."""

def get_chat_history(guest_id):
    """Obtiene el historial de chat de un huésped"""
    history_file = f'chat_history/{guest_id}.json'
    if os.path.exists(history_file):
        with open(history_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_chat_history(guest_id, history):
    """Guarda el historial de chat de un huésped"""
    history_file = f'chat_history/{guest_id}.json'
    with open(history_file, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

def save_guest_info(guest_id, apartment_id):
    """Guarda la asociación entre huésped y apartamento"""
    guest_file = f'chat_history/{guest_id}_info.json'
    info = {
        'guest_id': guest_id,
        'apartment_id': apartment_id,
        'created_at': datetime.now().isoformat()
    }
    with open(guest_file, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=2)

def load_guest_info(guest_id):
    """Carga la información de un huésped"""
    guest_file = f'chat_history/{guest_id}_info.json'
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
    
    # Cargar historial del chat
    chat_history = get_chat_history(guest_id)
    
    # Agregar mensaje del usuario al historial
    chat_history.append({
        'role': 'user',
        'content': message,
        'timestamp': datetime.now().isoformat()
    })
    
    # Generar respuesta con Claude
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        
        # Preparar mensajes para la API
        api_messages = [
            {'role': msg['role'], 'content': msg['content']}
            for msg in chat_history
            if msg['role'] in ['user', 'assistant']
        ]
        
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=get_concierge_system_prompt(apartment_info),
            messages=api_messages
        )
        
        assistant_message = response.content[0].text
        
        # Agregar respuesta al historial
        chat_history.append({
            'role': 'assistant',
            'content': assistant_message,
            'timestamp': datetime.now().isoformat()
        })
        
        # Guardar historial actualizado
        save_chat_history(guest_id, chat_history)
        
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
    history_file = f'chat_history/{guest_id}.json'
    if os.path.exists(history_file):
        os.remove(history_file)
    
    return jsonify({
        'message': 'Historial reiniciado exitosamente',
        'guest_id': guest_id
    })

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
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')
        
        # Verificar token (configura tu propio token)
        VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', 'myrentalhost_verify_token')
        
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            return challenge
        else:
            return 'Forbidden', 403
    
    elif request.method == 'POST':
        # Procesar mensaje entrante
        data = request.json
        
        try:
            # Extraer información del mensaje de WhatsApp
            entry = data['entry'][0]
            changes = entry['changes'][0]
            value = changes['value']
            
            if 'messages' in value:
                message = value['messages'][0]
                from_number = message['from']
                message_text = message['text']['body']
                
                # Aquí implementarías la lógica para:
                # 1. Identificar el apartamento del huésped (por número o reserva)
                # 2. Llamar al endpoint /chat con la información
                # 3. Enviar la respuesta de vuelta por WhatsApp
                
                # Por ahora, solo registramos el mensaje
                print(f"Mensaje de {from_number}: {message_text}")
                
                return jsonify({'status': 'received'})
        
        except Exception as e:
            print(f"Error procesando webhook de WhatsApp: {e}")
            return jsonify({'status': 'error'}), 500
    
    return jsonify({'status': 'ok'})
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
    app.run(debug=True, host='0.0.0.0', port=5000)
