"""
Integración con WhatsApp Business API para MyRentalHost Concierge
Este módulo maneja el envío y recepción de mensajes por WhatsApp
"""

import requests
import os
from typing import Dict, Optional

class WhatsAppClient:
    """Cliente para interactuar con WhatsApp Business API"""
    
    def __init__(self):
        self.access_token = os.environ.get('WHATSAPP_ACCESS_TOKEN')
        self.phone_number_id = os.environ.get('WHATSAPP_PHONE_NUMBER_ID')
        self.api_version = 'v18.0'
        self.base_url = f'https://graph.facebook.com/{self.api_version}'
        
    def send_message(self, to: str, message: str) -> Dict:
        """
        Envía un mensaje de texto por WhatsApp
        
        Args:
            to: Número de teléfono del destinatario (formato internacional sin +)
            message: Texto del mensaje a enviar
            
        Returns:
            Respuesta de la API de WhatsApp
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'text',
            'text': {
                'preview_url': False,
                'body': message
            }
        }
        
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error enviando mensaje de WhatsApp: {e}")
            return {'error': str(e)}
    
    def send_template_message(self, to: str, template_name: str, 
                             language_code: str = 'es') -> Dict:
        """
        Envía un mensaje usando una plantilla aprobada
        
        Args:
            to: Número de teléfono del destinatario
            template_name: Nombre de la plantilla aprobada
            language_code: Código del idioma (default: 'es')
            
        Returns:
            Respuesta de la API de WhatsApp
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'messaging_product': 'whatsapp',
            'to': to,
            'type': 'template',
            'template': {
                'name': template_name,
                'language': {
                    'code': language_code
                }
            }
        }
        
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error enviando plantilla de WhatsApp: {e}")
            return {'error': str(e)}
    
    def mark_as_read(self, message_id: str) -> Dict:
        """
        Marca un mensaje como leído
        
        Args:
            message_id: ID del mensaje recibido
            
        Returns:
            Respuesta de la API
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'messaging_product': 'whatsapp',
            'status': 'read',
            'message_id': message_id
        }
        
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error marcando mensaje como leído: {e}")
            return {'error': str(e)}


class GuestPhoneRegistry:
    """
    Registro simple de asociación entre números de teléfono y apartamentos
    En producción, esto debería estar en una base de datos
    """
    
    def __init__(self, storage_file='guest_phone_registry.json'):
        self.storage_file = storage_file
        self.registry = self._load_registry()
    
    def _load_registry(self) -> Dict:
        """Carga el registro desde archivo"""
        import json
        if os.path.exists(self.storage_file):
            with open(self.storage_file, 'r') as f:
                return json.load(f)
        return {}
    
    def _save_registry(self):
        """Guarda el registro en archivo"""
        import json
        with open(self.storage_file, 'w') as f:
            json.dump(self.registry, f, indent=2)
    
    def register_guest(self, phone_number: str, apartment_id: str, 
                       guest_name: Optional[str] = None):
        """
        Registra un huésped con su número de teléfono y apartamento
        
        Args:
            phone_number: Número de teléfono del huésped
            apartment_id: ID del apartamento asignado
            guest_name: Nombre del huésped (opcional)
        """
        self.registry[phone_number] = {
            'apartment_id': apartment_id,
            'guest_name': guest_name,
            'registered_at': datetime.now().isoformat()
        }
        self._save_registry()
    
    def get_apartment_id(self, phone_number: str) -> Optional[str]:
        """Obtiene el ID del apartamento asociado a un número de teléfono"""
        guest_info = self.registry.get(phone_number)
        return guest_info['apartment_id'] if guest_info else None
    
    def unregister_guest(self, phone_number: str):
        """Elimina el registro de un huésped"""
        if phone_number in self.registry:
            del self.registry[phone_number]
            self._save_registry()


def process_whatsapp_message(webhook_data: Dict, whatsapp_client: WhatsAppClient,
                            guest_registry: GuestPhoneRegistry,
                            concierge_api_url: str) -> Dict:
    """
    Procesa un mensaje entrante de WhatsApp y genera una respuesta
    
    Args:
        webhook_data: Datos del webhook de WhatsApp
        whatsapp_client: Cliente de WhatsApp
        guest_registry: Registro de huéspedes
        concierge_api_url: URL de la API del conciergue
        
    Returns:
        Resultado del procesamiento
    """
    try:
        # Extraer información del mensaje
        entry = webhook_data['entry'][0]
        changes = entry['changes'][0]
        value = changes['value']
        
        if 'messages' not in value:
            return {'status': 'no_message'}
        
        message = value['messages'][0]
        from_number = message['from']
        message_id = message['id']
        
        # Verificar que sea un mensaje de texto
        if message['type'] != 'text':
            whatsapp_client.send_message(
                from_number,
                "Lo siento, solo puedo procesar mensajes de texto por el momento."
            )
            return {'status': 'unsupported_type'}
        
        message_text = message['text']['body']
        
        # Marcar mensaje como leído
        whatsapp_client.mark_as_read(message_id)
        
        # Obtener apartamento del huésped
        apartment_id = guest_registry.get_apartment_id(from_number)
        
        if not apartment_id:
            # Si no está registrado, pedir que se comunique con soporte
            whatsapp_client.send_message(
                from_number,
                "¡Hola! 👋 Para poder ayudarte, necesito saber en qué apartamento te alojas. "
                "Por favor, contacta con nuestro equipo de soporte para completar tu registro."
            )
            return {'status': 'guest_not_registered'}
        
        # Llamar a la API del conciergue
        import requests
        response = requests.post(
            f"{concierge_api_url}/chat",
            json={
                'guest_id': from_number,
                'apartment_id': apartment_id,
                'message': message_text
            }
        )
        
        if response.ok:
            data = response.json()
            assistant_response = data['response']
            
            # Enviar respuesta por WhatsApp
            whatsapp_client.send_message(from_number, assistant_response)
            
            return {
                'status': 'success',
                'from': from_number,
                'apartment': apartment_id,
                'message': message_text,
                'response': assistant_response
            }
        else:
            # Error en la API del conciergue
            whatsapp_client.send_message(
                from_number,
                "Disculpa, estoy teniendo problemas técnicos. "
                "Por favor, intenta de nuevo en unos momentos o contacta con nuestro equipo."
            )
            return {'status': 'api_error'}
            
    except Exception as e:
        print(f"Error procesando mensaje de WhatsApp: {e}")
        return {'status': 'error', 'error': str(e)}


# Ejemplo de uso
if __name__ == '__main__':
    # Crear cliente de WhatsApp
    wa_client = WhatsAppClient()
    
    # Crear registro de huéspedes
    guest_reg = GuestPhoneRegistry()
    
    # Ejemplo: Registrar un huésped
    guest_reg.register_guest(
        phone_number='34612345678',
        apartment_id='apt-barcelona-001',
        guest_name='Juan Pérez'
    )
    
    # Ejemplo: Enviar mensaje de bienvenida
    wa_client.send_message(
        to='34612345678',
        message='¡Bienvenido a tu apartamento en Barcelona! 🏠\n\n'
                'Soy tu conciergue virtual. Estoy aquí para ayudarte con cualquier '
                'duda sobre el apartamento o recomendaciones en Barcelona.\n\n'
                '¿En qué puedo ayudarte?'
    )
